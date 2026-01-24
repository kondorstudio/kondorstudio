const ga4OAuthService = require('./ga4OAuthService');
const ga4MetadataService = require('./ga4MetadataService');
const ga4QuotaCache = require('./ga4QuotaCacheService');

const DATA_API_BASE =
  process.env.GA4_DATA_API_BASE_URL || 'https://analyticsdata.googleapis.com/v1beta';

const MAX_METRICS = Number(process.env.GA4_MAX_METRICS || 10);
const MAX_DIMENSIONS = Number(process.env.GA4_MAX_DIMENSIONS || 10);
const MAX_LIMIT = Number(process.env.GA4_MAX_LIMIT || 10000);

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  return [String(value)];
}

function normalizeDateRanges(input) {
  if (Array.isArray(input) && input.length) {
    return input
      .map((range) => ({
        startDate: range?.startDate || range?.start_date,
        endDate: range?.endDate || range?.end_date,
      }))
      .filter((range) => range.startDate && range.endDate);
  }

  if (input && typeof input === 'object') {
    if (input.type) {
      switch (String(input.type)) {
        case 'LAST_7_DAYS':
          return [{ startDate: '7daysAgo', endDate: 'today' }];
        case 'LAST_30_DAYS':
          return [{ startDate: '30daysAgo', endDate: 'today' }];
        case 'LAST_90_DAYS':
          return [{ startDate: '90daysAgo', endDate: 'today' }];
        case 'THIS_MONTH':
          return [{ startDate: 'firstDayOfMonth', endDate: 'today' }];
        case 'LAST_MONTH':
          return [{ startDate: 'firstDayOfPreviousMonth', endDate: 'lastDayOfPreviousMonth' }];
        default:
          break;
      }
    }
    if (input.startDate && input.endDate) {
      return [{ startDate: input.startDate, endDate: input.endDate }];
    }
  }

  return [{ startDate: '30daysAgo', endDate: 'today' }];
}

function mapError(res, payload) {
  const rawMessage =
    payload?.error?.message ||
    payload?.error_description ||
    payload?.error ||
    '';
  let message = rawMessage || 'GA4 Data API error';

  const details = Array.isArray(payload?.error?.details)
    ? payload.error.details
    : [];
  const reasonEntry = details.find((item) => item?.reason);
  const reason = reasonEntry?.reason || null;
  const badRequest = details.find((item) => Array.isArray(item?.fieldViolations));
  const violations = Array.isArray(badRequest?.fieldViolations)
    ? badRequest.fieldViolations.map((item) => ({
        field: item.field || null,
        description: item.description || null,
      }))
    : [];

  if (!rawMessage) {
    if (res.status === 403) {
      message = 'GA4 access denied for this property';
    } else if (res.status === 429) {
      message = 'GA4 quota exceeded. Try again later.';
    } else if (res.status === 400) {
      message = 'GA4 query is invalid';
    }
  }

  if (reason === 'SERVICE_DISABLED') {
    message = `${message}. Habilite a Google Analytics Data API no projeto.`;
  }

  const err = new Error(message);
  err.status = res.status;
  err.code = 'GA4_DATA_ERROR';
  err.details = {
    reason,
    violations,
    status: payload?.error?.status || null,
  };
  return err;
}

function ensureArrayLimit(list, limit, label) {
  if (list.length > limit) {
    const err = new Error(`${label} limit exceeded`);
    err.status = 400;
    throw err;
  }
}

function ensureLimit(value) {
  if (!value) return null;
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) {
    const err = new Error('Invalid limit');
    err.status = 400;
    throw err;
  }
  if (limit > MAX_LIMIT) {
    const err = new Error('Limit too high');
    err.status = 400;
    throw err;
  }
  return limit;
}

function normalizeRunReportPayload(payload) {
  const metrics = normalizeList(payload.metrics);
  const dimensions = normalizeList(payload.dimensions);
  const dateRanges = normalizeDateRanges(payload.dateRanges || payload.dateRange);

  ensureArrayLimit(metrics, MAX_METRICS, 'metrics');
  ensureArrayLimit(dimensions, MAX_DIMENSIONS, 'dimensions');

  const limit = ensureLimit(payload.limit);

  return {
    metrics,
    dimensions,
    dateRanges,
    dimensionFilter: payload.dimensionFilter || null,
    metricFilter: payload.metricFilter || null,
    orderBys: payload.orderBys || null,
    limit,
  };
}

