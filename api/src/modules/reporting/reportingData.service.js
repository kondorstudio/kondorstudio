const { prisma } = require('../../prisma');
const { getAdapter } = require('./providers');
const cache = require('./reportingCache.service');

function normalizeResult(payload) {
  const series = Array.isArray(payload?.series) ? payload.series : [];
  const table = Array.isArray(payload?.table) ? payload.table : [];
  const pie = Array.isArray(payload?.pie) ? payload.pie : [];
  const totals =
    payload && typeof payload.totals === 'object' && !Array.isArray(payload.totals)
      ? payload.totals
      : {};
  const normalized = {
    series,
    table,
    pie,
    totals,
  };
  if (payload && payload.meta) normalized.meta = payload.meta;
  return normalized;
}

function normalizeMetricsList(metrics) {
  if (!Array.isArray(metrics)) return [];
  return metrics.map((item) => String(item)).filter(Boolean);
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function resolveCompareRange({
  dateFrom,
  dateTo,
  compareMode,
  compareDateFrom,
  compareDateTo,
}) {
  const mode = compareMode ? String(compareMode).toUpperCase() : '';
  if (!mode || mode === 'NONE') return null;

  const baseFrom = parseDate(dateFrom);
  const baseTo = parseDate(dateTo);
  if (!baseFrom || !baseTo) return null;

  if (mode === 'CUSTOM') {
    const customFrom = cache.normalizeDateKey(compareDateFrom);
    const customTo = cache.normalizeDateKey(compareDateTo);
    if (!customFrom || !customTo) return null;
    return {
      mode,
      label: 'Comparacao',
      dateFrom: customFrom,
      dateTo: customTo,
    };
  }

  if (mode === 'PREVIOUS_YEAR') {
    const prevFrom = new Date(baseFrom.getTime());
    const prevTo = new Date(baseTo.getTime());
    prevFrom.setFullYear(prevFrom.getFullYear() - 1);
    prevTo.setFullYear(prevTo.getFullYear() - 1);
    return {
      mode,
      label: 'Ano anterior',
      dateFrom: cache.normalizeDateKey(prevFrom),
      dateTo: cache.normalizeDateKey(prevTo),
    };
  }

  if (mode === 'PREVIOUS_PERIOD') {
    const dayMs = 86400000;
    const diffDays =
      Math.floor((baseTo.getTime() - baseFrom.getTime()) / dayMs) + 1;
    const prevTo = new Date(baseFrom.getTime() - dayMs);
    const prevFrom = new Date(prevTo.getTime() - (diffDays - 1) * dayMs);
    return {
      mode,
      label: 'Periodo anterior',
      dateFrom: cache.normalizeDateKey(prevFrom),
      dateTo: cache.normalizeDateKey(prevTo),
    };
  }

  return null;
}

function applyHideZero(payload, metrics) {
  if (!payload) return payload;
  const metricKeys = Array.isArray(metrics) ? metrics : [];

  const nextTotals = {};
  Object.entries(payload.totals || {}).forEach(([key, raw]) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value !== 0) {
      nextTotals[key] = raw;
    }
  });

  const nextSeries = Array.isArray(payload.series)
    ? payload.series
        .map((serie) => ({
          ...serie,
          data: Array.isArray(serie.data)
            ? serie.data.filter((point) => Number(point?.y || 0) !== 0)
            : [],
        }))
        .filter((serie) => serie.data.length)
    : [];

  const rows = Array.isArray(payload.table) ? payload.table : [];
  const nextTable = rows.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const keys = metricKeys.length ? metricKeys : Object.keys(row);
    let hasMetric = false;
    let hasNonZero = false;
    keys.forEach((key) => {
      const value = row[key];
      if (value === null || value === undefined) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      hasMetric = true;
      if (numeric !== 0) hasNonZero = true;
    });
    if (!hasMetric) return true;
    return hasNonZero;
  });

  const nextPie = Array.isArray(payload.pie)
    ? payload.pie.filter((slice) => Number(slice?.value || 0) !== 0)
    : [];

  return {
    ...payload,
    totals: nextTotals,
    series: nextSeries,
    table: nextTable,
    pie: nextPie,
  };
}

async function resolveConnection(tenantId, connectionId) {
  if (!tenantId || !connectionId) return null;
  return prisma.dataSourceConnection.findFirst({
    where: { id: connectionId, tenantId },
    include: {
      integration: true,
    },
  });
}

