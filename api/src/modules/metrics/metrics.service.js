const { prisma } = require('../../prisma');
const {
  resolveBrandGa4ActivePropertyId,
} = require('../../services/brandGa4SettingsService');
const connectionStateService = require('../../services/connectionStateService');
const { buildRollingDateRange } = require('../../lib/timezone');

const { ensureGa4FactMetrics } = require('../../services/ga4FactMetricsService');
const { ensureFactMetrics } = require('../../services/factMetricsSyncService');

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
const METRICS_QUERY_EXEC_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.METRICS_QUERY_EXEC_TIMEOUT_MS || 45_000),
);

const metricsQueryCache = new Map();
const metricsQueryInFlight = new Map();
const dashboardQueues = new Map();

function isMetricsDebugEnabled() {
  return String(process.env.METRICS_DEBUG || '').trim().toLowerCase() === 'true';
}

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

function shouldApplyGa4Scoping({ filters = [], requiredPlatforms = [] } = {}) {
  const explicitPlatforms = extractPlatformsFromFilters(filters);
  if (explicitPlatforms.size) {
    return explicitPlatforms.has('GA4');
  }

  const required = new Set();
  toArray(requiredPlatforms).forEach((platform) => {
    const normalized = normalizePlatform(platform);
    if (normalized) required.add(normalized);
  });
  if (required.size) {
    return expandPlatformSet(required).has('GA4');
  }

  return true;
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

function collectRequestedPlatforms({ requiredPlatforms, filters }) {
  const required = new Set();
  toArray(requiredPlatforms).forEach((platform) => {
    const normalized = normalizePlatform(platform);
    if (normalized) required.add(normalized);
  });
  const fromFilters = extractPlatformsFromFilters(filters);
  fromFilters.forEach((platform) => required.add(platform));
  return required;
}

function buildMissingConnectionsError({ required = [], missing = [] } = {}) {
  const err = new Error('Conexões pendentes para as plataformas solicitadas');
  err.code = 'MISSING_CONNECTIONS';
  err.status = 409;
  err.details = {
    missing: Array.from(new Set((missing || []).map((value) => String(value)))),
    required: Array.from(new Set((required || []).map((value) => String(value)))),
  };
  return err;
}

function normalizeDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toStartOfDayUtc(value) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return null;
  return new Date(`${normalized}T00:00:00.000Z`);
}

function toEndOfDayUtc(value) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return null;
  return new Date(`${normalized}T23:59:59.999Z`);
}

async function resolveGa4ConnectionDiagnostics(tenantId) {
  const [integration, connectionState] = await Promise.all([
    prisma.integrationGoogleGa4?.findFirst
      ? prisma.integrationGoogleGa4.findFirst({
          where: { tenantId: String(tenantId) },
          select: {
            status: true,
            lastError: true,
          },
        })
      : null,
    connectionStateService?.getConnectionState
      ? connectionStateService
          .getConnectionState({
            tenantId,
            provider: 'GA4',
            connectionKey: 'ga4_oauth',
          })
          .catch(() => null)
      : null,
  ]);

  const integrationStatus = integration?.status ? String(integration.status).toUpperCase() : null;
  const stateStatus = connectionState?.status
    ? String(connectionState.status).toUpperCase()
    : null;
  const effectiveStatus =
    stateStatus || (integrationStatus === 'NEEDS_RECONNECT' ? 'REAUTH_REQUIRED' : integrationStatus) || null;
  const isReauthRequired =
    effectiveStatus === 'REAUTH_REQUIRED' || integrationStatus === 'NEEDS_RECONNECT';

  return {
    effectiveStatus,
    integrationStatus,
    stateStatus,
    isReauthRequired,
    lastError:
      integration?.lastError || connectionState?.reasonMessage || connectionState?.reasonCode || null,
  };
}

