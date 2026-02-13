const { prisma } = require('../prisma');
const ga4DataService = require('./ga4DataService');
const { resolveGa4IntegrationContext } = require('./ga4IntegrationResolver');

const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'BRL';
function parseEnvList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,\n;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// GA4 standard event name for lead generation.
// You can override it per environment using:
// - GA4_LEAD_EVENT_NAME="generate_lead" (single)
// - GA4_LEAD_EVENT_NAMES="generate_lead,lead" (multiple)
const LEAD_EVENT_NAMES = (() => {
  const list = parseEnvList(process.env.GA4_LEAD_EVENT_NAMES);
  if (list.length) return list;
  const single = String(process.env.GA4_LEAD_EVENT_NAME || '').trim();
  if (single) return [single];
  return ['generate_lead'];
})();
const CONVERSION_EVENT_NAME = process.env.GA4_CONVERSION_EVENT_NAME || null;
const FACT_CACHE_TTL_MS = Number(process.env.GA4_FACT_CACHE_TTL_MS || 30000);

const GA4_METRIC_MAP = {
  sessions: 'sessions',
  conversions: 'conversions',
  revenue: 'totalRevenue',
};

const GA4_METRIC_KEYS = new Set([
  ...Object.keys(GA4_METRIC_MAP),
  'leads',
  'conversions',
]);

// We materialize a consistent daily fact row shape for GA4 so that multiple widgets
// (sessions/leads/conversions/revenue) don't race and overwrite each other with partial data.
const FULL_FACT_METRICS = ['sessions', 'leads', 'conversions', 'revenue'];
const factCache = new Map();

