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
  const cacheKey = cache.buildMetricsCacheKey({
    tenantId,
    source,
    connectionId,
    dateFrom: dateFromKey,
    dateTo: dateToKey,
    level: querySpec.level,
    breakdown: querySpec.breakdown,
    metrics,
    filters: querySpec.filters,
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

  const payload = await adapter.queryMetrics(
    {
      ...connection,
      integration: connection.integration,
    },
    {
      ...querySpec,
      source,
      connectionId,
      dateFrom: dateFromKey || null,
      dateTo: dateToKey || null,
      metrics,
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
}

module.exports = {
  queryMetrics,
  normalizeResult,
};