function buildGa4StaleReason({
  missingConnectionsError,
  ga4Diagnostics,
}) {
  if (ga4Diagnostics?.isReauthRequired) return 'REAUTH_REQUIRED';
  if (ga4Diagnostics?.effectiveStatus && ga4Diagnostics.effectiveStatus !== 'CONNECTED') {
    return String(ga4Diagnostics.effectiveStatus);
  }
  if (missingConnectionsError) return 'MISSING_CONNECTIONS';
  return 'GA4_CONNECTION_DEGRADED';
}

async function getGa4FactsFreshness({
  tenantId,
  brandId,
  ga4PropertyId,
  dateRange,
}) {
  if (!prisma.factKondorMetricsDaily?.findFirst) {
    return {
      hasFacts: false,
      latestDate: null,
    };
  }

  const where = {
    tenantId: String(tenantId),
    brandId: String(brandId),
    platform: 'GA4',
  };
  if (ga4PropertyId) {
    where.accountId = String(ga4PropertyId);
  }

  const start = toStartOfDayUtc(dateRange?.start);
  const end = toEndOfDayUtc(dateRange?.end);
  if (start && end) {
    where.date = {
      gte: start,
      lte: end,
    };
  }

  const latest = await prisma.factKondorMetricsDaily.findFirst({
    where,
    select: { date: true },
    orderBy: { date: 'desc' },
  });

  return {
    hasFacts: Boolean(latest?.date),
    latestDate: latest?.date ? normalizeDateOnly(latest.date) : null,
  };
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
  if (!tenantId || !payload?.brandId) return null;
  const key = {
    tenantId: String(tenantId),
    brandId: String(payload.brandId),
    dateRange: payload.dateRange || null,
    dimensions: payload.dimensions || [],
    metrics: payload.metrics || [],
    filters: payload.filters || [],
    compareTo: payload.compareTo || null,
    limit: payload.limit || null,
    sort: payload.sort || null,
    pagination: payload.pagination || null,
    requiredPlatforms: payload.requiredPlatforms || null,
    responseFormat: payload.responseFormat || null,
    widgetId: payload.widgetId || null,
    widgetType: payload.widgetType || null,
  };
  return stableStringify(key);
}

function withTimeout(fn, timeoutMs, meta = {}) {
  const ms = Math.max(1, Number(timeoutMs || 0));
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      const err = new Error(meta?.message || 'Timeout');
      err.code = meta?.code || 'TIMEOUT';
      err.status = meta?.status || 504;
      reject(err);
    }, ms);

    Promise.resolve()
      .then(fn)
      .then((result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function withDashboardConcurrency(dashboardKey, fn) {
  if (!dashboardKey) return fn();

  let queue = dashboardQueues.get(dashboardKey);
  if (!queue) {
    queue = { inFlight: 0, pending: [] };
    dashboardQueues.set(dashboardKey, queue);
  }

  if (queue.inFlight >= METRICS_QUERY_CONCURRENCY_LIMIT) {
    await new Promise((resolve) => queue.pending.push(resolve));
  }

  queue.inFlight += 1;
  try {
    return await fn();
  } finally {
    queue.inFlight -= 1;
    const next = queue.pending.shift();
    if (next) next();
  }
}

function normalizeMetricCatalog(entries = []) {
  const map = new Map();
  (entries || []).forEach((entry) => {
    if (!entry?.key) return;
    map.set(entry.key, entry);
  });
  return map;
}

function buildMetricsPlan(metrics = [], catalog = new Map()) {
  const baseMetrics = [];
  const derivedMetrics = [];

  (metrics || []).forEach((metricKey) => {
    if (!metricKey) return;
    const key = String(metricKey);
    if (BASE_METRIC_COLUMN_MAP[key]) {
      baseMetrics.push({ key });
      return;
    }
    if (SUPPORTED_DERIVED_METRICS.has(key)) {
      derivedMetrics.push({ key });
      return;
    }
    // If catalog defines it as base metric, accept it.
    const entry = catalog.get(key);
    if (entry?.kind === 'base') {
      baseMetrics.push({ key });
    }
  });

  // Ensure derived metrics have dependencies available in SQL (computed on the fly).
  const need = (k) => baseMetrics.some((m) => m.key === k);
  const add = (k) => {
    if (!need(k) && BASE_METRIC_COLUMN_MAP[k]) baseMetrics.push({ key: k });
  };

  derivedMetrics.forEach((m) => {
    if (m.key === 'ctr') {
      add('clicks');
      add('impressions');
    }
    if (m.key === 'cpc') {
      add('spend');
      add('clicks');
    }
    if (m.key === 'cpm') {
      add('spend');
      add('impressions');
    }
    if (m.key === 'cpa') {
      add('spend');
      add('conversions');
    }
    if (m.key === 'roas') {
      add('revenue');
      add('spend');
    }
  });

  return { baseMetrics, derivedMetrics };
}

function buildCompareRange(start, end, mode) {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }

  const deltaDays = Math.max(0, Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1);
  if (!deltaDays) return null;

  const prevTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - (deltaDays - 1) * 24 * 60 * 60 * 1000);

  const fmt = (d) => d.toISOString().slice(0, 10);

  if (mode === 'previous_period') {
    return { start: fmt(prevFrom), end: fmt(prevTo) };
  }

  return null;
}