function normalizeCompatibilityPayload(payload) {
  const metrics = normalizeList(payload.metrics);
  const dimensions = normalizeList(payload.dimensions);

  ensureArrayLimit(metrics, MAX_METRICS, 'metrics');
  ensureArrayLimit(dimensions, MAX_DIMENSIONS, 'dimensions');

  return {
    metrics,
    dimensions,
    dimensionFilter: payload.dimensionFilter || null,
    metricFilter: payload.metricFilter || null,
    compatibilityFilter: payload.compatibilityFilter || null,
  };
}

function normalizeResponse(raw) {
  const dimensionHeaders = Array.isArray(raw.dimensionHeaders)
    ? raw.dimensionHeaders.map((h) => h.name)
    : [];
  const metricHeaders = Array.isArray(raw.metricHeaders)
    ? raw.metricHeaders.map((h) => h.name)
    : [];
  const rows = Array.isArray(raw.rows)
    ? raw.rows.map((row) => ({
        dimensions: Array.isArray(row.dimensionValues)
          ? row.dimensionValues.map((v) => v.value)
          : [],
        metrics: Array.isArray(row.metricValues)
          ? row.metricValues.map((v) => v.value)
          : [],
      }))
    : [];

  const totals = Array.isArray(raw.totals)
    ? raw.totals.map((total) => ({
        dimensions: Array.isArray(total.dimensionValues)
          ? total.dimensionValues.map((v) => v.value)
          : [],
        metrics: Array.isArray(total.metricValues)
          ? total.metricValues.map((v) => v.value)
          : [],
      }))
    : [];

  return {
    dimensionHeaders,
    metricHeaders,
    rows,
    totals,
    quota: raw.propertyQuota || null,
  };
}

function buildMockReport(payload) {
  const metrics = payload.metrics;
  const dimensions = payload.dimensions;
  const rows = [];
  const rowCount = dimensions.includes('date') ? 7 : 5;
  for (let i = 0; i < rowCount; i += 1) {
    const dims = dimensions.map((dim) => {
      if (dim === 'date') {
        const day = String(20 + i).padStart(2, '0');
        return `2025-01-${day}`;
      }
      return `${dim}-${i + 1}`;
    });
    const mets = metrics.map((metric) => String((i + 1) * 100));
    rows.push({ dimensions: dims, metrics: mets });
  }
  const totals = metrics.length
    ? [
        {
          dimensions: [],
          metrics: metrics.map(() => String(rowCount * 100)),
        },
      ]
    : [];
  return {
    dimensionHeaders: dimensions,
    metricHeaders: metrics,
    rows,
    totals,
    quota: null,
    mocked: true,
  };
}

async function validateAgainstMetadata({ tenantId, userId, propertyId, metrics, dimensions }) {
  const metadata = await ga4MetadataService.getMetadata({
    tenantId,
    userId,
    propertyId,
  });

  const metricSet = new Set((metadata.metrics || []).map((m) => m.apiName));
  const dimensionSet = new Set((metadata.dimensions || []).map((d) => d.apiName));

  const invalidMetrics = metrics.filter((metric) => !metricSet.has(metric));
  const invalidDimensions = dimensions.filter(
    (dimension) => !dimensionSet.has(dimension)
  );

  if (invalidMetrics.length || invalidDimensions.length) {
    const err = new Error('Invalid metrics or dimensions');
    err.status = 400;
    err.details = { invalidMetrics, invalidDimensions };
    throw err;
  }
}

async function runReport({
  tenantId,
  userId,
  propertyId,
  payload,
  rateKey,
  cacheTtlMs,
}) {
  if (!propertyId) {
    const err = new Error('propertyId missing');
    err.status = 400;
    throw err;
  }
  const normalized = normalizeRunReportPayload(payload || {});

  if (ga4OAuthService.isMockMode()) {
    return buildMockReport(normalized);
  }

  await validateAgainstMetadata({
    tenantId,
    userId,
    propertyId,
    metrics: normalized.metrics,
    dimensions: normalized.dimensions,
  });

  const cacheKey = ga4QuotaCache.buildCacheKey({
    tenantId,
    propertyId,
    payload: normalized,
    kind: 'report',
  });

  const cached = await ga4QuotaCache.getCache(cacheKey);
  if (cached) return cached;

  if (rateKey) {
    await ga4QuotaCache.assertWithinRateLimit(rateKey);
  }

  return ga4QuotaCache.withPropertyLimit(propertyId, async () => {
    const accessToken = await ga4OAuthService.getValidAccessToken({
      tenantId,
      userId,
    });

    const url = `${DATA_API_BASE}/properties/${encodeURIComponent(
      propertyId
    )}:runReport`;

    const body = {
      dateRanges: normalized.dateRanges,
      metrics: normalized.metrics.map((name) => ({ name })),
      dimensions: normalized.dimensions.map((name) => ({ name })),
      returnPropertyQuota: true,
    };

    if (normalized.dimensionFilter) body.dimensionFilter = normalized.dimensionFilter;
    if (normalized.metricFilter) body.metricFilter = normalized.metricFilter;
    if (normalized.orderBys) body.orderBys = normalized.orderBys;
    if (normalized.limit) body.limit = normalized.limit;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw mapError(res, json);

    const normalizedResponse = normalizeResponse(json);
    await ga4QuotaCache.setCache(cacheKey, normalizedResponse, cacheTtlMs);
    return normalizedResponse;
  });
}

