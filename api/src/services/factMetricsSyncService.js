const { prisma } = require('../prisma');
const metaMetricsService = require('./metaMetricsService');
const googleAdsMetricsService = require('./googleAdsMetricsService');
const tiktokMetricsService = require('./tiktokMetricsService');
const linkedinAdsMetricsService = require('./linkedinAdsMetricsService');

const PLATFORM_SOURCE_MAP = {
  META_ADS: 'META_ADS',
  GOOGLE_ADS: 'GOOGLE_ADS',
  TIKTOK_ADS: 'TIKTOK_ADS',
  LINKEDIN_ADS: 'LINKEDIN_ADS',
  GA4: 'GA4',
  GMB: 'GBP',
  FB_IG: 'META_SOCIAL',
};

const PLATFORM_SERVICE_MAP = {
  META_ADS: metaMetricsService,
  GOOGLE_ADS: googleAdsMetricsService,
  TIKTOK_ADS: tiktokMetricsService,
  LINKEDIN_ADS: linkedinAdsMetricsService,
};

const PLATFORM_METRIC_LIMITS = {
  META_ADS: ['impressions', 'clicks', 'spend', 'conversions', 'revenue'],
  GOOGLE_ADS: ['impressions', 'clicks', 'spend', 'conversions', 'revenue'],
  TIKTOK_ADS: ['impressions', 'clicks', 'spend', 'conversions', 'revenue'],
  LINKEDIN_ADS: ['impressions', 'clicks', 'spend', 'conversions', 'revenue'],
  GA4: ['sessions', 'leads'],
};

const SUPPORTED_METRICS = new Set([
  'impressions',
  'clicks',
  'spend',
  'conversions',
  'revenue',
  'sessions',
  'leads',
]);

const DEFAULT_CURRENCY = process.env.DEFAULT_REPORT_CURRENCY || 'BRL';
const SYNC_TTL_MS = Math.max(
  60_000,
  Number(process.env.FACT_METRICS_SYNC_TTL_MS || 5 * 60 * 1000),
);

const syncCache = new Map();
const syncInFlight = new Map();

