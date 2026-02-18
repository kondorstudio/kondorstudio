const { prisma } = require('../prisma');
const { google } = require('googleapis');
const ga4OAuthService = require('./ga4OAuthService');
const ga4MetadataService = require('./ga4MetadataService');
const ga4QuotaCache = require('./ga4QuotaCacheService');
const ga4DbCache = require('./ga4DbCacheService');
const ga4ApiCallLogService = require('./ga4ApiCallLogService');
const rawStoreService = require('./rawStoreService');
const {
  executeWithReliability,
  defaultClassifyError,
} = require('../lib/reliability');

const DATA_API_VERSION = ['v1beta', 'v1alpha'].includes(process.env.GA4_DATA_API_VERSION)
  ? process.env.GA4_DATA_API_VERSION
  : 'v1beta';
const GA4_HTTP_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.GA4_HTTP_TIMEOUT_MS || process.env.FETCH_TIMEOUT_MS || 20_000),
);

const MAX_METRICS = Number(process.env.GA4_MAX_METRICS || 10);
const MAX_DIMENSIONS = Number(process.env.GA4_MAX_DIMENSIONS || 10);
const MAX_LIMIT = Number(process.env.GA4_MAX_LIMIT || 10000);
const MAX_OFFSET = Math.max(0, Number(process.env.GA4_MAX_OFFSET || 1_000_000));
const MAX_TOTAL_ROWS = Math.max(0, Number(process.env.GA4_MAX_TOTAL_ROWS || 50_000));
const FILTER_MAX_DEPTH = Math.max(1, Number(process.env.GA4_FILTER_MAX_DEPTH || 8));
const FILTER_MAX_NODES = Math.max(1, Number(process.env.GA4_FILTER_MAX_NODES || 200));

const DEFAULT_CACHE_TTL_MS = Math.max(0, Number(process.env.GA4_CACHE_TTL_MS || 120000));
const DEFAULT_REALTIME_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.GA4_REALTIME_CACHE_TTL_MS || 15000),
);

function toPositiveInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

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

function normalizeMinuteRanges(input) {
  const normalizeRange = (range) => {
    if (!range || typeof range !== 'object') return null;
    const startRaw = range.startMinutesAgo ?? range.start_minutes_ago ?? range.start;
    const endRaw = range.endMinutesAgo ?? range.end_minutes_ago ?? range.end;
    const startMinutesAgo = Number(startRaw);
    const endMinutesAgo = Number(endRaw);

    if (!Number.isFinite(startMinutesAgo) || !Number.isInteger(startMinutesAgo)) return null;
    if (!Number.isFinite(endMinutesAgo) || !Number.isInteger(endMinutesAgo)) return null;
    if (startMinutesAgo < 0 || startMinutesAgo > 29) return null;
    if (endMinutesAgo < 0 || endMinutesAgo > 29) return null;
    if (startMinutesAgo < endMinutesAgo) return null;

    return { startMinutesAgo, endMinutesAgo };
  };

  if (Array.isArray(input) && input.length) {
    const ranges = input.map(normalizeRange).filter(Boolean);
    if (ranges.length) return ranges;
  }

  if (input && typeof input === 'object') {
    if (input.type) {
      switch (String(input.type)) {
        case 'LAST_30_MINUTES':
        case 'LAST_30_MIN':
          return [{ startMinutesAgo: 29, endMinutesAgo: 0 }];
        case 'LAST_15_MINUTES':
        case 'LAST_15_MIN':
          return [{ startMinutesAgo: 14, endMinutesAgo: 0 }];
        case 'LAST_5_MINUTES':
        case 'LAST_5_MIN':
          return [{ startMinutesAgo: 4, endMinutesAgo: 0 }];
        default:
          break;
      }
    }

    const single = normalizeRange(input);
    if (single) return [single];
  }

  // GA4 realtime API only retains ~30 minutes; max startMinutesAgo is 29.
  return [{ startMinutesAgo: 29, endMinutesAgo: 0 }];
}

function isTimeoutError(error) {
  if (!error) return false;
  const code = error?.code || error?.errno;
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('timed out');
}

function mapTimeoutError(error, { endpoint, propertyId }) {
  if (!isTimeoutError(error)) return error;
  const err = new Error('Tempo limite ao consultar dados do GA4');
  err.status = 504;
  err.code = 'GA4_DATA_TIMEOUT';
  err.details = {
    endpoint,
    propertyId: propertyId ? String(propertyId) : null,
    timeoutMs: error?.config?.timeout || GA4_HTTP_TIMEOUT_MS,
  };
  return err;
}

