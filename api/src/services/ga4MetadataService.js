const ga4OAuthService = require('./ga4OAuthService');
const ga4QuotaCache = require('./ga4QuotaCacheService');
const { fetchWithTimeout, isTimeoutError } = require('../lib/fetchWithTimeout');

const DATA_API_BASE =
  process.env.GA4_DATA_API_BASE_URL || 'https://analyticsdata.googleapis.com/v1beta';
const GA4_METADATA_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.GA4_METADATA_TIMEOUT_MS || process.env.GA4_HTTP_TIMEOUT_MS || 20_000),
);

function mapError(res, payload) {
  const message =
    payload?.error?.message ||
    payload?.error_description ||
    payload?.error ||
    'GA4 Metadata API error';
  const err = new Error(message);
  err.status = res.status;
  err.code = 'GA4_METADATA_ERROR';
  return err;
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
  const url = `${DATA_API_BASE}/properties/${encodeURIComponent(
    propertyId
  )}/metadata`;

  let res;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      GA4_METADATA_TIMEOUT_MS,
    );
  } catch (error) {
    if (isTimeoutError(error)) {
      const err = new Error('Tempo limite ao consultar metadados do GA4');
      err.status = 504;
      err.code = 'GA4_METADATA_TIMEOUT';
      err.details = {
        propertyId: propertyId ? String(propertyId) : null,
        timeoutMs: error?.timeoutMs || GA4_METADATA_TIMEOUT_MS,
      };
      throw err;
    }
    throw error;
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw mapError(res, json);

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

  const accessToken = await ga4OAuthService.getValidAccessToken({
    tenantId,
    userId,
  });
  const metadata = await fetchMetadata(accessToken, propertyId);
  await ga4QuotaCache.setMetadataCache(cacheKey, metadata);
  return metadata;
}

module.exports = {
  getMetadata,
  fetchMetadata,
  buildMockMetadata,
};