async function queryMetrics(tenantId, querySpec = {}) {
  const source = querySpec.source ? String(querySpec.source) : null;
  const connectionId = querySpec.connectionId ? String(querySpec.connectionId) : null;

  if (!source) {
    const err = new Error('source obrigatorio');
    err.status = 400;
    throw err;
  }

  if (!connectionId) {
    const err = new Error('connectionId obrigatorio');
    err.status = 400;
    throw err;
  }

  const metrics = normalizeMetricsList(querySpec.metrics);
  const dateFromKey = cache.normalizeDateKey(querySpec.dateFrom);
  const dateToKey = cache.normalizeDateKey(querySpec.dateTo);
  const compareRange = resolveCompareRange({
    dateFrom: dateFromKey,
    dateTo: dateToKey,
    compareMode: querySpec.compareMode,
    compareDateFrom: querySpec.compareDateFrom,
    compareDateTo: querySpec.compareDateTo,
  });

  const connection = await resolveConnection(tenantId, connectionId);
  if (!connection) {
    const err = new Error('Conexao nao encontrada');
    err.status = 404;
    throw err;
  }

  if (connection.status && connection.status !== 'CONNECTED') {
    const err = new Error('Conexao nao esta CONNECTED');
    err.status = 400;
    throw err;
  }

  if (connection.source && connection.source !== source) {
    const err = new Error('Conexao incompativel com a fonte');
    err.status = 400;
    throw err;
  }

  const adapter = getAdapter(source);
  if (!adapter || typeof adapter.queryMetrics !== 'function') {
    const err = new Error('Fonte nao suportada');
    err.status = 400;
    throw err;
  }

  const basePayload = {
    ...querySpec,
    source,
    connectionId,
    metrics,
  };

  const queryRange = async ({ dateFrom, dateTo }) => {
    const cacheKey = cache.buildMetricsCacheKey({
      tenantId,
      source,
      connectionId,
      dateFrom,
      dateTo,
      level: querySpec.level,
      breakdown: querySpec.breakdown,
      metrics,
      filters: querySpec.filters,
      options: querySpec.options,
      widgetType: querySpec.widgetType || querySpec.type,
    });

    const cached = await cache.getMetricsCache(cacheKey);
    if (cached) {
      return {
        data: normalizeResult(cached),
        cached: true,
        cacheKey,
      };
    }

    const payload = await adapter.queryMetrics(
      {
        ...connection,
        integration: connection.integration,
      },
      {
        ...basePayload,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      },
    );

    const normalized = normalizeResult(payload || {});
    const ttl = cache.getTtlForSource(source);
    await cache.setMetricsCache(cacheKey, normalized, ttl);

    return {
      data: normalized,
      cached: false,
      cacheKey,
    };
  };

  const mainResult = await queryRange({
    dateFrom: dateFromKey || null,
    dateTo: dateToKey || null,
  });

  if (!compareRange) {
    const hideZero = querySpec?.options?.hideZero;
    const data = hideZero
      ? applyHideZero(mainResult.data, metrics)
      : mainResult.data;
    return {
      data,
      cached: mainResult.cached,
      cacheKey: mainResult.cacheKey,
    };
  }

  const compareResult = await queryRange({
    dateFrom: compareRange.dateFrom || null,
    dateTo: compareRange.dateTo || null,
  });

  const compareSeries = (compareResult.data.series || []).map((serie) => {
    const baseName = serie.name || serie.metric || serie.key || '';
    const labeledName = baseName ? `${baseName} (${compareRange.label})` : baseName;
    return {
      ...serie,
      name: labeledName || serie.name,
      metric: serie.metric ? `${serie.metric} (${compareRange.label})` : serie.metric,
      key: serie.key ? `${serie.key} (${compareRange.label})` : serie.key,
    };
  });

  const merged = {
    ...mainResult.data,
    series: [...(mainResult.data.series || []), ...compareSeries],
    meta: {
      ...(mainResult.data.meta || {}),
      compare: {
        mode: compareRange.mode,
        label: compareRange.label,
        dateFrom: compareRange.dateFrom,
        dateTo: compareRange.dateTo,
        totals: compareResult.data.totals || {},
      },
    },
  };

  return {
    data: merged,
    cached: mainResult.cached && compareResult.cached,
    cacheKey: mainResult.cacheKey,
  };
}

module.exports = {
  queryMetrics,
  normalizeResult,
};
