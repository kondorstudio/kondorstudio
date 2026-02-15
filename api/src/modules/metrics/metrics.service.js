const { prisma } = require('../../prisma');
const { ensureGa4FactMetrics } = require('../../services/ga4FactMetricsService');
const {
  resolveBrandGa4ActivePropertyId,
} = require('../../services/brandGa4SettingsService');
const { ensureFactMetrics } = require('../../services/factMetricsSyncService');
const { buildRollingDateRange } = require('../../lib/timezone');

const SUPPORTED_PLATFORMS = new Set([
  'META_ADS',
  'GOOGLE_ADS',
  'TIKTOK_ADS',
  'LINKEDIN_ADS',
  'GA4',
  'GMB',
  'FB_IG',
]);

const PLATFORM_ALIASES = {
  META_ADS: ['FB_IG'],
  FB_IG: ['META_ADS'],
};

const DIMENSION_COLUMN_MAP = {
  date: 'date',
  platform: 'platform',
  account_id: 'accountId',
  campaign_id: 'campaignId',
};

const BASE_METRIC_COLUMN_MAP = {
  spend: 'spend',
  impressions: 'impressions',
  clicks: 'clicks',
  conversions: 'conversions',
  revenue: 'revenue',
  sessions: 'sessions',
  leads: 'leads',
};

const SUPPORTED_DERIVED_METRICS = new Set(['ctr', 'cpc', 'cpm', 'cpa', 'roas']);
const SORTABLE_FIELD_ALIAS = {
  date: '"date"',
  platform: '"platform"',
  account_id: '"account_id"',
  campaign_id: '"campaign_id"',
  spend: '"spend"',
  impressions: '"impressions"',
  clicks: '"clicks"',
  conversions: '"conversions"',
  revenue: '"revenue"',
  sessions: '"sessions"',
  leads: '"leads"',
  ctr: '"ctr"',
  cpc: '"cpc"',
  cpm: '"cpm"',
  cpa: '"cpa"',
  roas: '"roas"',
};

const METRICS_QUERY_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.METRICS_QUERY_CACHE_TTL_MS || 30_000),
);
const METRICS_QUERY_CACHE_MAX_ENTRIES = Math.max(
  20,
  Number(process.env.METRICS_QUERY_CACHE_MAX_ENTRIES || 300),
);
const METRICS_QUERY_CONCURRENCY_LIMIT = Math.max(
  1,
  Number(process.env.METRICS_QUERY_CONCURRENCY_LIMIT || 4),
);
const METRICS_FACT_SYNC_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.METRICS_FACT_SYNC_TIMEOUT_MS || 20_000),
);
const METRICS_QUERY_EXEC_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.METRICS_QUERY_EXEC_TIMEOUT_MS || 45_000),
);

const metricsQueryCache = new Map();
const metricsQueryInFlight = new Map();
const dashboardQueues = new Map();

const DATE_RANGE_PRESET_DAYS = Object.freeze({
  last_7_days: 7,
  last_30_days: 30,
});