function buildWhereClause({
  filters = [],
  ga4PropertyId,
  applyGa4Scoping,
  startAt = 1,
} = {}) {
  const clauses = [];
  const params = [];
  const nextParam = () => Number(startAt) + params.length;

  (filters || []).forEach((filter) => {
    if (!filter?.field) return;
    const column = DIMENSION_COLUMN_MAP[filter.field] || null;
    if (!column) return;

    if (filter.field === 'platform') {
      if (filter.op === 'in') {
        const platforms = toArray(filter.value)
          .map((entry) => normalizePlatform(entry))
          .filter(Boolean);
        if (!platforms.length) return;
        clauses.push(`"${column}" = ANY($${nextParam()})`);
        params.push(platforms);
        return;
      }

      const platform = normalizePlatform(filter.value);
      if (!platform) return;
      clauses.push(`"${column}" = $${nextParam()}`);
      params.push(platform);
      return;
    }

    if (filter.op === 'eq') {
      clauses.push(`"${column}" = $${nextParam()}`);
      params.push(String(filter.value));
      return;
    }

    if (filter.op === 'in') {
      const values = toArray(filter.value).map((v) => String(v)).filter(Boolean);
      if (!values.length) return;
      clauses.push(`"${column}" = ANY($${nextParam()})`);
      params.push(values);
    }
  });

  if (applyGa4Scoping && ga4PropertyId) {
    // Canonical GA4 scoping: GA4 rows are partitioned by accountId (= propertyId).
    clauses.push(
      `("platform" <> 'GA4' OR "accountId" = $${nextParam()})`,
    );
    params.push(String(ga4PropertyId));
  }

  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

function buildSelectDimensions(dimensions = []) {
  const selected = [];
  const groupBy = [];

  (dimensions || []).forEach((dimensionKey) => {
    const column = DIMENSION_COLUMN_MAP[dimensionKey];
    if (!column) return;
    selected.push(`"${column}" AS "${dimensionKey}"`);
    groupBy.push(`"${column}"`);
  });

  return { selected, groupBy };
}

function buildSelectBaseMetrics(baseMetrics = []) {
  const selected = [];
  (baseMetrics || []).forEach((metric) => {
    const column = BASE_METRIC_COLUMN_MAP[metric.key];
    if (!column) return;
    selected.push(`COALESCE(SUM("${column}"), 0) AS "${metric.key}"`);
  });
  return selected;
}

function buildDerivedMetricSql(metricKey) {
  if (metricKey === 'ctr') {
    return `CASE WHEN COALESCE(SUM("impressions"),0) = 0 THEN 0
      ELSE COALESCE(SUM("clicks"),0) / NULLIF(COALESCE(SUM("impressions"),0),0) END`;
  }
  if (metricKey === 'cpc') {
    return `CASE WHEN COALESCE(SUM("clicks"),0) = 0 THEN 0
      ELSE COALESCE(SUM("spend"),0) / NULLIF(COALESCE(SUM("clicks"),0),0) END`;
  }
  if (metricKey === 'cpm') {
    return `CASE WHEN COALESCE(SUM("impressions"),0) = 0 THEN 0
      ELSE (COALESCE(SUM("spend"),0) / NULLIF(COALESCE(SUM("impressions"),0),0)) * 1000 END`;
  }
  if (metricKey === 'cpa') {
    return `CASE WHEN COALESCE(SUM("conversions"),0) = 0 THEN 0
      ELSE COALESCE(SUM("spend"),0) / NULLIF(COALESCE(SUM("conversions"),0),0) END`;
  }
  if (metricKey === 'roas') {
    return `CASE WHEN COALESCE(SUM("spend"),0) = 0 THEN 0
      ELSE COALESCE(SUM("revenue"),0) / NULLIF(COALESCE(SUM("spend"),0),0) END`;
  }
  return '0';
}

function buildSelectDerivedMetrics(derivedMetrics = []) {
  const selected = [];
  (derivedMetrics || []).forEach((metric) => {
    if (!SUPPORTED_DERIVED_METRICS.has(metric.key)) return;
    selected.push(`${buildDerivedMetricSql(metric.key)} AS "${metric.key}"`);
  });
  return selected;
}

async function runAggregates({
  tenantId,
  brandId,
  dateFrom,
  dateTo,
  dimensions,
  baseMetrics,
  derivedMetrics,
  filters,
  ga4PropertyId,
  sort,
  pagination,
  limit,
  applyGa4Scoping,
}) {
  const { selected: dimensionSelect, groupBy } = buildSelectDimensions(dimensions);
  const baseSelect = buildSelectBaseMetrics(baseMetrics);
  const derivedSelect = buildSelectDerivedMetrics(derivedMetrics);

  const { sql: filterSql, params: filterParams } = buildWhereClause({
    filters,
    ga4PropertyId,
    applyGa4Scoping,
    startAt: 5,
  });

  const whereParams = [String(tenantId), String(brandId), String(dateFrom), String(dateTo)];
  const params = [...whereParams, ...filterParams];

  const selectParts = [
    ...dimensionSelect,
    ...baseSelect,
    ...derivedSelect,
  ].filter(Boolean);

  const groupBySql = groupBy.length ? ` GROUP BY ${groupBy.join(', ')}` : '';

  let orderBySql = '';
  if (sort?.alias) {
    const dir = String(sort.direction || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    orderBySql = ` ORDER BY ${sort.alias} ${dir}`;
  }

  let limitSql = '';
  if (pagination?.pageSize) {
    const pageSize = Math.max(1, Math.min(5000, Number(pagination.pageSize)));
    const page = Math.max(1, Number(pagination.page || 1));
    const offset = (page - 1) * pageSize;
    limitSql = ` LIMIT ${pageSize} OFFSET ${offset}`;
  } else if (limit) {
    const safeLimit = Math.max(1, Math.min(5000, Number(limit)));
    limitSql = ` LIMIT ${safeLimit}`;
  }

  const baseSql = `
    FROM "fact_kondor_metrics_daily"
    WHERE "tenantId" = $1
      AND "brandId" = $2
      AND "date" >= $3::date
      AND "date" <= $4::date
      ${filterSql}
  `;

  const querySql = `
    SELECT ${selectParts.length ? selectParts.join(', ') : '1'}
    ${baseSql}
    ${groupBySql}
    ${orderBySql}
    ${limitSql}
  `;

  const totalsSql = `
    SELECT
      ${baseSelect.length ? baseSelect.join(', ') : '0 AS "spend"'}
    ${baseSql}
  `;

  const rows = await prisma.$queryRawUnsafe(querySql, ...params);
  const totalsRows = await prisma.$queryRawUnsafe(totalsSql, ...params);
  const totals = Array.isArray(totalsRows) && totalsRows[0] ? totalsRows[0] : {};

  return { rows: rows || [], totals: totals || {} };
}

function buildRows(plan, rawRows = []) {
  const out = [];
  (rawRows || []).forEach((row) => {
    const entry = {};
    (plan.dimensions || []).forEach((dimension) => {
      entry[dimension] = row?.[dimension] ?? null;
    });

    (plan.baseMetrics || []).forEach((m) => {
      entry[m.key] = Number(row?.[m.key] ?? 0);
    });

    (plan.derivedMetrics || []).forEach((m) => {
      entry[m.key] = Number(row?.[m.key] ?? 0);
    });

    out.push(entry);
  });
  return out;
}

function buildTotals(plan, rawTotals = {}) {
  const totals = {};
  (plan.baseMetrics || []).forEach((m) => {
    totals[m.key] = Number(rawTotals?.[m.key] ?? 0);
  });
  (plan.derivedMetrics || []).forEach((m) => {
    totals[m.key] = null;
  });
  return totals;
}

function formatReporteiResponse(result = {}, options = {}) {
  const { widgetId, widgetType } = options || {};
  return {
    widgetId: widgetId || null,
    widgetType: widgetType || null,
    data: {
      rows: result?.rows || [],
      totals: result?.totals || {},
    },
  };
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

  let ga4PropertyId = null;
  try {
    ga4PropertyId = await resolveBrandGa4ActivePropertyId({ tenantId, brandId });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[metrics.service] resolveBrandGa4ActivePropertyId warning', err?.message || err);
    }
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
  const requestedPlatforms = collectRequestedPlatforms({
    requiredPlatforms: payload.requiredPlatforms,
    filters,
  });

  let requiredConnections = null;
  let missingConnectionsError = null;
  try {
    requiredConnections = await assertRequiredPlatformsConnected({
      tenantId,
      brandId,
      requiredPlatforms: payload.requiredPlatforms,
      filters,
    });
  } catch (err) {
    if (err?.code !== 'MISSING_CONNECTIONS') throw err;
    missingConnectionsError = err;
  }

  const requiredPlatformsResolved = requiredConnections?.required || missingConnectionsError?.details?.required || Array.from(requestedPlatforms);
  const wantsGa4 = Array.isArray(requiredPlatformsResolved)
    ? requiredPlatformsResolved.includes('GA4')
    : false;

  if (wantsGa4 && !ga4PropertyId) {
    const err = new Error('GA4 property não configurada para esta marca');
    err.code = 'GA4_PROPERTY_REQUIRED';
    err.status = 409;
    throw err;
  }

  const ga4Diagnostics = wantsGa4
    ? await resolveGa4ConnectionDiagnostics(tenantId)
    : null;
  const ga4MissingOnly = missingConnectionsError
    ? (() => {
        const missing = toArray(missingConnectionsError?.details?.missing).map((item) =>
          String(item || '').toUpperCase()
        );
        if (!missing.includes('GA4')) return false;
        return missing.every((platform) => platform === 'GA4');
      })()
    : false;

  if (missingConnectionsError && !ga4MissingOnly) {
    throw missingConnectionsError;
  }

  const shouldHandleGa4AsDegraded =
    wantsGa4 && (ga4MissingOnly || ga4Diagnostics?.isReauthRequired === true);

  let degradedMeta = {
    connectionDegraded: false,
    stalePlatforms: [],
    staleReason: null,
    dataFreshUntil: null,
  };

  if (shouldHandleGa4AsDegraded) {
    const freshness = await getGa4FactsFreshness({
      tenantId,
      brandId,
      ga4PropertyId,
      dateRange: effectiveDateRange,
    });

    if (!freshness.hasFacts) {
      throw (
        missingConnectionsError ||
        buildMissingConnectionsError({
          required: requiredPlatformsResolved,
          missing: ['GA4'],
        })
      );
    }

    degradedMeta = {
      connectionDegraded: true,
      stalePlatforms: ['GA4'],
      staleReason: buildGa4StaleReason({
        missingConnectionsError,
        ga4Diagnostics,
      }),
      dataFreshUntil: freshness.latestDate || null,
    };
  }

  if (!requiredConnections) {
    requiredConnections = {
      required: requiredPlatformsResolved,
      missing: [],
    };
  }

  const catalogEntries = await prisma.metricsCatalog.findMany({
    where: { key: { in: metrics } },
  });

  const normalizedCatalog = normalizeMetricCatalog(catalogEntries);
  const plan = buildMetricsPlan(metrics, normalizedCatalog);
  const applyGa4Scoping = shouldApplyGa4Scoping({
    filters,
    requiredPlatforms: requiredConnections.required,
  });

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

  // --- On-demand preview sync (fills fact_kondor_metrics_daily) ---
  // Dashboards query facts from the warehouse table. If facts were never backfilled,
  // we run a small "preview" sync here so users see data immediately after connecting.
  // This mirrors the industry pattern: cheap preview (few metrics, short window) + async backfill.
  try {
    const ensurePayload = {
      tenantId,
      brandId,
      dateRange: effectiveDateRange,
      metrics: plan.baseMetrics.map((m) => m.key),
      dimensions,
      filters,
      requiredPlatforms: requiredConnections.required,
    };
    const skipOnlineGa4Ensure =
      wantsGa4 &&
      (degradedMeta.connectionDegraded || ga4Diagnostics?.isReauthRequired === true);

    // Keep these on-demand calls bounded: if provider APIs are slow, we prefer returning
    // an (even partial) response instead of timing out the whole dashboard.
    const ENSURE_TIMEOUT_MS = Math.max(
      2_000,
      Number(process.env.METRICS_ENSURE_TIMEOUT_MS || 20_000),
    );

    await withTimeout(
      async () => {
        // GA4 facts (sessions/leads) are stored in the same fact table.
        if (wantsGa4 && !skipOnlineGa4Ensure) {
          await ensureGa4FactMetrics(ensurePayload);
        }
        // Ads facts (spend/clicks/impressions/...) for Meta/Google/TikTok/LinkedIn.
        await ensureFactMetrics(ensurePayload);
      },
      ENSURE_TIMEOUT_MS,
      { code: 'METRICS_ENSURE_TIMEOUT', message: 'Tempo limite ao sincronizar métricas' },
    );

    // Facts may have been updated; avoid serving stale cached results for this brand.
    invalidateMetricsCacheForBrand(tenantId, brandId);
  } catch (err) {
    // Never fail the dashboard query because preview sync failed.
    if (isMetricsDebugEnabled() && process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[metrics.service] ensure facts warning', err?.message || err);
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
    applyGa4Scoping,
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
    if (range?.start && range?.end) {
      const compareResult = await runAggregates({
        tenantId,
        brandId,
        dateFrom: range.start,
        dateTo: range.end,
        dimensions,
        baseMetrics: plan.baseMetrics,
        derivedMetrics: [],
        filters,
        ga4PropertyId,
        sort: null,
        pagination: null,
        limit: null,
        applyGa4Scoping,
      });

      compare = {
        dateRange: range,
        totals: buildTotals(
          { requestedMetrics: metrics, baseMetrics: plan.baseMetrics, derivedMetrics: plan.derivedMetrics },
          compareResult.totals,
        ),
      };
    }
  }

  return {
    meta: {
      timezone: brandTimezone,
      dateRange: effectiveDateRange,
      ga4PropertyId: ga4PropertyId || null,
      requiredPlatforms: requiredConnections.required || [],
      connectionDegraded: degradedMeta.connectionDegraded === true,
      stalePlatforms: degradedMeta.stalePlatforms || [],
      staleReason: degradedMeta.staleReason || null,
      dataFreshUntil: degradedMeta.dataFreshUntil || null,
    },
    rows,
    totals,
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
  const formatted = formatReporteiResponse(result, {
    widgetId,
    widgetType,
    ...rest,
  });

  // Keep Reportei's widget-centric response while still exposing the canonical
  // meta (timezone/dateRange and GA4 active property). Frontend can ignore it.
  return {
    meta: result?.meta || {},
    ...(formatted && typeof formatted === 'object' ? formatted : {}),
  };
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