function mapGoogleError(error, { endpoint, propertyId } = {}) {
  if (error?.code === 'RELIABILITY_CIRCUIT_OPEN') {
    return error;
  }

  const mappedTimeout = mapTimeoutError(error, { endpoint, propertyId });
  if (mappedTimeout !== error) return mappedTimeout;

  const payload = (error?.response?.data && typeof error.response.data === 'object')
    ? error.response.data
    : {};
  const status = error?.response?.status || error?.status || 500;

  const rawMessage =
    payload?.error?.message ||
    payload?.error_description ||
    payload?.error ||
    error?.message ||
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
    if (status === 403) {
      message = 'GA4 access denied for this property';
    } else if (status === 429) {
      message = 'GA4 quota exceeded. Try again later.';
    } else if (status === 400) {
      message = 'GA4 query is invalid';
    }
  }

  if (reason === 'SERVICE_DISABLED') {
    message = `${message}. Habilite a Google Analytics Data API no projeto.`;
  }

  const err = new Error(message);
  err.status = status;
  err.code = 'GA4_DATA_ERROR';
  err.details = {
    endpoint: endpoint || null,
    propertyId: propertyId ? String(propertyId) : null,
    reason,
    violations,
    status: payload?.error?.status || null,
  };
  return err;
}

async function appendGa4RawResponse({
  tenantId,
  propertyId,
  endpoint,
  request,
  response,
  httpStatus,
  cursor,
}) {
  try {
    await rawStoreService.appendRawApiResponse({
      tenantId,
      provider: 'GA4',
      connectionId: propertyId ? String(propertyId) : null,
      endpoint: String(endpoint || 'ga4'),
      params: {
        propertyId: propertyId ? String(propertyId) : null,
        request: request || null,
      },
      payload: response || {},
      cursor: cursor ? String(cursor) : null,
      httpStatus: httpStatus || null,
    });
  } catch (_err) {
    // best-effort raw append only
  }
}

function extractFilterFieldNames(expression) {
  if (!expression || typeof expression !== 'object') return [];
  const out = new Set();
  const state = { nodes: 0 };

  const walk = (node, depth) => {
    if (!node || typeof node !== 'object') return;
    if (depth > FILTER_MAX_DEPTH) {
      const err = new Error('filter expression too deep');
      err.status = 400;
      err.code = 'GA4_FILTER_TOO_COMPLEX';
      err.details = { maxDepth: FILTER_MAX_DEPTH };
      throw err;
    }

    state.nodes += 1;
    if (state.nodes > FILTER_MAX_NODES) {
      const err = new Error('filter expression too complex');
      err.status = 400;
      err.code = 'GA4_FILTER_TOO_COMPLEX';
      err.details = { maxNodes: FILTER_MAX_NODES };
      throw err;
    }

    if (node.filter && typeof node.filter === 'object') {
      const fieldName = node.filter.fieldName;
      if (fieldName) out.add(String(fieldName));
    }

    const andExpr = node.andGroup?.expressions;
    if (Array.isArray(andExpr)) {
      andExpr.forEach((expr) => walk(expr, depth + 1));
    }

    const orExpr = node.orGroup?.expressions;
    if (Array.isArray(orExpr)) {
      orExpr.forEach((expr) => walk(expr, depth + 1));
    }

    if (node.notExpression) {
      walk(node.notExpression, depth + 1);
    }
  };

  walk(expression, 0);
  return Array.from(out.values());
}

function extractOrderByFieldNames(orderBys) {
  const metricNames = new Set();
  const dimensionNames = new Set();
  if (!Array.isArray(orderBys)) {
    return { metricNames: [], dimensionNames: [] };
  }

  orderBys.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const metricName = entry.metric?.metricName;
    const dimensionName = entry.dimension?.dimensionName;
    if (metricName) metricNames.add(String(metricName));
    if (dimensionName) dimensionNames.add(String(dimensionName));
  });

  return {
    metricNames: Array.from(metricNames.values()),
    dimensionNames: Array.from(dimensionNames.values()),
  };
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

