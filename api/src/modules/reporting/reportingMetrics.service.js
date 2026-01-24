const cache = require('./reportingCache.service');
const reportingData = require('./reportingData.service');
const { DATA_SOURCES } = require('./connections.validators');

const DEFAULT_POINTS = 14;

function normalizeString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => normalizeString(item)).filter(Boolean);
}

function normalizePayload(payload = {}) {
  const source = normalizeString(payload.source);
  if (!source || !DATA_SOURCES.includes(source)) {
    const err = new Error('source invalido');
    err.status = 400;
    throw err;
  }

  const connectionId = normalizeString(payload.connectionId);
  const metrics = normalizeList(payload.metrics);
  const level = normalizeString(payload.level) || null;
  const breakdown = normalizeString(payload.breakdown) || null;
  const filters =
    payload.filters && typeof payload.filters === 'object' ? payload.filters : {};
  const options =
    payload.options && typeof payload.options === 'object' ? payload.options : {};

  const dateFrom = payload.dateFrom || null;
  const dateTo = payload.dateTo || null;
  const compareMode = normalizeString(payload.compareMode) || null;
  const compareDateFrom = payload.compareDateFrom || null;
  const compareDateTo = payload.compareDateTo || null;

  const widgetType = normalizeString(payload.widgetType || payload.type) || null;
  const forceMock = Boolean(payload.forceMock);

  return {
    source,
    connectionId: connectionId || null,
    metrics,
    level,
    breakdown,
    filters,
    options,
    dateFrom,
    dateTo,
    compareMode,
    compareDateFrom,
    compareDateTo,
    widgetType,
    forceMock,
  };
}

function toDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function buildDateSeries(dateFrom, dateTo) {
  const end = toDate(dateTo) || new Date();
  const start =
    toDate(dateFrom) || new Date(end.getTime() - DEFAULT_POINTS * 86400000);
  if (start > end) {
    const tmp = new Date(start);
    start.setTime(end.getTime());
    end.setTime(tmp.getTime());
  }

  const diffDays = Math.max(1, Math.floor((end - start) / 86400000) + 1);
  const step = Math.max(1, Math.ceil(diffDays / DEFAULT_POINTS));
  const dates = [];

  for (let idx = 0; idx < diffDays; idx += step) {
    const point = new Date(start.getTime() + idx * 86400000);
    dates.push(formatDate(point));
  }

  return dates.length ? dates : [formatDate(end)];
}

function seededRandom(seed) {
  let value = Math.abs(seed) % 2147483647;
  if (value === 0) value = 1;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function hashSeed(value) {
  const hash = cache.hashValue(value || '');
  return parseInt(hash.slice(0, 8), 16) || 42;
}

function buildMockPayload(querySpec, cacheKey) {
  const metrics = querySpec.metrics.length ? querySpec.metrics : ['value'];
  const dates = buildDateSeries(querySpec.dateFrom, querySpec.dateTo);
  const rng = seededRandom(hashSeed(cacheKey));
  const breakdown = querySpec.breakdown || null;

  const series = metrics.map((metric, idx) => {
    const base = 60 + Math.floor(rng() * 180) + idx * 15;
    const trend = Math.round((rng() - 0.3) * 4);
    const variance = 10 + Math.floor(rng() * 50);
    const data = dates.map((date, index) => ({
      x: date,
      y: Math.max(0, Math.round(base + index * trend + (rng() - 0.5) * variance)),
    }));
    return { metric, data };
  });

  const totals = metrics.reduce((acc, metric) => {
    const serie = series.find((item) => item.metric === metric);
    const total = (serie?.data || []).reduce((sum, point) => sum + point.y, 0);
    acc[metric] = total;
    return acc;
  }, {});

  const rowKey = breakdown ? 'dimension' : 'date';
  const rowsSource = breakdown
    ? ['Top 1', 'Top 2', 'Top 3', 'Top 4', 'Top 5']
    : dates;

  const table = rowsSource.map((label, rowIndex) => {
    const row = { [rowKey]: label };
    metrics.forEach((metric) => {
      const baseValue = totals[metric] || 0;
      const weight = 0.08 + rng() * 0.18;
      const variance = 0.9 + rng() * 0.2;
      row[metric] = Math.round(baseValue * weight * variance + rowIndex * 5);
    });
    return row;
  });

  return {
    totals,
    series,
    table,
    meta: {
      source: querySpec.source,
      mocked: true,
      currency: querySpec.options?.currency || null,
    },
  };
}

function isEmptyPayload(payload) {
  if (!payload) return true;
  const totals = payload.totals && typeof payload.totals === 'object'
    ? Object.keys(payload.totals).length
    : 0;
  const seriesCount = Array.isArray(payload.series) ? payload.series.length : 0;
  const tableCount = Array.isArray(payload.table) ? payload.table.length : 0;
  return totals === 0 && seriesCount === 0 && tableCount === 0;
}

function normalizeSeries(series = []) {
  if (!Array.isArray(series)) return [];
  return series.map((item, index) => ({
    name: item.name || item.metric || item.key || `Serie ${index + 1}`,
    data: Array.isArray(item.data) ? item.data : [],
  }));
}

function normalizeTable(table) {
  if (!Array.isArray(table) || !table.length) {
    return { columns: [], rows: [] };
  }
  const columns = Object.keys(table[0] || {}).map((key) => ({
    key,
    label: key,
  }));
  return { columns, rows: table };
}

function normalizePie(totals, metrics = []) {
  const entries =
    metrics.length > 0
      ? metrics.map((metric) => [metric, totals?.[metric]])
      : Object.entries(totals || {});
  return entries.map(([name, value]) => ({
    name,
    value: typeof value === 'number' ? value : Number(value) || 0,
  }));
}

function formatResponse(payload, querySpec = {}) {
  const totals =
    payload?.totals && typeof payload.totals === 'object' ? payload.totals : {};
  const series = normalizeSeries(payload?.series || []);
  const table = normalizeTable(payload?.table || []);
  const pie =
    Array.isArray(payload?.pie) && payload.pie.length
      ? payload.pie
      : normalizePie(totals, querySpec.metrics || []);
  const meta = {
    ...(payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}),
    currency: payload?.meta?.currency || querySpec.options?.currency || null,
  };

  return { totals, series, pie, table, meta };
}

async function queryMetrics(tenantId, payload = {}) {
  const querySpec = normalizePayload(payload);
  const cacheKey = cache.buildMetricsCacheKey({
    tenantId,
    source: querySpec.source,
    connectionId: querySpec.connectionId || 'preview',
    dateFrom: querySpec.dateFrom,
    dateTo: querySpec.dateTo,
    level: querySpec.level,
    breakdown: querySpec.breakdown,
    metrics: querySpec.metrics,
    filters: querySpec.filters,
    options: querySpec.options,
    widgetType: querySpec.widgetType || querySpec.type,
  });

  if (querySpec.forceMock) {
    const mock = buildMockPayload(querySpec, cacheKey);
    return formatResponse(mock, querySpec);
  }

  if (!querySpec.connectionId) {
    const err = new Error('connectionId obrigatorio');
    err.status = 400;
    throw err;
  }

  const result = await reportingData.queryMetrics(tenantId, querySpec);
  const data = result?.data || {};
  const shouldMock = Boolean(data?.meta?.mocked) || isEmptyPayload(data);
  if (shouldMock) {
    const mock = buildMockPayload(querySpec, cacheKey);
    return formatResponse(mock, querySpec);
  }

  return formatResponse(data, querySpec);
}

module.exports = {
  queryMetrics,
};