function resolveEffectiveDateRange(dateRange, timeZone) {
  const preset = String(dateRange?.preset || '').trim();
  const days = DATE_RANGE_PRESET_DAYS[preset];
  if (days) {
    const rolling = buildRollingDateRange({ days, timeZone });
    if (rolling?.start && rolling?.end) {
      return { start: rolling.start, end: rolling.end, preset };
    }
  }
  return {
    start: String(dateRange?.start || ''),
    end: String(dateRange?.end || ''),
    ...(preset ? { preset } : {}),
  };
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizePlatform(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  if (!SUPPORTED_PLATFORMS.has(normalized)) return null;
  return normalized;
}

function extractPlatformsFromFilters(filters = []) {
  const set = new Set();
  (filters || []).forEach((filter) => {
    if (!filter || filter.field !== 'platform') return;
    if (filter.op === 'eq') {
      const platform = normalizePlatform(filter.value);
      if (platform) set.add(platform);
      return;
    }
    if (filter.op === 'in') {
      toArray(filter.value).forEach((entry) => {
        const platform = normalizePlatform(entry);
        if (platform) set.add(platform);
      });
    }
  });
  return set;
}

function expandPlatformSet(platformSet) {
  const expanded = new Set(platformSet || []);
  Array.from(platformSet || []).forEach((platform) => {
    (PLATFORM_ALIASES[platform] || []).forEach((alias) => expanded.add(alias));
  });
  return expanded;
}

async function resolveConnectedPlatforms(tenantId, brandId) {
  const connections = await prisma.brandSourceConnection.findMany({
    where: {
      tenantId,
      brandId,
      status: 'ACTIVE',
    },
    select: { platform: true },
  });
  const connected = new Set(
    (connections || [])
      .map((item) => normalizePlatform(item.platform))
      .filter(Boolean),
  );

  if (connected.has('GA4') && prisma.integrationGoogleGa4?.findFirst) {
    const ga4Integration = await prisma.integrationGoogleGa4.findFirst({
      where: { tenantId, status: 'CONNECTED' },
      select: { id: true },
    });
    if (!ga4Integration) {
      connected.delete('GA4');
    }
  }

  return expandPlatformSet(connected);
}

async function assertRequiredPlatformsConnected({
  tenantId,
  brandId,
  requiredPlatforms,
  filters,
}) {
  const required = new Set();
  toArray(requiredPlatforms).forEach((platform) => {
    const normalized = normalizePlatform(platform);
    if (normalized) required.add(normalized);
  });
  const fromFilters = extractPlatformsFromFilters(filters);
  fromFilters.forEach((platform) => required.add(platform));

  if (!required.size) {
    return { required: [], missing: [] };
  }

  const connected = await resolveConnectedPlatforms(tenantId, brandId);
  const missing = Array.from(required).filter((platform) => !connected.has(platform));

  if (missing.length) {
    const err = new Error('Conexões pendentes para as plataformas solicitadas');
    err.code = 'MISSING_CONNECTIONS';
    err.status = 409;
    err.details = {
      missing,
      required: Array.from(required),
    };
    throw err;
  }

  return { required: Array.from(required), missing: [] };
}

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function cloneResult(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function pruneMetricsCache() {
  const now = Date.now();
  for (const [key, entry] of metricsQueryCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      metricsQueryCache.delete(key);
    }
  }
  while (metricsQueryCache.size > METRICS_QUERY_CACHE_MAX_ENTRIES) {
    const firstKey = metricsQueryCache.keys().next().value;
    if (!firstKey) break;
    metricsQueryCache.delete(firstKey);
  }
}

function getCachedMetricsResult(key) {
  const entry = metricsQueryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    metricsQueryCache.delete(key);
    return null;
  }
  return cloneResult(entry.value);
}

function setCachedMetricsResult(key, value) {
  if (!key || METRICS_QUERY_CACHE_TTL_MS <= 0) return;
  metricsQueryCache.set(key, {
    value: cloneResult(value),
    expiresAt: Date.now() + METRICS_QUERY_CACHE_TTL_MS,
  });
  pruneMetricsCache();
}

function invalidateMetricsCacheForBrand(tenantId, brandId) {
  if (!tenantId || !brandId) return;
  const tenantNeedle = `"tenantId":"${String(tenantId)}"`;
  const brandNeedle = `"brandId":"${String(brandId)}"`;

  const matches = (key) =>
    typeof key === 'string' && key.includes(tenantNeedle) && key.includes(brandNeedle);

  for (const key of Array.from(metricsQueryCache.keys())) {
    if (matches(key)) metricsQueryCache.delete(key);
  }
  for (const key of Array.from(metricsQueryInFlight.keys())) {
    if (matches(key)) metricsQueryInFlight.delete(key);
  }
}

function buildMetricsCacheKey(tenantId, payload = {}) {
  if (!tenantId || !payload?.brandId || !payload?.dateRange?.start || !payload?.dateRange?.end) {
    return null;
  }
  const keyPayload = {
    tenantId,
    brandId: payload.brandId,
    dateRange: payload.dateRange,
    dimensions: payload.dimensions || [],
    metrics: payload.metrics || [],
    filters: payload.filters || [],
    requiredPlatforms: payload.requiredPlatforms || [],
    compareTo: payload.compareTo || null,
    sort: payload.sort || null,
    limit: payload.limit || null,
    pagination: payload.pagination || null,
  };
  return `metrics:${stableStringify(keyPayload)}`;
}

function withDashboardConcurrency(dashboardKey, task) {
  if (!dashboardKey || typeof task !== 'function') {
    return task();
  }

  return new Promise((resolve, reject) => {
    const bucket = dashboardQueues.get(dashboardKey) || { active: 0, queue: [] };
    dashboardQueues.set(dashboardKey, bucket);

    const runTask = async () => {
      bucket.active += 1;
      try {
        const result = await task();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        bucket.active -= 1;
        const next = bucket.queue.shift();
        if (next) {
          next();
        } else if (bucket.active === 0) {
          dashboardQueues.delete(dashboardKey);
        }
      }
    };

    if (bucket.active < METRICS_QUERY_CONCURRENCY_LIMIT) {
      runTask();
      return;
    }
    bucket.queue.push(runTask);
  });
}