function ensureOffset(value) {
  if (value === null || value === undefined || value === '') return null;
  const offset = Number(value);
  if (!Number.isFinite(offset) || offset < 0 || !Number.isInteger(offset)) {
    const err = new Error('Invalid offset');
    err.status = 400;
    throw err;
  }
  if (MAX_OFFSET && offset > MAX_OFFSET) {
    const err = new Error('Offset too high');
    err.status = 400;
    throw err;
  }
  return offset;
}

function normalizeRunReportPayload(payload) {
  const metrics = normalizeList(payload.metrics);
  const dimensions = normalizeList(payload.dimensions);
  const dateRanges = normalizeDateRanges(payload.dateRanges || payload.dateRange);

  ensureArrayLimit(metrics, MAX_METRICS, 'metrics');
  ensureArrayLimit(dimensions, MAX_DIMENSIONS, 'dimensions');

  const limit = ensureLimit(payload.limit);
  const offset = ensureOffset(payload.offset);

  return {
    metrics,
    dimensions,
    dateRanges,
    dimensionFilter: payload.dimensionFilter || null,
    metricFilter: payload.metricFilter || null,
    orderBys: payload.orderBys || null,
    limit,
    offset,
  };
}

function normalizeRunRealtimePayload(payload) {
  const metrics = normalizeList(payload.metrics);
  const dimensions = normalizeList(payload.dimensions);
  const minuteRanges = normalizeMinuteRanges(payload.minuteRanges || payload.minuteRange);

  ensureArrayLimit(metrics, MAX_METRICS, 'metrics');
  ensureArrayLimit(dimensions, MAX_DIMENSIONS, 'dimensions');

  const limit = ensureLimit(payload.limit);

  return {
    metrics,
    dimensions,
    minuteRanges,
    dimensionFilter: payload.dimensionFilter || null,
    metricFilter: payload.metricFilter || null,
    orderBys: payload.orderBys || null,
    limit,
  };
}

function normalizeBatchRunReportsPayload(payload) {
  const maxRequests = Math.max(1, Number(process.env.GA4_BATCH_MAX_REQUESTS || 5));
  const rawRequests = Array.isArray(payload?.requests) ? payload.requests : [];
  if (!rawRequests.length) {
    const err = new Error('requests missing');
    err.status = 400;
    throw err;
  }
  if (rawRequests.length > maxRequests) {
    const err = new Error('Too many requests');
    err.status = 400;
    err.details = { maxRequests };
    throw err;
  }

  const requests = rawRequests.map((req) => normalizeRunReportPayload(req || {}));
  return { requests };
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
    rowCount:
      typeof raw.rowCount === 'number'
        ? raw.rowCount
        : Number.isFinite(Number(raw.rowCount))
          ? Number(raw.rowCount)
          : rows.length,
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
    rowCount,
    quota: null,
    mocked: true,
  };
}

function createAnalyticsDataClient(accessToken) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.analyticsdata({
    version: DATA_API_VERSION,
    auth: oauth2Client,
  });
}

function classifyGa4Error(error) {
  const defaultResult = defaultClassifyError(error);
  if (defaultResult.retryable) return defaultResult;

  const status = Number(error?.response?.status || error?.status) || null;
  if ([429, 500, 502, 503, 504].includes(status)) {
    return {
      retryable: true,
      status,
      code: error?.code || null,
    };
  }
  return defaultResult;
}

async function callWithReliability(
  executor,
  { endpoint, propertyId, runId, connectionKey } = {},
) {
  try {
    return await executeWithReliability(
      {
        provider: 'GA4',
        connectionKey: connectionKey || propertyId || 'default',
        runId: runId || null,
        timeoutMs: GA4_HTTP_TIMEOUT_MS,
        maxAttempts: toPositiveInt(process.env.GA4_HTTP_MAX_ATTEMPTS, 3),
        baseDelayMs: toPositiveInt(process.env.GA4_HTTP_RETRY_DELAY_MS, 250),
        maxDelayMs: toPositiveInt(
          process.env.GA4_HTTP_MAX_DELAY_MS || process.env.RELIABILITY_MAX_DELAY_MS,
          5000,
        ),
        jitterMs: toPositiveInt(process.env.GA4_HTTP_RETRY_JITTER_MS, 250),
        rateLimitMax: toPositiveInt(
          process.env.GA4_RATE_LIMIT_MAX || process.env.RELIABILITY_RATE_LIMIT_MAX,
          60,
        ),
        rateLimitWindowMs: toPositiveInt(
          process.env.GA4_RATE_LIMIT_WINDOW_MS || process.env.RELIABILITY_RATE_LIMIT_WINDOW_MS,
          60000,
        ),
        circuitFailureThreshold: toPositiveInt(
          process.env.GA4_CIRCUIT_FAILURE_THRESHOLD || process.env.RELIABILITY_CIRCUIT_FAILURE_THRESHOLD,
          5,
        ),
        circuitOpenMs: toPositiveInt(
          process.env.GA4_CIRCUIT_OPEN_MS || process.env.RELIABILITY_CIRCUIT_OPEN_MS,
          30000,
        ),
        classifyError: classifyGa4Error,
      },
      executor,
    );
  } catch (error) {
    throw mapGoogleError(error, { endpoint, propertyId });
  }
}

