const { prisma } = require('../prisma');
const ga4DataService = require('./ga4DataService');
const { resolveGa4IntegrationContext } = require('./ga4IntegrationResolver');

const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'BRL';
const LEAD_EVENT_NAME = process.env.GA4_LEAD_EVENT_NAME || null;
const FACT_CACHE_TTL_MS = Number(process.env.GA4_FACT_CACHE_TTL_MS || 30000);

const GA4_METRIC_MAP = {
  sessions: 'sessions',
  conversions: 'conversions',
  revenue: 'totalRevenue',
};

const GA4_METRIC_KEYS = new Set([...Object.keys(GA4_METRIC_MAP), 'leads']);
const factCache = new Map();

function normalizePlatform(value) {
  return String(value || '').trim().toUpperCase();
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBigInt(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return BigInt(0);
  return BigInt(Math.round(num));
}

function normalizeGa4Date(value) {
  const raw = String(value || '');
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return raw || null;
}

function buildFactCacheKey({ tenantId, brandId, propertyId, dateRange }) {
  if (!tenantId || !brandId || !propertyId || !dateRange?.start || !dateRange?.end) {
    return null;
  }
  return [
    'ga4fact',
    tenantId,
    brandId,
    propertyId,
    dateRange.start,
    dateRange.end,
  ].join(':');
}

function withFactCache(key, executor) {
  if (!key || typeof executor !== 'function' || FACT_CACHE_TTL_MS <= 0) {
    return executor();
  }

  const now = Date.now();
  const existing = factCache.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.promise;
  }

  const promise = (async () => executor())();
  factCache.set(key, { promise, expiresAt: now + FACT_CACHE_TTL_MS });
  promise.finally(() => {
    const current = factCache.get(key);
    if (current && current.promise === promise && current.expiresAt <= Date.now()) {
      factCache.delete(key);
    }
  });
  return promise;
}

function extractFilterValues(filters = [], field) {
  const values = new Set();
  (filters || []).forEach((filter) => {
    if (!filter || filter.field !== field) return;
    if (filter.op === 'eq') {
      const value = String(filter.value || '').trim();
      if (value) values.add(value);
      return;
    }
    if (filter.op === 'in' && Array.isArray(filter.value)) {
      filter.value.forEach((entry) => {
        const value = String(entry || '').trim();
        if (value) values.add(value);
      });
    }
  });
  return Array.from(values);
}

function buildGa4MetricPlan(requestedMetrics = []) {
  const requested = new Set((requestedMetrics || []).map((m) => String(m || '').trim()));
  const shouldFetch = Array.from(requested).some((metric) => GA4_METRIC_KEYS.has(metric));
  if (!shouldFetch) {
    return {
      metrics: [],
      wantsLeads: false,
      needsLeadsFromEvent: false,
      fallbackLeadsToConversions: false,
    };
  }

  const metricsSet = new Set(Object.values(GA4_METRIC_MAP));
  const wantsLeads = requested.has('leads');
  const needsLeadsFromEvent = Boolean(wantsLeads && LEAD_EVENT_NAME);
  const fallbackLeadsToConversions = Boolean(wantsLeads && !LEAD_EVENT_NAME);

  return {
    metrics: Array.from(metricsSet),
    wantsLeads,
    needsLeadsFromEvent,
    fallbackLeadsToConversions,
  };
}

function buildDimensionFilterForLeadEvent() {
  if (!LEAD_EVENT_NAME) return null;
  return {
    filter: {
      fieldName: 'eventName',
      stringFilter: {
        matchType: 'EXACT',
        value: String(LEAD_EVENT_NAME),
        caseSensitive: false,
      },
    },
  };
}