async function withTimeout(task, timeoutMs, {
  code = 'TIMEOUT',
  message = 'Tempo limite excedido',
  details = null,
} = {}) {
  const effectiveTimeout = Math.max(1, Number(timeoutMs) || 1);
  let timeoutHandle;
  try {
    return await Promise.race([
      Promise.resolve().then(() => task()),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          const err = new Error(message);
          err.status = 504;
          err.code = code;
          err.details = {
            ...(details || {}),
            timeoutMs: effectiveTimeout,
          };
          reject(err);
        }, effectiveTimeout);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDivide(numerator, denominator) {
  const num = toNumber(numerator);
  const den = toNumber(denominator);
  if (!den) return 0;
  const value = num / den;
  return Number.isFinite(value) ? value : 0;
}

function buildCompareRange(dateFrom, dateTo, mode) {
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  if (mode === 'previous_year') {
    const prevStart = new Date(start);
    const prevEnd = new Date(end);
    prevStart.setFullYear(prevStart.getFullYear() - 1);
    prevEnd.setFullYear(prevEnd.getFullYear() - 1);
    return {
      start: prevStart.toISOString().slice(0, 10),
      end: prevEnd.toISOString().slice(0, 10),
    };
  }

  if (mode === 'previous_period') {
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((end.getTime() - start.getTime()) / dayMs) + 1;
    const prevEnd = new Date(start.getTime() - dayMs);
    const prevStart = new Date(prevEnd.getTime() - (diffDays - 1) * dayMs);
    return {
      start: prevStart.toISOString().slice(0, 10),
      end: prevEnd.toISOString().slice(0, 10),
    };
  }

  return null;
}

function normalizeReporteiCell(value) {
  if (value && typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
    if (Object.prototype.hasOwnProperty.call(value, 'value')) return value.value;
    if (Object.prototype.hasOwnProperty.call(value, 'title')) return value.title;
  }
  return value;
}

function resolveKpiValue(rows, totals, metric, dimensions) {
  if (dimensions?.length === 1 && dimensions[0] === 'date' && Array.isArray(rows) && rows.length) {
    const sorted = [...rows].sort((a, b) =>
      String(a?.date || '').localeCompare(String(b?.date || '')),
    );
    return sorted[sorted.length - 1]?.[metric];
  }
  return totals?.[metric];
}

function buildReporteiComparison(currentValue, compareValue) {
  if (compareValue === null || compareValue === undefined) {
    return {
      values: null,
      difference: null,
      absoluteDifference: null,
    };
  }
  const currentNum = toNumber(currentValue);
  const compareNum = toNumber(compareValue);
  const absoluteDifference = currentNum - compareNum;
  const difference = compareNum === 0 ? null : (absoluteDifference / compareNum) * 100;
  return {
    values: compareValue,
    difference,
    absoluteDifference,
  };
}

function buildReporteiChart(rows, metrics, dimension) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const labels = safeRows.map((row, index) => {
    if (dimension && row && row[dimension] !== undefined) return row[dimension];
    if (row?.label !== undefined) return row.label;
    if (row?.date !== undefined) return row.date;
    return String(index + 1);
  });
  const values = (Array.isArray(metrics) ? metrics : []).map((metric) => ({
    name: metric,
    data: safeRows.map((row) => {
      const value = row ? row[metric] : null;
      const numeric = toNumber(value);
      return Number.isFinite(numeric) ? numeric : 0;
    }),
  }));
  return { labels, values };
}

function buildReporteiTable(rows, dimensions, metrics) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const columns = [...(dimensions || []), ...(metrics || [])];
  const values = safeRows.map((row) =>
    columns.map((column) => normalizeReporteiCell(row ? row[column] : null)),
  );
  return { values };
}

function formatReporteiResponse(result, payload = {}) {
  const widgetId = payload.widgetId || null;
  const widgetType = String(payload.widgetType || '').toLowerCase();
  const metrics = Array.isArray(payload.metrics) ? payload.metrics : [];
  const dimensions = Array.isArray(payload.dimensions) ? payload.dimensions : [];
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const totals = result?.totals || {};
  const compareTotals = result?.compare?.totals || null;

  const metricForKpi = metrics[0] || Object.keys(totals || {})[0];
  let entry = {};

  if (widgetType === 'kpi' || (!widgetType && !dimensions.length)) {
    const currentValue = resolveKpiValue(rows, totals, metricForKpi, dimensions);
    const compareValue =
      compareTotals && metricForKpi ? compareTotals[metricForKpi] : null;
    entry = {
      values: currentValue ?? 0,
      trend: { data: [] },
      comparison: buildReporteiComparison(currentValue, compareValue),
    };
  } else if (['timeseries', 'bar', 'pie', 'donut'].includes(widgetType)) {
    const dimension = dimensions[0] || 'label';
    entry = buildReporteiChart(rows, metrics, dimension);
  } else {
    entry = buildReporteiTable(rows, dimensions, metrics);
  }

  if (widgetId) {
    return { [widgetId]: entry };
  }
  return entry;
}

