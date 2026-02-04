const { prisma } = require('../../prisma');

const PLATFORM_ENUM = [
  'META_ADS',
  'GOOGLE_ADS',
  'TIKTOK_ADS',
  'LINKEDIN_ADS',
  'GA4',
  'GMB',
  'FB_IG',
];

const ADS_PLATFORMS = new Set([
  'META_ADS',
  'GOOGLE_ADS',
  'TIKTOK_ADS',
  'LINKEDIN_ADS',
  'FB_IG',
]);

const GA4_METRICS = new Set(['sessions', 'leads']);
const ADS_METRICS = new Set([
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'cpa',
  'conversions',
  'revenue',
  'roas',
]);

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

function normalizePlatform(value) {
  if (!value) return null;
  const normalized = String(value).toUpperCase();
  return PLATFORM_ENUM.includes(normalized) ? normalized : null;
}

function extractPlatformsFromFilters(filters = []) {
  const platforms = new Set();
  (filters || []).forEach((filter) => {
    if (filter.field !== 'platform') return;
    if (filter.op === 'eq' && filter.value) {
      const value = normalizePlatform(filter.value);
      if (value) platforms.add(value);
      return;
    }
    if (filter.op === 'in') {
      const values = Array.isArray(filter.value) ? filter.value : [];
      values.forEach((entry) => {
        const value = normalizePlatform(entry);
        if (value) platforms.add(value);
      });
    }
  });
  return platforms;
}

function inferPlatformsFromMetrics(metrics = []) {
  const platforms = new Set();
  let requiresAds = false;

  metrics.forEach((metric) => {
    if (GA4_METRICS.has(metric)) {
      platforms.add('GA4');
    } else if (ADS_METRICS.has(metric)) {
      requiresAds = true;
    }
  });

  return { platforms, requiresAds };
}

async function ensureBrandConnections(tenantId, brandId, payload = {}) {
  const explicitPlatforms = Array.isArray(payload.requiredPlatforms)
    ? payload.requiredPlatforms.map(normalizePlatform).filter(Boolean)
    : [];
  const filterPlatforms = extractPlatformsFromFilters(payload.filters || []);

  let platforms = new Set();
  let requiresAds = false;

  if (explicitPlatforms.length) {
    platforms = new Set(explicitPlatforms);
  } else if (filterPlatforms.size) {
    platforms = filterPlatforms;
  } else {
    const inferred = inferPlatformsFromMetrics(payload.metrics || []);
    platforms = inferred.platforms;
    requiresAds = inferred.requiresAds;
  }

  if (!platforms.size && !requiresAds) return;

  const platformsToCheck = new Set(platforms);
  if (requiresAds) {
    ADS_PLATFORMS.forEach((platform) => platformsToCheck.add(platform));
  }

  const activeConnections = await prisma.brandSourceConnection.findMany({
    where: {
      tenantId,
      brandId,
      platform: { in: Array.from(platformsToCheck) },
      status: 'ACTIVE',
    },
    select: { platform: true },
  });

  const activeSet = new Set(activeConnections.map((item) => item.platform));
  const missing = new Set();

  platforms.forEach((platform) => {
    if (!activeSet.has(platform)) missing.add(platform);
  });

  if (requiresAds) {
    const hasAds = Array.from(ADS_PLATFORMS).some((platform) =>
      activeSet.has(platform),
    );
    if (!hasAds) {
      ADS_PLATFORMS.forEach((platform) => missing.add(platform));
    }
  }

  if (missing.size) {
    const err = new Error('Conexões ausentes');
    err.code = 'MISSING_CONNECTIONS';
    err.status = 409;
    err.details = { missing: Array.from(missing) };
    throw err;
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
  const conditions = ['"tenantId" = $1', '"brandId" = $2', '"date" >= $3', '"date" <= $4'];
  const params = [tenantId, brandId, dateFrom, dateTo];
  let paramIndex = params.length + 1;

  (filters || []).forEach((filter) => {
    const column = DIMENSION_COLUMN_MAP[filter.field];
    if (!column) return;
    if (filter.op === 'eq') {
      conditions.push(`"${column}" = $${paramIndex}`);
      params.push(filter.value);
      paramIndex += 1;
      return;
    }

    if (filter.op === 'in') {
      const values = Array.isArray(filter.value) ? filter.value : [];
      if (!values.length) return;
      const placeholders = values.map(() => `$${paramIndex++}`);
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
  derivedMetrics,
  sort,
  pagination,
  limit,
}) {
  const { whereSql, params } = buildWhereClause({
    tenantId,
    brandId,
    dateFrom,
    dateTo,
    filters,
  });

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

  const baseQuery = `SELECT ${selectClause} FROM "fact_kondor_metrics_daily" WHERE ${whereSql} ${groupByClause} ${orderByClause} ${paginationClause}`;

  const totalsSelect = buildSelectClause({
    dimensions: [],
    baseMetrics,
    derivedMetrics: [],
  });
  const totalsQuery = `SELECT ${totalsSelect} FROM "fact_kondor_metrics_daily" WHERE ${whereSql}`;

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

async function queryMetrics(tenantId, payload = {}) {
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

  await ensureBrandConnections(tenantId, brandId, payload);

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

  const baseResult = await runAggregates({
    tenantId,
    brandId,
    dateFrom: dateRange.start,
    dateTo: dateRange.end,
    dimensions,
    baseMetrics: plan.baseMetrics,
    derivedMetrics: derivedForSelect,
    filters,
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
    const range = buildCompareRange(dateRange.start, dateRange.end, compareTo.mode);
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
      timezone: 'UTC',
      generatedAt: new Date().toISOString(),
    },
    rows,
    totals,
    pageInfo: baseResult.pageInfo,
    compare,
  };
}

module.exports = {
  queryMetrics,
  buildCompareRange,
  buildMetricsPlan,
  buildWhereClause,
};