function applyGa4Response(rowsMap, response, metricMap, options = {}) {
  const campaignDimension = options.campaignDimension || null;
  const dimensionHeaders = Array.isArray(response?.dimensionHeaders)
    ? response.dimensionHeaders
    : [];
  const metricHeaders = Array.isArray(response?.metricHeaders)
    ? response.metricHeaders
    : [];
  const rows = Array.isArray(response?.rows) ? response.rows : [];

  rows.forEach((row) => {
    const dimensions = Array.isArray(row.dimensions) ? row.dimensions : [];
    const metrics = Array.isArray(row.metrics) ? row.metrics : [];
    const dimValues = {};
    dimensionHeaders.forEach((key, idx) => {
      dimValues[key] = dimensions[idx] ?? null;
    });
    const metricValues = {};
    metricHeaders.forEach((key, idx) => {
      metricValues[key] = metrics[idx] ?? null;
    });

    const dateValue = normalizeGa4Date(dimValues.date);
    if (!dateValue) return;
    const campaignRaw = campaignDimension ? dimValues[campaignDimension] : null;
    const campaignId = campaignRaw ? String(campaignRaw) : null;
    const key = `${dateValue}|${campaignId || ''}`;
    const existing = rowsMap.get(key) || {
      date: dateValue,
      campaignId,
      metrics: {},
    };

    Object.entries(metricMap).forEach(([targetKey, gaKey]) => {
      const value = toNumber(metricValues[gaKey]);
      existing.metrics[targetKey] = (existing.metrics[targetKey] || 0) + value;
    });

    rowsMap.set(key, existing);
  });
}

function buildFactRows({
  tenantId,
  brandId,
  propertyId,
  rowsMap,
  fallbackLeadsToConversions,
}) {
  const rows = [];
  rowsMap.forEach((entry) => {
    const conversions = toNumber(entry.metrics.conversions);
    const revenue = toNumber(entry.metrics.revenue);
    const sessions = toBigInt(entry.metrics.sessions);
    const leadsValue = entry.metrics.leads !== undefined
      ? toBigInt(entry.metrics.leads)
      : fallbackLeadsToConversions
        ? toBigInt(conversions)
        : BigInt(0);

    rows.push({
      tenantId,
      brandId,
      date: new Date(entry.date),
      platform: 'GA4',
      accountId: String(propertyId),
      campaignId: entry.campaignId || null,
      adsetId: null,
      adId: null,
      currency: DEFAULT_CURRENCY,
      impressions: BigInt(0),
      clicks: BigInt(0),
      spend: 0,
      conversions,
      revenue,
      sessions,
      leads: leadsValue,
    });
  });
  return rows;
}

async function fetchGa4Report({
  tenantId,
  userId,
  propertyId,
  metrics,
  dimensions,
  dateRange,
  dimensionFilter,
}) {
  return ga4DataService.runReport({
    tenantId,
    userId,
    propertyId,
    skipSelectionCheck: true,
    payload: {
      metrics,
      dimensions,
      dateRanges: [
        {
          startDate: dateRange.start,
          endDate: dateRange.end,
        },
      ],
      ...(dimensionFilter ? { dimensionFilter } : {}),
    },
    rateKey: [tenantId, userId, propertyId].join(':'),
  });
}