function normalizeMetricCatalog(entries = []) {
  return entries.map((entry) => ({
    key: entry.key,
    label: entry.label,
    format: entry.format,
    formula: entry.formula,
    requiredFields: Array.isArray(entry.requiredFields)
      ? entry.requiredFields
      : Array.isArray(entry.requiredFields?.value)
        ? entry.requiredFields.value
        : Array.isArray(entry.requiredFields?.values)
          ? entry.requiredFields.values
          : Array.isArray(entry.requiredFields)
            ? entry.requiredFields
            : entry.requiredFields && typeof entry.requiredFields === 'string'
              ? [entry.requiredFields]
              : entry.requiredFields || [],
  }));
}

function buildMetricsPlan(requestedMetrics, catalogEntries) {
  const catalogMap = new Map();
  catalogEntries.forEach((entry) => catalogMap.set(entry.key, entry));

  const missing = requestedMetrics.filter((metric) => !catalogMap.has(metric));
  if (missing.length) {
    const err = new Error(`Métricas não encontradas: ${missing.join(', ')}`);
    err.code = 'METRIC_NOT_FOUND';
    err.status = 400;
    err.details = { metrics: missing };
    throw err;
  }

  const baseMetrics = new Set();
  const derivedMetrics = [];

  requestedMetrics.forEach((metricKey) => {
    const entry = catalogMap.get(metricKey);
    if (entry.formula) {
      if (!SUPPORTED_DERIVED_METRICS.has(metricKey)) {
        const err = new Error(`Métrica derivada não suportada: ${metricKey}`);
        err.code = 'UNSUPPORTED_DERIVED_METRIC';
        err.status = 400;
        throw err;
      }
      const required = Array.isArray(entry.requiredFields) ? entry.requiredFields : [];
      if (!required.length) {
        const err = new Error(`Métrica derivada sem requiredFields: ${metricKey}`);
        err.code = 'INVALID_METRIC_CATALOG';
        err.status = 400;
        throw err;
      }
      required.forEach((req) => baseMetrics.add(req));
      derivedMetrics.push(entry);
    } else {
      baseMetrics.add(metricKey);
    }
  });

  const unsupported = Array.from(baseMetrics).filter((metric) => !BASE_METRIC_COLUMN_MAP[metric]);
  if (unsupported.length) {
    const err = new Error(`Métricas base não suportadas: ${unsupported.join(', ')}`);
    err.code = 'UNSUPPORTED_METRIC';
    err.status = 400;
    err.details = { metrics: unsupported };
    throw err;
  }

  return {
    baseMetrics: Array.from(baseMetrics),
    derivedMetrics,
  };
}

function buildWhereClause({ tenantId, brandId, dateFrom, dateTo, filters }) {
  const conditions = [
    '"tenantId" = $1',
    '"brandId" = $2',
    '"date" >= $3::date',
    '"date" <= $4::date',
  ];
  const params = [tenantId, brandId, dateFrom, dateTo];
  let paramIndex = params.length + 1;

  (filters || []).forEach((filter) => {
    const column = DIMENSION_COLUMN_MAP[filter.field];
    if (!column) return;
    const isPlatformFilter = filter.field === 'platform';
    const cast = isPlatformFilter ? '::"BrandSourcePlatform"' : '';
    if (filter.op === 'eq') {
      const value = isPlatformFilter ? normalizePlatform(filter.value) : filter.value;
      if (isPlatformFilter && !value) {
        const err = new Error('Filtro de plataforma inválido');
        err.code = 'INVALID_PLATFORM_FILTER';
        err.status = 400;
        err.details = { value: filter.value };
        throw err;
      }
      conditions.push(`"${column}" = $${paramIndex}${cast}`);
      params.push(value);
      paramIndex += 1;
      return;
    }

    if (filter.op === 'in') {
      const rawValues = Array.isArray(filter.value) ? filter.value : [];
      if (!rawValues.length) return;

      const values = isPlatformFilter
        ? rawValues.map((entry) => normalizePlatform(entry)).filter(Boolean)
        : rawValues;

      if (isPlatformFilter && values.length !== rawValues.length) {
        const err = new Error('Filtro de plataforma inválido');
        err.code = 'INVALID_PLATFORM_FILTER';
        err.status = 400;
        err.details = { values: rawValues };
        throw err;
      }

      const placeholders = values.map(() => `$${paramIndex++}${cast}`);
      params.push(...values);
      conditions.push(`"${column}" IN (${placeholders.join(', ')})`);
    }
  });

  return { whereSql: conditions.join(' AND '), params };
}