async function assertSelectedProperty({ tenantId, propertyId }) {
  if (!tenantId || !propertyId) return null;
  const selected = await prisma.integrationGoogleGa4Property.findFirst({
    where: {
      tenantId: String(tenantId),
      propertyId: String(propertyId),
      isSelected: true,
    },
  });
  if (!selected) {
    const err = new Error('GA4 property not selected');
    err.status = 400;
    err.code = 'GA4_PROPERTY_NOT_SELECTED';
    throw err;
  }
  return selected;
}

async function validateAgainstMetadata({
  tenantId,
  userId,
  propertyId,
  metrics,
  dimensions,
  dimensionFilter,
  metricFilter,
  orderBys,
}) {
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

  const invalidDimensionFilterFields = [];
  const invalidMetricFilterFields = [];
  const invalidOrderByMetrics = [];
  const invalidOrderByDimensions = [];

  if (dimensionFilter) {
    const fields = extractFilterFieldNames(dimensionFilter);
    invalidDimensionFilterFields.push(...fields.filter((field) => !dimensionSet.has(field)));
  }
  if (metricFilter) {
    const fields = extractFilterFieldNames(metricFilter);
    invalidMetricFilterFields.push(...fields.filter((field) => !metricSet.has(field)));
  }
  if (orderBys) {
    const fields = extractOrderByFieldNames(orderBys);
    invalidOrderByMetrics.push(
      ...fields.metricNames.filter((name) => !metricSet.has(name) || !metrics.includes(name)),
    );
    invalidOrderByDimensions.push(
      ...fields.dimensionNames.filter((name) => !dimensionSet.has(name) || !dimensions.includes(name)),
    );
  }

  if (
    invalidMetrics.length ||
    invalidDimensions.length ||
    invalidDimensionFilterFields.length ||
    invalidMetricFilterFields.length ||
    invalidOrderByMetrics.length ||
    invalidOrderByDimensions.length
  ) {
    const err = new Error('Invalid GA4 request fields');
    err.status = 400;
    err.details = {
      invalidMetrics,
      invalidDimensions,
      invalidDimensionFilterFields,
      invalidMetricFilterFields,
      invalidOrderByMetrics,
      invalidOrderByDimensions,
    };
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
  skipSelectionCheck,
  autoPaginate,
  maxRows,
  runId,
}) {
  if (!propertyId) {
    const err = new Error('propertyId missing');
    err.status = 400;
    throw err;
  }
  const normalized = normalizeRunReportPayload(payload || {});
  const paginateAll = Boolean(autoPaginate);
  const effectiveTtlMs =
    cacheTtlMs === undefined || cacheTtlMs === null ? DEFAULT_CACHE_TTL_MS : Number(cacheTtlMs);
  const cachePayload = paginateAll ? { ...normalized, pageMode: 'ALL' } : { ...normalized, pageMode: 'ONE' };

  if (ga4OAuthService.isMockMode()) {
    return buildMockReport(cachePayload);
  }

  if (!skipSelectionCheck) {
    await assertSelectedProperty({ tenantId, propertyId });
  }

  await validateAgainstMetadata({
    tenantId,
    userId,
    propertyId,
    metrics: normalized.metrics,
    dimensions: normalized.dimensions,
    dimensionFilter: normalized.dimensionFilter,
    metricFilter: normalized.metricFilter,
    orderBys: normalized.orderBys,
  });

  const requestHash = ga4QuotaCache.hashValue(cachePayload);
  const cacheKey = ga4QuotaCache.buildCacheKey({
    tenantId,
    propertyId,
    payload: cachePayload,
    kind: 'report',
  });

  const cached = await ga4QuotaCache.getCache(cacheKey);
  if (cached) return cached;

  const dbCached = await ga4DbCache.getCache({
    tenantId,
    propertyId,
    kind: 'REPORT',
    requestHash,
  });
  if (dbCached) {
    await ga4QuotaCache.setCache(cacheKey, dbCached, effectiveTtlMs);
    return dbCached;
  }

  if (rateKey) {
    await ga4QuotaCache.assertWithinRateLimit(rateKey);
  }

  return ga4QuotaCache.withPropertyLimit(propertyId, async () => {
    const startedAt = Date.now();

    try {
      const accessToken = await ga4OAuthService.getValidAccessToken({
        tenantId,
        userId,
      });

      const client = createAnalyticsDataClient(accessToken);

      const baseBody = {
        dateRanges: normalized.dateRanges,
        metrics: normalized.metrics.map((name) => ({ name })),
        dimensions: normalized.dimensions.map((name) => ({ name })),
        returnPropertyQuota: true,
      };

      if (normalized.dimensionFilter) baseBody.dimensionFilter = normalized.dimensionFilter;
      if (normalized.metricFilter) baseBody.metricFilter = normalized.metricFilter;
      if (normalized.orderBys) baseBody.orderBys = normalized.orderBys;

      const callPage = async ({ limit, offset }) => {
        const requestBody = { ...baseBody };
        if (limit !== null && limit !== undefined) requestBody.limit = String(limit);
        if (offset !== null && offset !== undefined) requestBody.offset = String(offset);

        const res = await callWithReliability(
          () =>
            client.properties.runReport(
              {
                property: `properties/${String(propertyId)}`,
                requestBody,
              },
              { timeout: GA4_HTTP_TIMEOUT_MS },
            ),
          {
            endpoint: 'runReport',
            propertyId,
            runId,
            connectionKey: propertyId,
          },
        );
        await appendGa4RawResponse({
          tenantId,
          propertyId,
          endpoint: 'runReport',
          request: requestBody,
          response: res?.data || {},
          httpStatus: 200,
          cursor: requestBody.offset || null,
        });
        return normalizeResponse(res?.data || {});
      };

      const limit = normalized.limit || null;
      const offset = normalized.offset || 0;

      if (!paginateAll) {
        const normalizedResponse = await callPage({ limit, offset });
        await ga4QuotaCache.setCache(cacheKey, normalizedResponse, effectiveTtlMs);
        await ga4DbCache.setCache({
          tenantId,
          propertyId,
          kind: 'REPORT',
          requestHash,
          request: cachePayload,
          response: normalizedResponse,
          ttlMs: effectiveTtlMs,
        });

        await ga4ApiCallLogService.logCall({
          tenantId,
          propertyId,
          kind: 'REPORT',
          requestHash,
          request: cachePayload,
          response: normalizedResponse,
          httpStatus: 200,
          durationMs: Date.now() - startedAt,
        });

        return normalizedResponse;
      }

      const pageSize = limit || MAX_LIMIT;
      const totalLimit = Number.isFinite(Number(maxRows))
        ? Math.max(0, Number(maxRows))
        : MAX_TOTAL_ROWS;

      const rows = [];
      let first = null;
      let currentOffset = offset;
      let truncated = false;
      let pages = 0;

      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const page = await callPage({ limit: pageSize, offset: currentOffset });
        pages += 1;
        if (!first) first = page;
        if (Array.isArray(page.rows) && page.rows.length) {
          rows.push(...page.rows);
        }

        const rowCount = Number(page.rowCount || 0);
        if (!page.rows || page.rows.length === 0) break;
        if (rowCount && rows.length >= rowCount) break;
        if (totalLimit && rows.length >= totalLimit) {
          truncated = true;
          break;
        }

        currentOffset += pageSize;
      }

      const result = {
        ...(first || {}),
        rows,
        rowCount: first?.rowCount ?? rows.length,
        meta: {
          ...(first?.meta || {}),
          ...(truncated ? { truncated: true, maxRows: totalLimit } : {}),
          paginated: true,
          pages,
        },
      };

      await ga4QuotaCache.setCache(cacheKey, result, effectiveTtlMs);
      await ga4DbCache.setCache({
        tenantId,
        propertyId,
        kind: 'REPORT',
        requestHash,
        request: cachePayload,
        response: result,
        ttlMs: effectiveTtlMs,
      });

      await ga4ApiCallLogService.logCall({
        tenantId,
        propertyId,
        kind: 'REPORT',
        requestHash,
        request: cachePayload,
        response: result,
        httpStatus: 200,
        durationMs: Date.now() - startedAt,
      });

      return result;
    } catch (err) {
      await ga4ApiCallLogService.logCall({
        tenantId,
        propertyId,
        kind: 'REPORT',
        requestHash,
        request: cachePayload,
        response: null,
        httpStatus: err?.status || err?.response?.status || null,
        error: err,
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }
  });
}

async function checkCompatibility({
  tenantId,
  userId,
  propertyId,
  payload,
  rateKey,
  cacheTtlMs,
  runId,
}) {
  if (!propertyId) {
    const err = new Error('propertyId missing');
    err.status = 400;
    throw err;
  }

  const normalized = normalizeCompatibilityPayload(payload || {});
  const effectiveTtlMs =
    cacheTtlMs === undefined || cacheTtlMs === null ? DEFAULT_CACHE_TTL_MS : Number(cacheTtlMs);

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

  await assertSelectedProperty({ tenantId, propertyId });

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

  const requestHash = ga4QuotaCache.hashValue(normalized);
  const cacheKey = ga4QuotaCache.buildCacheKey({
    tenantId,
    propertyId,
    payload: normalized,
    kind: 'compatibility',
  });

  const cached = await ga4QuotaCache.getCache(cacheKey);
  if (cached) return cached;

  const dbCached = await ga4DbCache.getCache({
    tenantId,
    propertyId,
    kind: 'COMPATIBILITY',
    requestHash,
  });
  if (dbCached) {
    await ga4QuotaCache.setCache(cacheKey, dbCached, effectiveTtlMs);
    return dbCached;
  }

  if (rateKey) {
    await ga4QuotaCache.assertWithinRateLimit(rateKey);
  }

  return ga4QuotaCache.withPropertyLimit(propertyId, async () => {
    const startedAt = Date.now();

    try {
      const accessToken = await ga4OAuthService.getValidAccessToken({
        tenantId,
        userId,
      });

      const client = createAnalyticsDataClient(accessToken);

      const requestBody = {
        metrics: normalized.metrics.map((name) => ({ name })),
        dimensions: normalized.dimensions.map((name) => ({ name })),
      };

      if (normalized.dimensionFilter) requestBody.dimensionFilter = normalized.dimensionFilter;
      if (normalized.metricFilter) requestBody.metricFilter = normalized.metricFilter;
      if (normalized.compatibilityFilter) {
        requestBody.compatibilityFilter = normalized.compatibilityFilter;
      }

      const res = await callWithReliability(
        () =>
          client.properties.checkCompatibility(
            {
              property: `properties/${String(propertyId)}`,
              requestBody,
            },
            { timeout: GA4_HTTP_TIMEOUT_MS },
          ),
        {
          endpoint: 'checkCompatibility',
          propertyId,
          runId,
          connectionKey: propertyId,
        },
      );

      const json = res?.data || {};
      await appendGa4RawResponse({
        tenantId,
        propertyId,
        endpoint: 'checkCompatibility',
        request: requestBody,
        response: json,
        httpStatus: 200,
      });

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

      await ga4QuotaCache.setCache(cacheKey, result, effectiveTtlMs);
      await ga4DbCache.setCache({
        tenantId,
        propertyId,
        kind: 'COMPATIBILITY',
        requestHash,
        request: normalized,
        response: result,
        ttlMs: effectiveTtlMs,
      });

      await ga4ApiCallLogService.logCall({
        tenantId,
        propertyId,
        kind: 'COMPATIBILITY',
        requestHash,
        request: normalized,
        response: result,
        httpStatus: 200,
        durationMs: Date.now() - startedAt,
      });

      return result;
    } catch (err) {
      await ga4ApiCallLogService.logCall({
        tenantId,
        propertyId,
        kind: 'COMPATIBILITY',
        requestHash,
        request: normalized,
        response: null,
        httpStatus: err?.status || err?.response?.status || null,
        error: err,
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }
  });
}

async function runRealtimeReport({
  tenantId,
  userId,
  propertyId,
  payload,
  rateKey,
  cacheTtlMs,
  skipSelectionCheck,
  runId,
}) {
  if (!propertyId) {
    const err = new Error('propertyId missing');
    err.status = 400;
    throw err;
  }

  const normalized = normalizeRunRealtimePayload(payload || {});
  if (!normalized.metrics.length) {
    const err = new Error('metrics missing');
    err.status = 400;
    throw err;
  }

  const effectiveTtlMs =
    cacheTtlMs === undefined || cacheTtlMs === null ? DEFAULT_REALTIME_CACHE_TTL_MS : Number(cacheTtlMs);

  if (ga4OAuthService.isMockMode()) {
    return buildMockReport(normalized);
  }

  if (!skipSelectionCheck) {
    await assertSelectedProperty({ tenantId, propertyId });
  }

  await validateAgainstMetadata({
    tenantId,
    userId,
    propertyId,
    metrics: normalized.metrics,
    dimensions: normalized.dimensions,
    dimensionFilter: normalized.dimensionFilter,
    metricFilter: normalized.metricFilter,
    orderBys: normalized.orderBys,
  });

  const requestHash = ga4QuotaCache.hashValue(normalized);
  const cacheKey = ga4QuotaCache.buildCacheKey({
    tenantId,
    propertyId,
    payload: normalized,
    kind: 'realtime',
  });

  const cached = await ga4QuotaCache.getCache(cacheKey);
  if (cached) return cached;

  const dbCached = await ga4DbCache.getCache({
    tenantId,
    propertyId,
    kind: 'REALTIME',
    requestHash,
  });
  if (dbCached) {
    await ga4QuotaCache.setCache(cacheKey, dbCached, effectiveTtlMs);
    return dbCached;
  }

  if (rateKey) {
    await ga4QuotaCache.assertWithinRateLimit(rateKey);
  }

  return ga4QuotaCache.withPropertyLimit(propertyId, async () => {
    const startedAt = Date.now();

    try {
      const accessToken = await ga4OAuthService.getValidAccessToken({
        tenantId,
        userId,
      });

      const client = createAnalyticsDataClient(accessToken);

      const requestBody = {
        minuteRanges: normalized.minuteRanges,
        metrics: normalized.metrics.map((name) => ({ name })),
        dimensions: normalized.dimensions.map((name) => ({ name })),
        returnPropertyQuota: true,
      };

      if (normalized.dimensionFilter) requestBody.dimensionFilter = normalized.dimensionFilter;
      if (normalized.metricFilter) requestBody.metricFilter = normalized.metricFilter;
      if (normalized.orderBys) requestBody.orderBys = normalized.orderBys;
      if (normalized.limit) requestBody.limit = String(normalized.limit);

      const res = await callWithReliability(
        () =>
          client.properties.runRealtimeReport(
            {
              property: `properties/${String(propertyId)}`,
              requestBody,
            },
            { timeout: GA4_HTTP_TIMEOUT_MS },
          ),
        {
          endpoint: 'runRealtimeReport',
          propertyId,
          runId,
          connectionKey: propertyId,
        },
      );
      await appendGa4RawResponse({
        tenantId,
        propertyId,
        endpoint: 'runRealtimeReport',
        request: requestBody,
        response: res?.data || {},
        httpStatus: 200,
      });

      const result = normalizeResponse(res?.data || {});

      await ga4QuotaCache.setCache(cacheKey, result, effectiveTtlMs);
      await ga4DbCache.setCache({
        tenantId,
        propertyId,
        kind: 'REALTIME',
        requestHash,
        request: normalized,
        response: result,
        ttlMs: effectiveTtlMs,
      });

      await ga4ApiCallLogService.logCall({
        tenantId,
        propertyId,
        kind: 'REALTIME',
        requestHash,
        request: normalized,
        response: result,
        httpStatus: 200,
        durationMs: Date.now() - startedAt,
      });

      return result;
    } catch (err) {
      await ga4ApiCallLogService.logCall({
        tenantId,
        propertyId,
        kind: 'REALTIME',
        requestHash,
        request: normalized,
        response: null,
        httpStatus: err?.status || err?.response?.status || null,
        error: err,
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }
  });
}

async function batchRunReports({
  tenantId,
  userId,
  propertyId,
  payload,
  rateKey,
  cacheTtlMs,
  skipSelectionCheck,
  runId,
}) {
  if (!propertyId) {
    const err = new Error('propertyId missing');
    err.status = 400;
    throw err;
  }

  const normalized = normalizeBatchRunReportsPayload(payload || {});
  const effectiveTtlMs =
    cacheTtlMs === undefined || cacheTtlMs === null ? DEFAULT_CACHE_TTL_MS : Number(cacheTtlMs);

  if (ga4OAuthService.isMockMode()) {
    return {
      reports: normalized.requests.map((req) => buildMockReport(req)),
      meta: { mocked: true },
    };
  }

  if (!skipSelectionCheck) {
    await assertSelectedProperty({ tenantId, propertyId });
  }

  for (const req of normalized.requests) {
    // eslint-disable-next-line no-await-in-loop
    await validateAgainstMetadata({
      tenantId,
      userId,
      propertyId,
      metrics: req.metrics,
      dimensions: req.dimensions,
      dimensionFilter: req.dimensionFilter,
      metricFilter: req.metricFilter,
      orderBys: req.orderBys,
    });
  }

  const requestHash = ga4QuotaCache.hashValue(normalized);
  const cacheKey = ga4QuotaCache.buildCacheKey({
    tenantId,
    propertyId,
    payload: normalized,
    kind: 'batch_report',
  });

  const cached = await ga4QuotaCache.getCache(cacheKey);
  if (cached) return cached;

  const dbCached = await ga4DbCache.getCache({
    tenantId,
    propertyId,
    kind: 'BATCH_REPORT',
    requestHash,
  });
  if (dbCached) {
    await ga4QuotaCache.setCache(cacheKey, dbCached, effectiveTtlMs);
    return dbCached;
  }

  if (rateKey) {
    await ga4QuotaCache.assertWithinRateLimit(rateKey);
  }

  return ga4QuotaCache.withPropertyLimit(propertyId, async () => {
    const startedAt = Date.now();

    try {
      const accessToken = await ga4OAuthService.getValidAccessToken({
        tenantId,
        userId,
      });
      const client = createAnalyticsDataClient(accessToken);

      const requests = normalized.requests.map((req) => {
        const requestBody = {
          dateRanges: req.dateRanges,
          metrics: req.metrics.map((name) => ({ name })),
          dimensions: req.dimensions.map((name) => ({ name })),
          returnPropertyQuota: true,
        };
        if (req.dimensionFilter) requestBody.dimensionFilter = req.dimensionFilter;
        if (req.metricFilter) requestBody.metricFilter = req.metricFilter;
        if (req.orderBys) requestBody.orderBys = req.orderBys;
        if (req.limit) requestBody.limit = String(req.limit);
        if (req.offset !== null && req.offset !== undefined) requestBody.offset = String(req.offset);
        return requestBody;
      });

      const res = await callWithReliability(
        () =>
          client.properties.batchRunReports(
            {
              property: `properties/${String(propertyId)}`,
              requestBody: { requests },
            },
            { timeout: GA4_HTTP_TIMEOUT_MS },
          ),
        {
          endpoint: 'batchRunReports',
          propertyId,
          runId,
          connectionKey: propertyId,
        },
      );
      await appendGa4RawResponse({
        tenantId,
        propertyId,
        endpoint: 'batchRunReports',
        request: { requests },
        response: res?.data || {},
        httpStatus: 200,
      });

      const rawReports = Array.isArray(res?.data?.reports) ? res.data.reports : [];
      const reports = rawReports.map((r) => normalizeResponse(r || {}));
      const result = {
        reports,
      };

      await ga4QuotaCache.setCache(cacheKey, result, effectiveTtlMs);
      await ga4DbCache.setCache({
        tenantId,
        propertyId,
        kind: 'BATCH_REPORT',
        requestHash,
        request: normalized,
        response: result,
        ttlMs: effectiveTtlMs,
      });

      await ga4ApiCallLogService.logCall({
        tenantId,
        propertyId,
        kind: 'BATCH_REPORT',
        requestHash,
        request: normalized,
        response: result,
        httpStatus: 200,
        durationMs: Date.now() - startedAt,
      });

      return result;
    } catch (err) {
      await ga4ApiCallLogService.logCall({
        tenantId,
        propertyId,
        kind: 'BATCH_REPORT',
        requestHash,
        request: normalized,
        response: null,
        httpStatus: err?.status || err?.response?.status || null,
        error: err,
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }
  });
}

module.exports = {
  runReport,
  checkCompatibility,
  runRealtimeReport,
  batchRunReports,
  normalizeRunReportPayload,
  normalizeRunRealtimePayload,
  normalizeBatchRunReportsPayload,
  normalizeResponse,
  buildMockReport,
};