async function ensureGa4FactMetrics({
  tenantId,
  brandId,
  dateRange,
  metrics,
  dimensions,
  filters,
  requiredPlatforms,
}) {
  if (!tenantId || !brandId || !dateRange?.start || !dateRange?.end) {
    return { skipped: true, reason: 'missing_params' };
  }

  const accountFilter = extractFilterValues(filters, 'account_id');
  const platformFilters = extractFilterValues(filters, 'platform').map(normalizePlatform);
  const hasPlatformFilter = platformFilters.length > 0;
  const platformAllowsGa4 = !hasPlatformFilter || platformFilters.includes('GA4');

  let connections = await prisma.brandSourceConnection.findMany({
    where: {
      tenantId,
      brandId,
      platform: 'GA4',
      status: 'ACTIVE',
    },
  });

  if (accountFilter.length) {
    connections = connections.filter((conn) =>
      accountFilter.includes(String(conn.externalAccountId))
    );
  }

  if (!connections.length) {
    return { skipped: true, reason: 'no_connections' };
  }

  const metricPlan = buildGa4MetricPlan(metrics);
  if (!metricPlan.metrics.length && !metricPlan.needsLeadsFromEvent) {
    return { skipped: true, reason: 'no_ga4_metrics' };
  }

  if (!platformAllowsGa4) {
    return { skipped: true, reason: 'platform_excludes_ga4' };
  }

  const requestedDimensions = Array.isArray(dimensions) ? dimensions : [];
  const wantsCampaign =
    requestedDimensions.includes('campaign_id') ||
    extractFilterValues(filters, 'campaign_id').length > 0;

  for (const connection of connections) {
    const propertyId = String(connection.externalAccountId || '').trim();
    if (!propertyId) continue;

    const cacheKey = buildFactCacheKey({ tenantId, brandId, propertyId, dateRange });

    await withFactCache(cacheKey, async () => {
      const resolved = await resolveGa4IntegrationContext({
        tenantId,
        propertyId,
        integrationId: null,
        userId: null,
      });

      let campaignDimension = null;
      if (wantsCampaign) {
        campaignDimension = 'campaignId';
      }

      let response;
      try {
        response = await fetchGa4Report({
          tenantId,
          userId: resolved.userId,
          propertyId,
          metrics: metricPlan.metrics,
          dimensions: wantsCampaign ? ['date', 'campaignId'] : ['date'],
          dateRange,
        });
      } catch (err) {
        const invalidDimensions = err?.details?.invalidDimensions || [];
        if (wantsCampaign && invalidDimensions.includes('campaignId')) {
          try {
            response = await fetchGa4Report({
              tenantId,
              userId: resolved.userId,
              propertyId,
              metrics: metricPlan.metrics,
              dimensions: ['date', 'campaignName'],
              dateRange,
            });
            campaignDimension = 'campaignName';
          } catch (_) {
            response = await fetchGa4Report({
              tenantId,
              userId: resolved.userId,
              propertyId,
              metrics: metricPlan.metrics,
              dimensions: ['date'],
              dateRange,
            });
            campaignDimension = null;
          }
        } else {
          err.details = {
            ...(err.details || {}),
            propertyId,
          };
          throw err;
        }
      }

      const rowsMap = new Map();
      const metricMap = {};
      Object.entries(GA4_METRIC_MAP).forEach(([target, gaName]) => {
        if (metricPlan.metrics.includes(gaName)) {
          metricMap[target] = gaName;
        }
      });
      applyGa4Response(rowsMap, response, metricMap, { campaignDimension });

      if (metricPlan.needsLeadsFromEvent) {
        const leadResponse = await fetchGa4Report({
          tenantId,
          userId: resolved.userId,
          propertyId,
          metrics: ['eventCount'],
          dimensions: campaignDimension ? ['date', campaignDimension] : ['date'],
          dateRange,
          dimensionFilter: buildDimensionFilterForLeadEvent(),
        });
        applyGa4Response(rowsMap, leadResponse, { leads: 'eventCount' }, { campaignDimension });
      }

      const factRows = buildFactRows({
        tenantId,
        brandId,
        propertyId,
        rowsMap,
        fallbackLeadsToConversions: metricPlan.fallbackLeadsToConversions,
      });

      if (!factRows.length) {
        return;
      }

      await prisma.factKondorMetricsDaily.deleteMany({
        where: {
          tenantId,
          brandId,
          platform: 'GA4',
          accountId: propertyId,
          date: {
            gte: new Date(dateRange.start),
            lte: new Date(dateRange.end),
          },
        },
      });

      const chunkSize = Math.max(100, Number(process.env.GA4_FACT_INSERT_CHUNK || 500));
      for (let i = 0; i < factRows.length; i += chunkSize) {
        await prisma.factKondorMetricsDaily.createMany({
          data: factRows.slice(i, i + chunkSize),
        });
      }
    });
  }

  return { ok: true };
}

module.exports = {
  ensureGa4FactMetrics,
};