function buildDerivedSelectClause(metricKey) {
  switch (metricKey) {
    case 'ctr':
      return 'CASE WHEN SUM("impressions") = 0 THEN 0 ELSE SUM("clicks")::numeric / SUM("impressions") END AS "ctr"';
    case 'cpc':
      return 'CASE WHEN SUM("clicks") = 0 THEN 0 ELSE SUM("spend")::numeric / SUM("clicks") END AS "cpc"';
    case 'cpm':
      return 'CASE WHEN SUM("impressions") = 0 THEN 0 ELSE (SUM("spend")::numeric / SUM("impressions")) * 1000 END AS "cpm"';
    case 'cpa':
      return 'CASE WHEN SUM("conversions") = 0 THEN 0 ELSE SUM("spend")::numeric / SUM("conversions") END AS "cpa"';
    case 'roas':
      return 'CASE WHEN SUM("spend") = 0 THEN 0 ELSE SUM("revenue")::numeric / SUM("spend") END AS "roas"';
    default:
      return null;
  }
}

function buildSelectClause({ dimensions, baseMetrics, derivedMetrics }) {
  const dimensionSelects = dimensions.map((dim) => {
    const column = DIMENSION_COLUMN_MAP[dim];
    return `"${column}" AS "${dim}"`;
  });

  const metricSelects = baseMetrics.map((metric) => {
    const column = BASE_METRIC_COLUMN_MAP[metric];
    return `COALESCE(SUM("${column}")::numeric, 0) AS "${metric}"`;
  });

  const derivedSelects = (derivedMetrics || [])
    .map((metric) => buildDerivedSelectClause(metric.key))
    .filter(Boolean);

  return [...dimensionSelects, ...metricSelects, ...derivedSelects].join(', ');
}

function buildGroupByClause(dimensions) {
  if (!dimensions.length) return '';
  const columns = dimensions.map((dim) => `"${DIMENSION_COLUMN_MAP[dim]}"`);
  return `GROUP BY ${columns.join(', ')}`;
}

function buildOrderByClause({ dimensions, sort }) {
  if (sort?.alias) {
    const direction = sort.direction === 'desc' ? 'DESC' : 'ASC';
    return `ORDER BY ${sort.alias} ${direction}`;
  }
  if (!dimensions.length) return '';
  const columns = dimensions.map((dim) => SORTABLE_FIELD_ALIAS[dim]).filter(Boolean);
  if (!columns.length) return '';
  return `ORDER BY ${columns.join(', ')}`;
}

function normalizePagination(pagination) {
  if (!pagination) return null;
  const limit = Math.min(Math.max(Number(pagination.limit ?? 25), 1), 500);
  const offset = Math.max(Number(pagination.offset ?? 0), 0);
  return { limit, offset };
}

function normalizeLimit(limit) {
  if (limit === undefined || limit === null) return null;
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(Math.round(parsed), 1), 500);
}

function computeDerivedValues(row, derivedMetrics) {
  const base = {
    spend: toNumber(row.spend),
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    conversions: toNumber(row.conversions),
    revenue: toNumber(row.revenue),
    sessions: toNumber(row.sessions),
    leads: toNumber(row.leads),
  };

  const derived = {};
  derivedMetrics.forEach((metric) => {
    switch (metric.key) {
      case 'ctr':
        derived.ctr = safeDivide(base.clicks, base.impressions);
        break;
      case 'cpc':
        derived.cpc = safeDivide(base.spend, base.clicks);
        break;
      case 'cpm':
        derived.cpm = safeDivide(base.spend, base.impressions) * 1000;
        break;
      case 'cpa':
        derived.cpa = safeDivide(base.spend, base.conversions);
        break;
      case 'roas':
        derived.roas = safeDivide(base.revenue, base.spend);
        break;
      default:
        derived[metric.key] = 0;
        break;
    }
  });

  return derived;
}