function normalizePlatform(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeGa4PropertyId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('properties/')) {
    return raw.replace(/^properties\//, '');
  }
  return raw;
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

function normalizeDateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function rangeTouchesToday(dateRange) {
  const start = normalizeDateKey(dateRange?.start);
  const end = normalizeDateKey(dateRange?.end);
  if (!start || !end) return false;
  const today = new Date().toISOString().slice(0, 10);
  return start <= today && end >= today;
}

function dateOnlyUtc(value) {
  const key = normalizeDateKey(value);
  if (!key) return null;
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isFullFactSync(metrics = []) {
  const set = new Set((metrics || []).map((m) => String(m || '').trim().toLowerCase()));
  return set.has('sessions') && set.has('leads') && set.has('conversions') && set.has('revenue');
}

function buildFactCacheKey({ tenantId, brandId, propertyId, dateRange, scope }) {
  if (!tenantId || !brandId || !propertyId || !dateRange?.start || !dateRange?.end) {
    return null;
  }
  return [
    'ga4fact',
    tenantId,
    brandId,
    propertyId,
    scope || 'agg',
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
      wantsConversions: false,
      needsLeadsFromEvent: false,
    };
  }

  const metricsSet = new Set();
  requested.forEach((metric) => {
    const mapped = GA4_METRIC_MAP[metric];
    if (mapped) metricsSet.add(mapped);
  });

  const wantsLeads = requested.has('leads');
  const wantsConversions = requested.has('conversions');
  const needsLeadsFromEvent = Boolean(wantsLeads && LEAD_EVENT_NAMES.length);

  return {
    metrics: Array.from(metricsSet),
    wantsLeads,
    wantsConversions,
    needsLeadsFromEvent,
  };
}

function buildDimensionFilterForLeadEvent() {
  if (!LEAD_EVENT_NAMES.length) return null;
  if (LEAD_EVENT_NAMES.length === 1) {
    return {
      filter: {
        fieldName: 'eventName',
        stringFilter: {
          matchType: 'EXACT',
          value: String(LEAD_EVENT_NAMES[0]),
          caseSensitive: false,
        },
      },
    };
  }
  return {
    filter: {
      fieldName: 'eventName',
      inListFilter: {
        values: LEAD_EVENT_NAMES.map((name) => String(name)),
        caseSensitive: false,
      },
    },
  };
}

function buildDimensionFilterForConversionEvent() {
  if (!CONVERSION_EVENT_NAME) return null;
  return {
    filter: {
      fieldName: 'eventName',
      stringFilter: {
        matchType: 'EXACT',
        value: String(CONVERSION_EVENT_NAME),
        caseSensitive: false,
      },
    },
  };
}

async function tryFetchReport({
  tenantId,
  userId,
  propertyId,
  metrics,
  campaignDimension,
  dateRange,
}) {
  try {
    const response = await fetchGa4Report({
      tenantId,
      userId,
      propertyId,
      metrics,
      dimensions: campaignDimension ? ['date', campaignDimension] : ['date'],
      dateRange,
    });
    return {
      response,
      invalidMetrics: [],
      invalidDimensions: [],
      error: null,
    };
  } catch (err) {
    const invalidMetrics = err?.details?.invalidMetrics || [];
    const invalidDimensions = err?.details?.invalidDimensions || [];
    return {
      response: null,
      invalidMetrics,
      invalidDimensions,
      error: err,
    };
  }
}

function applyGa4Response(rowsMap, response, metricMap, options = {}) {
  if (!response) return;
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
}) {
  const rows = [];
  rowsMap.forEach((entry) => {
    const conversions = toNumber(entry.metrics.conversions);
    const revenue = toNumber(entry.metrics.revenue);
    const sessions = toBigInt(entry.metrics.sessions);
    const leadsValue =
      entry.metrics.leads !== undefined ? toBigInt(entry.metrics.leads) : BigInt(0);

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

async function hasGa4AggregatedFactsForRange({ tenantId, brandId, propertyId, dateRange }) {
  if (!tenantId || !brandId || !propertyId || !dateRange?.start || !dateRange?.end) return false;
  const count = await prisma.factKondorMetricsDaily.count({
    where: {
      tenantId: String(tenantId),
      brandId: String(brandId),
      platform: 'GA4',
      accountId: String(propertyId),
      campaignId: null,
      date: {
        gte: new Date(dateRange.start),
        lte: new Date(dateRange.end),
      },
    },
  });
  return count > 0;
}

async function hasGa4CampaignFactsForRange({ tenantId, brandId, propertyId, dateRange }) {
  if (!tenantId || !brandId || !propertyId || !dateRange?.start || !dateRange?.end) return false;
  const count = await prisma.factKondorMetricsDaily.count({
    where: {
      tenantId: String(tenantId),
      brandId: String(brandId),
      platform: 'GA4',
      accountId: String(propertyId),
      campaignId: { not: null },
      date: {
        gte: new Date(dateRange.start),
        lte: new Date(dateRange.end),
      },
    },
  });
  return count > 0;
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
  const factMaxRows = Math.max(0, Number(process.env.GA4_FACT_MAX_ROWS || 50_000));
  return ga4DataService.runReport({
    tenantId,
    userId,
    propertyId,
    skipSelectionCheck: true,
    autoPaginate: true,
    maxRows: factMaxRows,
    cacheTtlMs: 0, // avoid caching large fact sync responses in memory/redis/db
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

  const accountFilter = extractFilterValues(filters, 'account_id')
    .map(normalizeGa4PropertyId)
    .filter(Boolean);
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
      accountFilter.includes(normalizeGa4PropertyId(conn.externalAccountId))
    );
  }

  if (!connections.length) {
    return { skipped: true, reason: 'no_connections' };
  }

  const requestedMetricPlan = buildGa4MetricPlan(metrics);
  if (!requestedMetricPlan.metrics.length && !requestedMetricPlan.needsLeadsFromEvent) {
    return { skipped: true, reason: 'no_ga4_metrics' };
  }

  const metricPlan = buildGa4MetricPlan(FULL_FACT_METRICS);

  if (!platformAllowsGa4) {
    return { skipped: true, reason: 'platform_excludes_ga4' };
  }

  const requestedDimensions = Array.isArray(dimensions) ? dimensions : [];
  const wantsCampaign =
    requestedDimensions.includes('campaign_id') ||
    extractFilterValues(filters, 'campaign_id').length > 0;
  const cacheScope = wantsCampaign ? 'campaign' : 'agg';
  const fullFactSync = isFullFactSync(FULL_FACT_METRICS);
  const shouldRefreshOpenRange = rangeTouchesToday(dateRange);

  for (const connection of connections) {
    const propertyId = normalizeGa4PropertyId(connection.externalAccountId);
    if (!propertyId) continue;

    const cacheKey = buildFactCacheKey({
      tenantId,
      brandId,
      propertyId,
      dateRange,
      scope: cacheScope,
    });

    await withFactCache(cacheKey, async () => {
      let resolved = null;
      try {
        resolved = await resolveGa4IntegrationContext({
          tenantId,
          propertyId,
          integrationId: null,
          userId: null,
        });
      } catch (err) {
        if (
          err?.code === 'GA4_INTEGRATION_NOT_CONNECTED' ||
          err?.code === 'GA4_PROPERTY_NOT_SELECTED'
        ) {
          return;
        }
        throw err;
      }

      const [hasAggregatedFacts, hasCampaignFacts] = await Promise.all([
        hasGa4AggregatedFactsForRange({ tenantId, brandId, propertyId, dateRange }),
        hasGa4CampaignFactsForRange({ tenantId, brandId, propertyId, dateRange }),
      ]);

      // Skip closed ranges once we have full facts materialized to avoid re-fetching and rewrites.
      if (!shouldRefreshOpenRange && fullFactSync) {
        if (!wantsCampaign && hasAggregatedFacts) {
          return;
        }
        if (wantsCampaign && hasCampaignFacts) {
          return;
        }
      }

      let campaignDimension = wantsCampaign ? 'campaignId' : null;
      let metricsForRequest = Array.isArray(metricPlan.metrics) ? [...metricPlan.metrics] : [];
      let conversionsMetricName = metricsForRequest.includes('conversions') ? 'conversions' : null;
      let conversionsInvalid = false;

      const fetchWithDimensionFallback = async (metricsList, initialCampaignDimension) => {
        let dim = initialCampaignDimension || null;
        let result = metricsList.length
          ? await tryFetchReport({
              tenantId,
              userId: resolved.userId,
              propertyId,
              metrics: metricsList,
              campaignDimension: dim,
              dateRange,
            })
          : {
              response: null,
              invalidMetrics: [],
              invalidDimensions: [],
              error: null,
            };

        if (
          metricsList.length &&
          dim === 'campaignId' &&
          wantsCampaign &&
          result.invalidDimensions.includes('campaignId')
        ) {
          dim = 'campaignName';
          result = await tryFetchReport({
            tenantId,
            userId: resolved.userId,
            propertyId,
            metrics: metricsList,
            campaignDimension: dim,
            dateRange,
          });
        }

        if (metricsList.length && result.invalidDimensions.length) {
          dim = null;
          result = await tryFetchReport({
            tenantId,
            userId: resolved.userId,
            propertyId,
            metrics: metricsList,
            campaignDimension: dim,
            dateRange,
          });
        }

        return { attempt: result, campaignDimension: dim };
      };

      let fetched = await fetchWithDimensionFallback(metricsForRequest, campaignDimension);
      let attempt = fetched.attempt;
      campaignDimension = fetched.campaignDimension;

      // If the widget requires campaign breakdown but the property doesn't support campaign dimensions,
      // skip mutating facts to avoid mixing scopes (campaign vs aggregated).
      if (wantsCampaign && !campaignDimension) {
        return;
      }

      if (metricsForRequest.length && attempt.invalidMetrics.length) {
        if (conversionsMetricName && attempt.invalidMetrics.includes(conversionsMetricName)) {
          // GA4 renamed "conversions" to "keyEvents" in some properties. Try the new metric.
          if (conversionsMetricName === 'conversions') {
            const swapped = metricsForRequest.map((metric) =>
              metric === 'conversions' ? 'keyEvents' : metric,
            );
            const swappedFetched = await fetchWithDimensionFallback(swapped, campaignDimension);
            const swappedAttempt = swappedFetched.attempt;
            if (!swappedAttempt.invalidMetrics.includes('keyEvents')) {
              metricsForRequest = swapped;
              attempt = swappedAttempt;
              campaignDimension = swappedFetched.campaignDimension;
              conversionsMetricName = 'keyEvents';
            } else {
              conversionsInvalid = true;
            }
          } else {
            conversionsInvalid = true;
          }
        }

        if (conversionsMetricName && attempt.invalidMetrics.includes(conversionsMetricName)) {
          conversionsInvalid = true;
          conversionsMetricName = null;
        }

        metricsForRequest = metricsForRequest.filter(
          (metric) => !attempt.invalidMetrics.includes(metric),
        );

        if (metricsForRequest.length) {
          fetched = await fetchWithDimensionFallback(metricsForRequest, campaignDimension);
          attempt = fetched.attempt;
          campaignDimension = fetched.campaignDimension;
        }
      }

      if (wantsCampaign && !campaignDimension) {
        return;
      }

      if (attempt.error && !attempt.response) {
        const hasInvalids =
          (attempt.invalidMetrics && attempt.invalidMetrics.length) ||
          (attempt.invalidDimensions && attempt.invalidDimensions.length);
        if (!hasInvalids) {
          attempt.error.details = {
            ...(attempt.error.details || {}),
            propertyId,
          };
          if (attempt.error.code === 'GA4_DATA_ERROR') {
            return;
          }
          throw attempt.error;
        }
      }

      const response = attempt.response;

      const rowsMap = new Map();
      const metricMap = {};
      if (metricsForRequest.includes(GA4_METRIC_MAP.sessions)) {
        metricMap.sessions = GA4_METRIC_MAP.sessions;
      }
      if (conversionsMetricName && metricsForRequest.includes(conversionsMetricName)) {
        metricMap.conversions = conversionsMetricName;
      }
      if (metricsForRequest.includes(GA4_METRIC_MAP.revenue)) {
        metricMap.revenue = GA4_METRIC_MAP.revenue;
      }
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

      if (
        metricPlan.wantsConversions &&
        (conversionsInvalid || !conversionsMetricName) &&
        CONVERSION_EVENT_NAME
      ) {
        const conversionResponse = await fetchGa4Report({
          tenantId,
          userId: resolved.userId,
          propertyId,
          metrics: ['eventCount'],
          dimensions: campaignDimension ? ['date', campaignDimension] : ['date'],
          dateRange,
          dimensionFilter: buildDimensionFilterForConversionEvent(),
        });
        applyGa4Response(
          rowsMap,
          conversionResponse,
          { conversions: 'eventCount' },
          { campaignDimension },
        );
      }

      const factRows = buildFactRows({
        tenantId,
        brandId,
        propertyId,
        rowsMap,
      });

      const writingCampaignFacts = Boolean(campaignDimension);
      const scopedFactRows = writingCampaignFacts
        ? factRows.filter((row) => row.campaignId !== null)
        : factRows.filter((row) => row.campaignId === null);

      if (!scopedFactRows.length) {
        return;
      }

      await prisma.factKondorMetricsDaily.deleteMany({
        where: {
          tenantId,
          brandId,
          platform: 'GA4',
          accountId: propertyId,
          campaignId: writingCampaignFacts ? { not: null } : null,
          date: {
            gte: new Date(dateRange.start),
            lte: new Date(dateRange.end),
          },
        },
      });

      const chunkSize = Math.max(100, Number(process.env.GA4_FACT_INSERT_CHUNK || 500));
      for (let i = 0; i < scopedFactRows.length; i += chunkSize) {
        await prisma.factKondorMetricsDaily.createMany({
          data: scopedFactRows.slice(i, i + chunkSize),
        });
      }
    });
  }

  return { ok: true };
}

module.exports = {
  ensureGa4FactMetrics,
};