function normalizeDateKey(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizePlatform(value) {
  if (!value) return null;
  return String(value).trim().toUpperCase();
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return num;
}

function toBigInt(value) {
  const num = toNumber(value);
  return BigInt(Math.round(num));
}

function extractFilterValues(filters = [], field) {
  const out = [];
  (filters || []).forEach((filter) => {
    if (!filter || filter.field !== field) return;
    if (filter.op === 'eq') {
      out.push(String(filter.value));
      return;
    }
    if (filter.op === 'in') {
      const list = Array.isArray(filter.value) ? filter.value : [filter.value];
      list.forEach((item) => out.push(String(item)));
    }
  });
  return out.filter(Boolean);
}

function buildSyncKey(tenantId, brandId, platform, accountId, dateRange) {
  if (!tenantId || !brandId || !platform || !accountId) return null;
  if (!dateRange?.start || !dateRange?.end) return null;
  return [
    tenantId,
    brandId,
    platform,
    accountId,
    dateRange.start,
    dateRange.end,
  ].join(':');
}

function shouldSkipSync(key) {
  if (!key) return false;
  const cached = syncCache.get(key);
  if (!cached) return false;
  if (cached.expiresAt <= Date.now()) {
    syncCache.delete(key);
    return false;
  }
  return true;
}

function markSynced(key) {
  if (!key) return;
  syncCache.set(key, { expiresAt: Date.now() + SYNC_TTL_MS });
}

async function withSyncInFlight(key, task) {
  if (!key || typeof task !== 'function') {
    return task();
  }

  const existing = syncInFlight.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(task)
    .finally(() => {
      if (syncInFlight.get(key) === promise) {
        syncInFlight.delete(key);
      }
    });

  syncInFlight.set(key, promise);
  return promise;
}

function rangeTouchesToday(dateRange) {
  const start = normalizeDateKey(dateRange?.start);
  const end = normalizeDateKey(dateRange?.end);
  if (!start || !end) return false;
  const today = new Date().toISOString().slice(0, 10);
  return start <= today && end >= today;
}

function resolveCurrency(connection, integration) {
  const fromMeta = connection?.meta?.currency;
  if (fromMeta) return String(fromMeta);
  const settings = integration?.settings || {};
  const config = integration?.config || {};
  return (
    settings.currency ||
    settings.currencyCode ||
    config.currency ||
    config.currencyCode ||
    DEFAULT_CURRENCY
  );
}

function applyAccountToIntegration(integration, platform, externalAccountId) {
  if (!integration || !externalAccountId) return integration;
  const settings = {
    ...(integration.settings && typeof integration.settings === 'object' ? integration.settings : {}),
  };

  switch (platform) {
    case 'META_ADS':
      settings.accountId = externalAccountId;
      settings.adAccountId = externalAccountId;
      break;
    case 'GOOGLE_ADS':
      settings.customerId = settings.customerId || externalAccountId;
      settings.customer_id = settings.customer_id || externalAccountId;
      break;
    case 'TIKTOK_ADS':
      settings.advertiserId = settings.advertiserId || externalAccountId;
      settings.advertiser_id = settings.advertiser_id || externalAccountId;
      break;
    case 'LINKEDIN_ADS':
      settings.accountId = settings.accountId || externalAccountId;
      settings.account_id = settings.account_id || externalAccountId;
      break;
    default:
      break;
  }

  return { ...integration, settings };
}

function filterMetricsForPlatform(metrics, platform) {
  const list = Array.isArray(metrics) ? metrics.filter(Boolean) : [];
  const allowed = PLATFORM_METRIC_LIMITS[platform];
  if (!allowed || !allowed.length) return list;
  const allowedSet = new Set(allowed);
  return list.filter((metric) => allowedSet.has(metric));
}

function buildFactRows({
  tenantId,
  brandId,
  platform,
  accountId,
  currency,
  metricsRows,
}) {
  const map = new Map();
  metricsRows.forEach((row) => {
    if (!row) return;
    const metric = row.name || row.metric || row.key;
    if (!metric || !SUPPORTED_METRICS.has(metric)) return;
    const dateKey = normalizeDateKey(row.collectedAt);
    if (!dateKey) return;
    const key = `${dateKey}`;
    const current =
      map.get(key) ||
      {
        tenantId,
        brandId,
        date: new Date(dateKey),
        platform,
        accountId,
        campaignId: null,
        adsetId: null,
        adId: null,
        currency: currency || DEFAULT_CURRENCY,
        impressions: BigInt(0),
        clicks: BigInt(0),
        spend: 0,
        conversions: 0,
        revenue: 0,
        sessions: BigInt(0),
        leads: BigInt(0),
      };

    const value = toNumber(row.value);
    if (metric === 'impressions') current.impressions += toBigInt(value);
    if (metric === 'clicks') current.clicks += toBigInt(value);
    if (metric === 'spend') current.spend += value;
    if (metric === 'conversions') current.conversions += value;
    if (metric === 'revenue') current.revenue += value;
    if (metric === 'sessions') current.sessions += toBigInt(value);
    if (metric === 'leads') current.leads += toBigInt(value);

    map.set(key, current);
  });

  return Array.from(map.values());
}

async function resolveBrandConnections(tenantId, brandId, platform, accountFilter) {
  const where = {
    tenantId,
    brandId,
    platform,
    status: 'ACTIVE',
  };
  const connections = await prisma.brandSourceConnection.findMany({ where });
  if (!accountFilter?.length) return connections;
  const allowed = new Set(accountFilter.map((value) => String(value)));
  return connections.filter((conn) => allowed.has(String(conn.externalAccountId)));
}

async function resolveDataConnection(tenantId, brandId, platform, externalAccountId) {
  const source = PLATFORM_SOURCE_MAP[platform] || null;
  if (!source) return null;
  return prisma.dataSourceConnection.findFirst({
    where: {
      tenantId,
      brandId,
      source,
      externalAccountId: String(externalAccountId),
      status: 'CONNECTED',
    },
    include: { integration: true },
  });
}

async function hasFactsForRange({ tenantId, brandId, platform, accountId, dateRange }) {
  if (!tenantId || !brandId || !platform || !accountId) return false;
  const start = new Date(dateRange.start);
  const end = new Date(dateRange.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const count = await prisma.factKondorMetricsDaily.count({
    where: {
      tenantId,
      brandId,
      platform,
      accountId,
      date: {
        gte: start,
        lte: end,
      },
    },
  });
  return count > 0;
}

async function syncConnectionFacts({
  tenantId,
  brandId,
  platform,
  externalAccountId,
  dateRange,
  metrics,
}) {
  const service = PLATFORM_SERVICE_MAP[platform];
  if (!service || typeof service.fetchAccountMetrics !== 'function') return;
  const filteredMetrics = filterMetricsForPlatform(metrics, platform);
  if (!filteredMetrics.length) return;

  const dataConnection = await resolveDataConnection(
    tenantId,
    brandId,
    platform,
    externalAccountId,
  );
  if (!dataConnection?.integration) return;

  const cacheKey = buildSyncKey(
    tenantId,
    brandId,
    platform,
    externalAccountId,
    dateRange,
  );
  if (shouldSkipSync(cacheKey)) return;

  return withSyncInFlight(cacheKey, async () => {
    if (shouldSkipSync(cacheKey)) return;

    const hasFacts = await hasFactsForRange({
      tenantId,
      brandId,
      platform,
      accountId: String(externalAccountId),
      dateRange,
    });

    const shouldRefreshOpenRange = rangeTouchesToday(dateRange);
    if (hasFacts && !shouldRefreshOpenRange) {
      markSynced(cacheKey);
      return;
    }

    const integration = applyAccountToIntegration(
      dataConnection.integration,
      platform,
      externalAccountId,
    );

    const metricsRows = await service.fetchAccountMetrics(integration, {
      range: { since: dateRange.start, until: dateRange.end },
      metricTypes: filteredMetrics,
      granularity: 'day',
    });

    if (!metricsRows || !metricsRows.length) {
      markSynced(cacheKey);
      return;
    }

    const currency = resolveCurrency(dataConnection, integration);
    const factRows = buildFactRows({
      tenantId,
      brandId,
      platform,
      accountId: String(externalAccountId),
      currency,
      metricsRows,
    });

    if (!factRows.length) {
      markSynced(cacheKey);
      return;
    }

    await prisma.factKondorMetricsDaily.deleteMany({
      where: {
        tenantId,
        brandId,
        platform,
        accountId: String(externalAccountId),
        date: {
          gte: new Date(dateRange.start),
          lte: new Date(dateRange.end),
        },
      },
    });

    const chunkSize = Math.max(100, Number(process.env.FACT_METRICS_INSERT_CHUNK || 500));
    for (let i = 0; i < factRows.length; i += chunkSize) {
      await prisma.factKondorMetricsDaily.createMany({
        data: factRows.slice(i, i + chunkSize),
      });
    }

    markSynced(cacheKey);
  });
}

async function ensureFactMetrics({
  tenantId,
  brandId,
  dateRange,
  metrics,
  filters,
  requiredPlatforms,
}) {
  if (!tenantId || !brandId || !dateRange?.start || !dateRange?.end) return;
  const metricList = Array.from(new Set((metrics || []).filter(Boolean)));
  if (!metricList.length) return;

  const platformFilters = extractFilterValues(filters, 'platform').map(normalizePlatform);
  const accountFilters = extractFilterValues(filters, 'account_id');

  let platforms = (requiredPlatforms || []).map(normalizePlatform).filter(Boolean);
  if (!platforms.length && platformFilters.length) {
    platforms = platformFilters;
  }

  if (!platforms.length) {
    const connections = await prisma.brandSourceConnection.findMany({
      where: { tenantId, brandId, status: 'ACTIVE' },
      select: { platform: true },
    });
    platforms = connections.map((item) => normalizePlatform(item.platform)).filter(Boolean);
  }

  const uniquePlatforms = Array.from(new Set(platforms)).filter(
    (platform) => platform && platform !== 'GA4',
  );

  for (const platform of uniquePlatforms) {
    const connections = await resolveBrandConnections(
      tenantId,
      brandId,
      platform,
      accountFilters,
    );
    if (!connections.length) continue;

    for (const connection of connections) {
      await syncConnectionFacts({
        tenantId,
        brandId,
        platform,
        externalAccountId: connection.externalAccountId,
        dateRange,
        metrics: metricList,
      });
    }
  }
}

async function syncAfterConnection({
  tenantId,
  brandId,
  platform,
  externalAccountId,
}) {
  if (!tenantId || !brandId || !platform || !externalAccountId) return;
  const days = Math.max(7, Number(process.env.REPORTING_DEFAULT_RANGE_DAYS || 30));
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const dateRange = {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };

  const baseMetrics = filterMetricsForPlatform(Array.from(SUPPORTED_METRICS), platform);
  try {
    await ensureFactMetrics({
      tenantId,
      brandId,
      dateRange,
      metrics: baseMetrics,
      filters: [
        { field: 'platform', op: 'eq', value: String(platform) },
        { field: 'account_id', op: 'eq', value: String(externalAccountId) },
      ],
      requiredPlatforms: [platform],
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[factMetricsSyncService] syncAfterConnection error', err?.message || err);
    }
  }
}

module.exports = {
  ensureFactMetrics,
  syncAfterConnection,
};