function buildRows({ dimensions, requestedMetrics, baseMetrics, derivedMetrics }, rows) {
  return rows.map((row) => {
    const output = {};
    dimensions.forEach((dim) => {
      if (dim === 'date' && row[dim]) {
        output[dim] = String(row[dim]);
      } else {
        output[dim] = row[dim] ?? null;
      }
    });

    const baseValues = {};
    baseMetrics.forEach((metric) => {
      baseValues[metric] = toNumber(row[metric]);
    });

    const derivedValues = computeDerivedValues(baseValues, derivedMetrics);

    requestedMetrics.forEach((metric) => {
      if (baseMetrics.includes(metric)) {
        output[metric] = baseValues[metric];
      } else {
        output[metric] = derivedValues[metric] ?? 0;
      }
    });

    return output;
  });
}

function buildTotals({ requestedMetrics, baseMetrics, derivedMetrics }, totalsRow) {
  const baseValues = {};
  baseMetrics.forEach((metric) => {
    baseValues[metric] = toNumber(totalsRow?.[metric]);
  });

  const derivedValues = computeDerivedValues(baseValues, derivedMetrics);

  return requestedMetrics.reduce((acc, metric) => {
    if (baseMetrics.includes(metric)) {
      acc[metric] = baseValues[metric];
    } else {
      acc[metric] = derivedValues[metric] ?? 0;
    }
    return acc;
  }, {});
}

async function runAggregates({
  tenantId,
  brandId,
  dateFrom,
  dateTo,
  dimensions,
  baseMetrics,
  filters,
  ga4PropertyId,
  derivedMetrics,
  sort,
  pagination,
  limit,
}) {
  const { whereSql, params: rawParams } = buildWhereClause({
    tenantId,
    brandId,
    dateFrom,
    dateTo,
    filters,
  });
  const params = [...rawParams];

  // GA4 facts can exist in 2 granularities:
  // - aggregated: campaignId IS NULL
  // - campaign breakdown: campaignId IS NOT NULL
  // If we don't scope them, queries without `campaign_id` would double-count totals
  // once both granularities are materialized.
  const wantsCampaignFacts =
    Array.isArray(dimensions) && dimensions.includes('campaign_id') ||
    Array.isArray(filters) && filters.some((filter) => filter?.field === 'campaign_id');

  const ga4ScopeClause = wantsCampaignFacts
    ? '("platform" <> \'GA4\'::"BrandSourcePlatform" OR "campaignId" IS NOT NULL)'
    : '("platform" <> \'GA4\'::"BrandSourcePlatform" OR "campaignId" IS NULL)';

  // Historical GA4 facts must always be scoped to the active propertyId for the brand.
  // If the brand is not connected to GA4, we exclude GA4 facts entirely to avoid leaking old data.
  let ga4PropertyClause = '("platform" <> \'GA4\'::"BrandSourcePlatform")';
  if (ga4PropertyId) {
    ga4PropertyClause = `("platform" <> 'GA4'::"BrandSourcePlatform" OR "accountId" = $${params.length + 1})`;
    params.push(String(ga4PropertyId));
  }

  const scopedWhereSql = `${whereSql} AND ${ga4ScopeClause} AND ${ga4PropertyClause}`;

  const selectClause = buildSelectClause({
    dimensions,
    baseMetrics,
    derivedMetrics,
  });
  const groupByClause = buildGroupByClause(dimensions);
  const orderByClause = buildOrderByClause({ dimensions, sort });
  const page = normalizePagination(pagination);
  const cap = normalizeLimit(limit);

  let paginationClause = '';
  const nextParams = [...params];
  if (page) {
    const offset = page.offset;
    let limitPlus = page.limit + 1;
    if (cap) {
      const remaining = cap - offset;
      limitPlus = remaining > 0 ? Math.min(limitPlus, remaining) : 0;
    }
    paginationClause = `LIMIT $${nextParams.length + 1} OFFSET $${nextParams.length + 2}`;
    nextParams.push(limitPlus, offset);
  } else if (cap) {
    paginationClause = `LIMIT $${nextParams.length + 1}`;
    nextParams.push(cap);
  }

  const baseQuery = `SELECT ${selectClause} FROM "fact_kondor_metrics_daily" WHERE ${scopedWhereSql} ${groupByClause} ${orderByClause} ${paginationClause}`;

  const totalsSelect = buildSelectClause({
    dimensions: [],
    baseMetrics,
    derivedMetrics: [],
  });
  const totalsQuery = `SELECT ${totalsSelect} FROM "fact_kondor_metrics_daily" WHERE ${scopedWhereSql}`;

  const rows = await prisma.$queryRawUnsafe(baseQuery, ...nextParams);
  const totalsResult = await prisma.$queryRawUnsafe(totalsQuery, ...params);
  const totalsRow = Array.isArray(totalsResult) ? totalsResult[0] : totalsResult;

  let pageInfo = null;
  let safeRows = rows || [];
  if (page) {
    let hasMore = safeRows.length > page.limit;
    if (hasMore) {
      safeRows = safeRows.slice(0, page.limit);
    }
    if (cap && page.offset + safeRows.length >= cap) {
      hasMore = false;
    }
    pageInfo = { limit: page.limit, offset: page.offset, hasMore };
  }

  return { rows: safeRows, totals: totalsRow || {}, pageInfo };
}

