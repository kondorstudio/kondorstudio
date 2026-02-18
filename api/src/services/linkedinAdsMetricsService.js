// Provider de métricas para LinkedIn Ads (adAnalytics)
// - Não salva nada no banco (isso é responsabilidade do job ou reporting adapter).
// - Retorna [] se credenciais estiverem incompletas.

const {
  resolveAccessToken,
  getIntegrationSettings,
  getIntegrationConfig,
} = require('../modules/reporting/providers/providerUtils');
const httpClient = require('../lib/httpClient');
const rawStoreService = require('./rawStoreService');

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[linkedinAdsMetricsService]', ...args);
}

function getBaseUrl() {
  const base = process.env.LINKEDIN_ADS_API_BASE_URL || 'https://api.linkedin.com/rest';
  return String(base).replace(/\/$/, '');
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function normalizeDimensionFilters(filters) {
  if (!Array.isArray(filters)) return [];
  return filters
    .map((filter) => {
      if (!filter || typeof filter !== 'object') return null;
      const key = String(filter.key || filter.dimension || filter.field || '').trim();
      if (!key) return null;
      const rawValues = Array.isArray(filter.values)
        ? filter.values
        : filter.value
          ? [filter.value]
          : [];
      const values = rawValues.map((value) => String(value).trim()).filter(Boolean);
      if (!values.length) return null;
      const operator = String(filter.operator || 'IN').toUpperCase();
      return { key, operator, values };
    })
    .filter(Boolean);
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildDateRangeParam(dateFrom, dateTo) {
  const start = parseDate(dateFrom);
  const end = parseDate(dateTo || dateFrom);
  if (!start && !end) return null;
  const startDate = start || end;
  const endDate = end || start;
  if (!startDate || !endDate) return null;

  return `dateRange=(start:(year:${startDate.getUTCFullYear()},month:${startDate.getUTCMonth() + 1},day:${startDate.getUTCDate()}),end:(year:${endDate.getUTCFullYear()},month:${endDate.getUTCMonth() + 1},day:${endDate.getUTCDate()}))`;
}

function resolveTimeGranularity(widgetType) {
  if (widgetType === 'LINE') return 'DAILY';
  return 'ALL';
}

function resolvePivot(level, breakdown) {
  if (breakdown) return String(breakdown).toUpperCase();
  const raw = String(level || '').toUpperCase();
  if (raw.includes('CAMPAIGN_GROUP')) return 'CAMPAIGN_GROUP';
  if (raw.includes('CAMPAIGN')) return 'CAMPAIGN';
  if (raw.includes('CREATIVE') || raw.includes('AD')) return 'CREATIVE';
  return 'ACCOUNT';
}

const LINKEDIN_CONVERSIONS_FIELD =
  process.env.LINKEDIN_CONVERSIONS_METRIC || 'conversions';
const LINKEDIN_REVENUE_FIELD =
  process.env.LINKEDIN_REVENUE_METRIC || 'conversionValueInLocalCurrency';

const METRIC_ALIAS = {
  costInLocalCurrency: 'spend',
  costInUsd: 'spend_usd',
  totalEngagements: 'engagements',
  [LINKEDIN_CONVERSIONS_FIELD]: 'conversions',
  [LINKEDIN_REVENUE_FIELD]: 'revenue',
};

function mapMetricName(field) {
  return METRIC_ALIAS[field] || field;
}

const METRIC_FIELD_MAP = {
  spend: 'costInLocalCurrency',
  spend_usd: 'costInUsd',
  engagements: 'totalEngagements',
  conversions: LINKEDIN_CONVERSIONS_FIELD,
  revenue: LINKEDIN_REVENUE_FIELD,
};

function mapMetricField(metric) {
  return METRIC_FIELD_MAP[metric] || metric;
}

function buildFacetUrn(type, value) {
  if (!value) return null;
  if (String(value).startsWith('urn:li:')) return String(value);
  return `urn:li:${type}:${value}`;
}

function normalizeFacetKey(key) {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveFacetFromFilter(filter) {
  const key = normalizeFacetKey(filter.key);
  if (['account', 'account_id', 'accountid', 'accounts'].includes(key)) {
    return { facet: 'accounts', urnType: 'sponsoredAccount' };
  }
  if (['campaign', 'campaign_id', 'campaignid', 'campaigns'].includes(key)) {
    return { facet: 'campaigns', urnType: 'sponsoredCampaign' };
  }
  if (['campaign_group', 'campaign_group_id', 'campaigngroup', 'campaigngroups'].includes(key)) {
    return { facet: 'campaignGroups', urnType: 'sponsoredCampaignGroup' };
  }
  if (['creative', 'creative_id', 'ad_id', 'adid', 'creatives'].includes(key)) {
    return { facet: 'creatives', urnType: 'sponsoredCreative' };
  }
  return null;
}

function buildFacetParams(accountId, filters) {
  const facetMap = new Map();
  const excluded = new Map();

  if (accountId) {
    const accountUrn = buildFacetUrn('sponsoredAccount', accountId);
    facetMap.set('accounts', [accountUrn]);
  }

  filters.forEach((filter) => {
    const facetInfo = resolveFacetFromFilter(filter);
    if (!facetInfo) return;
    const urns = filter.values
      .map((value) => buildFacetUrn(facetInfo.urnType, value))
      .filter(Boolean);
    if (!urns.length) return;
    const targetMap = filter.operator === 'NOT_IN' ? excluded : facetMap;
    const existing = targetMap.get(facetInfo.facet) || [];
    targetMap.set(facetInfo.facet, [...existing, ...urns]);
  });

  return { facetMap, excluded };
}

function buildFacetQuery(facetMap) {
  const entries = [];
  facetMap.forEach((values, key) => {
    const unique = Array.from(new Set(values));
    if (!unique.length) return;
    entries.push(`${key}=List(${unique.join(',')})`);
  });
  return entries;
}

function filterExcludedRows(elements, excluded) {
  if (!excluded || excluded.size === 0) return elements;
  return elements.filter((row) => {
    const pivots = Array.isArray(row?.pivotValues) ? row.pivotValues : [];
    for (const [facet, urns] of excluded.entries()) {
      const excludeSet = new Set(urns);
      if (pivots.some((pivot) => excludeSet.has(pivot))) return false;
    }
    return true;
  });
}

async function fetchAccountMetrics(integration, options = {}) {
  if (!integration) {
    safeLog('fetchAccountMetrics chamado sem integration');
    return [];
  }

  const settings = getIntegrationSettings(integration);
  const config = getIntegrationConfig(integration);
  const accessToken = resolveAccessToken(integration) || settings.accessToken || config.accessToken;
  const accountId =
    settings.accountId ||
    settings.account_id ||
    config.accountId ||
    config.account_id ||
    options.accountId ||
    null;

  if (!accessToken || !accountId) {
    safeLog('Credenciais incompletas para LinkedIn Ads (accessToken/accountId ausentes)');
    return [];
  }

  const metrics = normalizeList(options.metricTypes || options.metrics);
  const fields = metrics.length
    ? Array.from(new Set(metrics.map(mapMetricField)))
    : ['impressions', 'clicks', 'costInLocalCurrency'];
  const pivot = resolvePivot(options.level, options.breakdown);
  const timeGranularity = resolveTimeGranularity(options.widgetType);
  const filters = normalizeDimensionFilters(
    options?.filters && typeof options.filters === 'object'
      ? options.filters.dimensionFilters
      : [],
  );
  const { facetMap, excluded } = buildFacetParams(accountId, filters);

  const baseUrl = getBaseUrl();
  const url = new URL(`${baseUrl}/adAnalytics`);
  url.searchParams.set('q', 'analytics');
  url.searchParams.set('pivot', pivot);
  url.searchParams.set('timeGranularity', timeGranularity);
  url.searchParams.set('fields', fields.join(','));

  const dateRange = buildDateRangeParam(options.dateFrom, options.dateTo);
  if (dateRange) {
    const [key, value] = dateRange.split('=');
    url.searchParams.set(key, value);
  }

  const facetQueries = buildFacetQuery(facetMap);
  facetQueries.forEach((entry) => {
    const [key, value] = entry.split('=');
    url.searchParams.append(key, value);
  });
  const rawParams = {
    accountId: String(accountId),
    fields,
    pivot,
    timeGranularity,
    dateFrom: options.dateFrom || null,
    dateTo: options.dateTo || null,
    facetQueries,
  };

  try {
    const response = await httpClient.requestJson(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': process.env.LINKEDIN_API_VERSION || '202401',
        },
      },
      {
        provider: 'LINKEDIN_ADS',
        endpoint: '/adAnalytics',
        connectionKey: integration?.id || accountId,
        runId: options?.runId || null,
      },
    );
    const json = response.data || {};
    await rawStoreService.appendRawApiResponse({
      tenantId: integration?.tenantId || null,
      brandId: integration?.clientId || null,
      provider: 'LINKEDIN_ADS',
      connectionId: integration?.id || null,
      endpoint: '/adAnalytics',
      params: rawParams,
      payload: json,
      httpStatus: response.status || null,
    });
    const elements = Array.isArray(json.elements) ? json.elements : [];
    const filteredElements = filterExcludedRows(elements, excluded);

    const metricsRows = [];
    filteredElements.forEach((row) => {
      const dateRangeRow = row.dateRange || row.dateRangeValue || null;
      const collectedAt = dateRangeRow?.start
        ? `${dateRangeRow.start.year}-${String(dateRangeRow.start.month).padStart(2, '0')}-${String(dateRangeRow.start.day).padStart(2, '0')}`
        : null;

      fields.forEach((field) => {
        const raw = row[field];
        if (raw === undefined || raw === null) return;
        const numVal = Number(raw);
        if (Number.isNaN(numVal)) return;
        metricsRows.push({
          name: mapMetricName(field),
          value: numVal,
          collectedAt,
          meta: { provider: 'linkedin_ads', pivot },
        });
      });
    });

    safeLog('LinkedIn metrics obtidas', {
      integrationId: integration.id,
      count: metricsRows.length,
    });

    return metricsRows;
  } catch (err) {
    safeLog('Erro ao chamar LinkedIn API', err?.message || err);
    const errorPayload = (() => {
      if (err?.responseBody) {
        try {
          return JSON.parse(err.responseBody);
        } catch (_parseErr) {
          return { error: err.responseBody };
        }
      }
      return { error: err?.message || String(err) };
    })();
    await rawStoreService.appendRawApiResponse({
      tenantId: integration?.tenantId || null,
      brandId: integration?.clientId || null,
      provider: 'LINKEDIN_ADS',
      connectionId: integration?.id || null,
      endpoint: '/adAnalytics',
      params: rawParams,
      payload: errorPayload,
      httpStatus: err?.status || null,
    });
    return [];
  }
}

module.exports = {
  fetchAccountMetrics,
};
