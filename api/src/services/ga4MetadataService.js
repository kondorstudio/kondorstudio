const ga4OAuthService = require('./ga4OAuthService');
const { google } = require('googleapis');
const ga4QuotaCache = require('./ga4QuotaCacheService');
const ga4DbCache = require('./ga4DbCacheService');

const DATA_API_VERSION = ['v1beta', 'v1alpha'].includes(process.env.GA4_DATA_API_VERSION)
  ? process.env.GA4_DATA_API_VERSION
  : 'v1beta';
const GA4_METADATA_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.GA4_METADATA_TIMEOUT_MS || process.env.GA4_HTTP_TIMEOUT_MS || 20_000),
);
const METADATA_TTL_MS = Math.max(0, Number(process.env.GA4_METADATA_TTL_MS || 24 * 60 * 60 * 1000));

function isTimeoutError(error) {
  if (!error) return false;
  const code = error?.code || error?.errno;
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('timed out');
}

function mapGoogleError(error, { propertyId } = {}) {
  if (isTimeoutError(error)) {
    const err = new Error('Tempo limite ao consultar metadados do GA4');
    err.status = 504;
    err.code = 'GA4_METADATA_TIMEOUT';
    err.details = {
      propertyId: propertyId ? String(propertyId) : null,
      timeoutMs: error?.config?.timeout || GA4_METADATA_TIMEOUT_MS,
    };
    return err;
  }

  const payload = (error?.response?.data && typeof error.response.data === 'object')
    ? error.response.data
    : {};
  const message =
    payload?.error?.message ||
    payload?.error_description ||
    payload?.error ||
    error?.message ||
    'GA4 Metadata API error';

  const err = new Error(message);
  err.status = error?.response?.status || error?.status || 500;
  err.code = 'GA4_METADATA_ERROR';
  err.details = {
    propertyId: propertyId ? String(propertyId) : null,
    status: payload?.error?.status || null,
  };
  return err;
}

function createAnalyticsDataClient(accessToken) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.analyticsdata({
    version: DATA_API_VERSION,
    auth: oauth2Client,
  });
}

function buildMockMetadata() {
  return {
    dimensions: [
      {
        apiName: 'date',
        uiName: 'Date',
        description: 'Date in YYYYMMDD format',
        category: 'Time',
        customDefinition: false,
      },
      {
        apiName: 'sessionSourceMedium',
        uiName: 'Session source / medium',
        description: 'Source and medium of the session',
        category: 'Traffic Source',
        customDefinition: false,
      },
      {
        apiName: 'country',
        uiName: 'Country',
        description: 'Country of the user',
        category: 'Geography',
        customDefinition: false,
      },
    ],
    metrics: [
      {
        apiName: 'sessions',
        uiName: 'Sessions',
        description: 'Count of sessions',
        category: 'Session',
        type: 'TYPE_INTEGER',
      },
      {
        apiName: 'activeUsers',
        uiName: 'Active users',
        description: 'Active users',
        category: 'User',
        type: 'TYPE_INTEGER',
      },
      {
        apiName: 'newUsers',
        uiName: 'New users',
        description: 'New users',
        category: 'User',
        type: 'TYPE_INTEGER',
      },
      {
        apiName: 'engagementRate',
        uiName: 'Engagement rate',
        description: 'Engagement rate',
        category: 'Engagement',
        type: 'TYPE_FLOAT',
      },
    ],
  };
}

async function fetchMetadata(accessToken, propertyId) {
  try {
    const client = createAnalyticsDataClient(accessToken);
    const res = await client.properties.getMetadata(
      { name: `properties/${String(propertyId)}/metadata` },
      { timeout: GA4_METADATA_TIMEOUT_MS },
    );
    const json = res?.data || {};

    const dimensions = Array.isArray(json.dimensions) ? json.dimensions : [];
    const metrics = Array.isArray(json.metrics) ? json.metrics : [];

    return {
      dimensions: dimensions.map((dim) => ({
        apiName: dim.apiName,
        uiName: dim.uiName,
        description: dim.description,
        category: dim.category,
        customDefinition: Boolean(dim.customDefinition),
      })),
      metrics: metrics.map((metric) => ({
        apiName: metric.apiName,
        uiName: metric.uiName,
        description: metric.description,
        category: metric.category,
        type: metric.type,
      })),
    };
  } catch (error) {
    throw mapGoogleError(error, { propertyId });
  }
}

async function getMetadata({ tenantId, userId, propertyId }) {
  if (!propertyId) {
    const err = new Error('propertyId missing');
    err.status = 400;
    throw err;
  }

  if (ga4OAuthService.isMockMode()) {
    return buildMockMetadata();
  }

  const cacheKey = ga4QuotaCache.buildCacheKey({
    tenantId,
    propertyId,
    payload: { kind: 'metadata' },
    kind: 'metadata',
  });

  const cached = await ga4QuotaCache.getMetadataCache(cacheKey);
  if (cached) return cached;

  const requestPayload = { kind: 'metadata' };
  const requestHash = ga4QuotaCache.hashValue(requestPayload);
  const dbCached = await ga4DbCache.getCache({
    tenantId,
    propertyId,
    kind: 'METADATA',
    requestHash,
  });
  if (dbCached) {
    await ga4QuotaCache.setMetadataCache(cacheKey, dbCached);
    return dbCached;
  }

  const accessToken = await ga4OAuthService.getValidAccessToken({
    tenantId,
    userId,
  });
  const metadata = await fetchMetadata(accessToken, propertyId);
  await ga4QuotaCache.setMetadataCache(cacheKey, metadata);
  await ga4DbCache.setCache({
    tenantId,
    propertyId,
    kind: 'METADATA',
    requestHash,
    request: requestPayload,
    response: metadata,
    ttlMs: METADATA_TTL_MS,
  });
  return metadata;
}

module.exports = {
  getMetadata,
  fetchMetadata,
  buildMockMetadata,
};