async function executeQueryMetrics(tenantId, payload = {}) {
  if (!tenantId) {
    const err = new Error('tenantId obrigatório');
    err.code = 'TENANT_REQUIRED';
    err.status = 400;
    throw err;
  }

  const { brandId, dateRange, dimensions, metrics, filters, compareTo, limit } =
    payload;

  const brand = await prisma.client.findFirst({
    where: { id: brandId, tenantId },
    select: { id: true },
  });

  if (!brand) {
    const err = new Error('Marca não encontrada');
    err.code = 'BRAND_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const requiredConnections = await assertRequiredPlatformsConnected({
    tenantId,
    brandId,
    requiredPlatforms: payload.requiredPlatforms,
    filters,
  });

  const wantsGa4 = Array.isArray(requiredConnections.required)
    ? requiredConnections.required.includes('GA4')
    : false;

  let ga4PropertyId = null;
  try {
    ga4PropertyId = await resolveBrandGa4ActivePropertyId({ tenantId, brandId });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[metrics.service] resolveBrandGa4ActivePropertyId warning', err?.message || err);
    }
  }

  if (wantsGa4 && !ga4PropertyId) {
    const err = new Error('GA4 property não configurada para esta marca');
    err.code = 'GA4_PROPERTY_REQUIRED';
    err.status = 409;
    throw err;
  }

  let brandTimezone = 'UTC';
  try {
    const ga4Settings = await prisma.brandGa4Settings.findFirst({
      where: {
        tenantId: String(tenantId),
        brandId: String(brandId),
      },
      select: {
        timezone: true,
      },
    });
    if (ga4Settings?.timezone) {
      brandTimezone = String(ga4Settings.timezone);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[metrics.service] brand timezone lookup warning', err?.message || err);
    }
  }

  const effectiveDateRange = resolveEffectiveDateRange(dateRange, brandTimezone);

  const catalogEntries = await prisma.metricsCatalog.findMany({
    where: { key: { in: metrics } },
  });

  const normalizedCatalog = normalizeMetricCatalog(catalogEntries);
  const plan = buildMetricsPlan(metrics, normalizedCatalog);

  let resolvedSort = null;
  if (payload.sort?.field) {
    const sortField = payload.sort.field;
    const allowedSortFields = new Set([...dimensions, ...metrics]);
    const alias = SORTABLE_FIELD_ALIAS[sortField];
    if (!allowedSortFields.has(sortField) || !alias) {
      const err = new Error('sort.field inválido');
      err.code = 'INVALID_SORT_FIELD';
      err.status = 400;
      err.details = { field: sortField };
      throw err;
    }
    resolvedSort = {
      field: sortField,
      alias,
      direction: payload.sort.direction || 'asc',
    };
  }

  let derivedForSelect = [];
  if (resolvedSort?.field) {
    const derivedMatch = plan.derivedMetrics.find(
      (metric) => metric.key === resolvedSort.field
    );
    if (derivedMatch) {
      derivedForSelect = [derivedMatch];
    }
  }

  try {
    await withTimeout(
      () =>
        ensureGa4FactMetrics({
          tenantId,
          brandId,
          dateRange: effectiveDateRange,
          metrics,
          dimensions,
          filters,
          requiredPlatforms: payload.requiredPlatforms,
        }),
      METRICS_FACT_SYNC_TIMEOUT_MS,
      {
        code: 'GA4_FACT_SYNC_TIMEOUT',
        message: 'Tempo limite ao sincronizar métricas GA4',
      },
    );
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[metrics.service] ensureGa4FactMetrics warning', err?.message || err);
    }
  }

  try {
    await withTimeout(
      () =>
        ensureFactMetrics({
          tenantId,
          brandId,
          dateRange: effectiveDateRange,
          metrics: Array.from(plan.baseMetrics || []),
          filters,
          requiredPlatforms: payload.requiredPlatforms,
        }),
      METRICS_FACT_SYNC_TIMEOUT_MS,
      {
        code: 'FACT_SYNC_TIMEOUT',
        message: 'Tempo limite ao sincronizar métricas das integrações',
      },
    );
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[metrics.service] ensureFactMetrics warning', err?.message || err);
    }
  }

	  const baseResult = await runAggregates({
	    tenantId,
	    brandId,
	    dateFrom: effectiveDateRange.start,
	    dateTo: effectiveDateRange.end,
	    dimensions,
	    baseMetrics: plan.baseMetrics,
	    derivedMetrics: derivedForSelect,
	    filters,
	    ga4PropertyId,
	    sort: resolvedSort,
	    pagination: payload.pagination,
	    limit,
	  });

  const rows = buildRows(
    {
      dimensions,
      requestedMetrics: metrics,
      baseMetrics: plan.baseMetrics,
      derivedMetrics: plan.derivedMetrics,
    },
    baseResult.rows,
  );

  const totals = buildTotals(
    {
      requestedMetrics: metrics,
      baseMetrics: plan.baseMetrics,
      derivedMetrics: plan.derivedMetrics,
    },
    baseResult.totals,
  );

  let compare = null;
  if (compareTo?.mode) {
    const range = buildCompareRange(
      effectiveDateRange.start,
      effectiveDateRange.end,
      compareTo.mode,
    );
    if (range) {
	      const compareResult = await runAggregates({
	        tenantId,
	        brandId,
	        dateFrom: range.start,
	        dateTo: range.end,
	        dimensions,
	        baseMetrics: plan.baseMetrics,
	        derivedMetrics: derivedForSelect,
	        filters,
	        ga4PropertyId,
	        sort: resolvedSort,
	        pagination: payload.pagination,
	        limit,
	      });

      compare = {
        rows: buildRows(
          {
            dimensions,
            requestedMetrics: metrics,
            baseMetrics: plan.baseMetrics,
            derivedMetrics: plan.derivedMetrics,
          },
          compareResult.rows,
        ),
        totals: buildTotals(
          {
            requestedMetrics: metrics,
            baseMetrics: plan.baseMetrics,
            derivedMetrics: plan.derivedMetrics,
          },
          compareResult.totals,
        ),
        pageInfo: compareResult.pageInfo,
      };
    }
  }

  return {
    meta: {
      currency: null,
      timezone: brandTimezone || 'UTC',
      dateRange: effectiveDateRange,
      generatedAt: new Date().toISOString(),
    },
    rows,
    totals,
    pageInfo: baseResult.pageInfo,
    compare,
  };
}