async function checkCompatibility({
  tenantId,
  userId,
  propertyId,
  payload,
  rateKey,
  cacheTtlMs,
}) {
  if (!propertyId) {
    const err = new Error('propertyId missing');
    err.status = 400;
    throw err;
  }

  const normalized = normalizeCompatibilityPayload(payload || {});

  if (!normalized.metrics.length) {
    return {
      compatible: true,
      metrics: normalized.metrics,
      dimensions: normalized.dimensions,
      incompatibleMetrics: [],
      incompatibleDimensions: [],
      meta: { skipped: true },
    };
  }

  if (ga4OAuthService.isMockMode()) {
    return {
      compatible: true,
      metrics: normalized.metrics,
      dimensions: normalized.dimensions,
      incompatibleMetrics: [],
      incompatibleDimensions: [],
      meta: { mocked: true },
    };
  }

  try {
    await validateAgainstMetadata({
      tenantId,
      userId,
      propertyId,
      metrics: normalized.metrics,
      dimensions: normalized.dimensions,
    });
  } catch (err) {
    if (err.details) {
      return {
        compatible: false,
        metrics: normalized.metrics,
        dimensions: normalized.dimensions,
        incompatibleMetrics: err.details.invalidMetrics || [],
        incompatibleDimensions: err.details.invalidDimensions || [],
        meta: { invalid: true },
      };
    }
    throw err;
  }

  const cacheKey = ga4QuotaCache.buildCacheKey({
    tenantId,
    propertyId,
    payload: { ...normalized, kind: 'compatibility' },
    kind: 'compatibility',
  });

  const cached = await ga4QuotaCache.getCache(cacheKey);
  if (cached) return cached;

  if (rateKey) {
    await ga4QuotaCache.assertWithinRateLimit(rateKey);
  }

  return ga4QuotaCache.withPropertyLimit(propertyId, async () => {
    const accessToken = await ga4OAuthService.getValidAccessToken({
      tenantId,
      userId,
    });

    const url = `${DATA_API_BASE}/properties/${encodeURIComponent(
      propertyId
    )}:checkCompatibility`;

    const body = {
      metrics: normalized.metrics.map((name) => ({ name })),
      dimensions: normalized.dimensions.map((name) => ({ name })),
    };

    if (normalized.dimensionFilter) body.dimensionFilter = normalized.dimensionFilter;
    if (normalized.metricFilter) body.metricFilter = normalized.metricFilter;
    if (normalized.compatibilityFilter) {
      body.compatibilityFilter = normalized.compatibilityFilter;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw mapError(res, json);

    const metricCompat = Array.isArray(json.metricCompatibilities)
      ? json.metricCompatibilities
      : [];
    const dimensionCompat = Array.isArray(json.dimensionCompatibilities)
      ? json.dimensionCompatibilities
      : [];

    const incompatibleMetrics = metricCompat
      .filter((item) => item.compatibility && item.compatibility !== 'COMPATIBLE')
      .map((item) => item.metricMetadata?.apiName)
      .filter(Boolean);

    const incompatibleDimensions = dimensionCompat
      .filter((item) => item.compatibility && item.compatibility !== 'COMPATIBLE')
      .map((item) => item.dimensionMetadata?.apiName)
      .filter(Boolean);

    const result = {
      compatible: !incompatibleMetrics.length && !incompatibleDimensions.length,
      metrics: normalized.metrics,
      dimensions: normalized.dimensions,
      incompatibleMetrics,
      incompatibleDimensions,
    };

    await ga4QuotaCache.setCache(cacheKey, result, cacheTtlMs);
    return result;
  });
}

module.exports = {
  runReport,
  checkCompatibility,
  normalizeRunReportPayload,
  normalizeResponse,
  buildMockReport,
};