async function queryMetrics(tenantId, payload = {}) {
  const cacheKey = buildMetricsCacheKey(tenantId, payload);
  if (cacheKey) {
    const cached = getCachedMetricsResult(cacheKey);
    if (cached) {
      return cached;
    }
    const inFlight = metricsQueryInFlight.get(cacheKey);
    if (inFlight) {
      return cloneResult(await inFlight);
    }
  }

  const dashboardKey = tenantId && payload?.brandId
    ? `${tenantId}:${payload.brandId}`
    : null;

  const execution = withDashboardConcurrency(
    dashboardKey,
    () =>
      withTimeout(
        () => executeQueryMetrics(tenantId, payload),
        METRICS_QUERY_EXEC_TIMEOUT_MS,
        {
          code: 'METRICS_QUERY_TIMEOUT',
          message: 'Tempo limite ao consultar métricas',
        },
      ),
  );

  if (!cacheKey) {
    return execution;
  }

  metricsQueryInFlight.set(cacheKey, execution);
  try {
    const result = await execution;
    setCachedMetricsResult(cacheKey, result);
    return cloneResult(result);
  } finally {
    metricsQueryInFlight.delete(cacheKey);
  }
}

async function queryMetricsReportei(tenantId, payload = {}) {
  const { widgetId, widgetType, responseFormat, ...rest } = payload || {};
  const result = await queryMetrics(tenantId, rest);
  return formatReporteiResponse(result, {
    widgetId,
    widgetType,
    ...rest,
  });
}

module.exports = {
  queryMetrics,
  queryMetricsReportei,
  invalidateMetricsCacheForBrand,
  buildCompareRange,
  buildMetricsPlan,
  buildWhereClause,
  __internal: {
    stableStringify,
    buildMetricsCacheKey,
    getCachedMetricsResult,
    setCachedMetricsResult,
    pruneMetricsCache,
    withDashboardConcurrency,
    _resetForTests() {
      metricsQueryCache.clear();
      metricsQueryInFlight.clear();
      dashboardQueues.clear();
    },
  },
};
