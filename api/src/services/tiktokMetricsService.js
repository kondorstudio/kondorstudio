// Provider de métricas para TikTok Ads (report/integrated/get)
// - Não salva nada no banco (isso é responsabilidade do job ou reporting adapter).
// - Retorna [] se credenciais estiverem incompletas.

const { resolveAccessToken, getIntegrationSettings, getIntegrationConfig } = require('../modules/reporting/providers/providerUtils');
const httpClient = require('../lib/httpClient');
const rawStoreService = require('./rawStoreService');

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[tiktokMetricsService]', ...args);
}

function getBaseUrl() {
  const base = process.env.TIKTOK_ADS_API_BASE_URL || 'https://business-api.tiktok.com/open_api';
  return String(base).replace(/\/$/, '');
}

function getReportPath() {
  const path = process.env.TIKTOK_ADS_REPORT_PATH || '/v1.3/report/integrated/get/';
  return path.startsWith('http') ? path : path.startsWith('/') ? path : `/${path}`;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

const TIKTOK_CONVERSIONS_FIELD =
  process.env.TIKTOK_CONVERSIONS_METRIC || process.env.TIKTOK_CONVERSION_METRIC || 'conversion';
const TIKTOK_REVENUE_FIELD =
  process.env.TIKTOK_REVENUE_METRIC || 'conversion_value';

const METRIC_ALIAS = {
  [TIKTOK_CONVERSIONS_FIELD]: 'conversions',
  [TIKTOK_REVENUE_FIELD]: 'revenue',
};

const METRIC_FIELD_MAP = {
  conversions: TIKTOK_CONVERSIONS_FIELD,
  revenue: TIKTOK_REVENUE_FIELD,
};

function mapMetricField(metric) {
  return METRIC_FIELD_MAP[metric] || metric;
}

function mapMetricName(field) {
  return METRIC_ALIAS[field] || field;
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

function buildFilteringPayload(filters) {
  if (!filters.length) return [];
  return filters.map((filter) => ({
    field_name: filter.key,
    filter_type: filter.operator === 'NOT_IN' ? 'NOT_IN' : 'IN',
    filter_value: JSON.stringify(filter.values),
  }));
}

function resolveDataLevel(level, breakdown) {
  const raw = String(level || breakdown || '').toUpperCase();
  if (raw.includes('CAMPAIGN')) return 'AUCTION_CAMPAIGN';
  if (raw.includes('ADSET') || raw.includes('AD_GROUP') || raw.includes('ADGROUP')) {
    return 'AUCTION_ADGROUP';
  }
  if (raw.includes('AD')) return 'AUCTION_AD';
  if (raw.includes('ADVERTISER') || raw.includes('ACCOUNT') || raw.includes('CUSTOMER')) {
    return 'AUCTION_ADVERTISER';
  }
  return 'AUCTION_ADVERTISER';
}

function resolveRange(options) {
  const range = options.range || (options.since || options.until ? options : null) || {};
  const start = range.since || range.start_date || range.startDate || null;
  const end = range.until || range.end_date || range.endDate || null;
  return { start, end };
}

async function fetchAccountMetrics(integration, options = {}) {
  if (!integration) {
    safeLog('fetchAccountMetrics chamado sem integration');
    return [];
  }

  const settings = getIntegrationSettings(integration);
  const config = getIntegrationConfig(integration);
  const accessToken = resolveAccessToken(integration) || settings.accessToken || config.accessToken;
  const advertiserId =
    settings.advertiserId ||
    settings.advertiser_id ||
    config.advertiserId ||
    config.advertiser_id ||
    options.advertiserId ||
    options.advertiser_id ||
    null;

  if (!accessToken || !advertiserId) {
    safeLog('Credenciais incompletas para TikTok Ads (accessToken/advertiserId ausentes)');
    return [];
  }

  const { start, end } = resolveRange(options);
  const metrics = normalizeList(options.metricTypes || options.metrics);
  const breakdown = options.breakdown || null;
  const dataLevel =
    options.dataLevel || settings.dataLevel || settings.data_level || resolveDataLevel(options.level, breakdown);

  const dimensions = normalizeList(options.dimensions);
  const wantsDaily = options.granularity === 'day' || options.granularity === 'daily' || options.widgetType === 'LINE';
  if (wantsDaily && !dimensions.includes('stat_time_day')) {
    dimensions.push('stat_time_day');
  }
  if (breakdown && !dimensions.includes(String(breakdown))) {
    dimensions.push(String(breakdown));
  }

  const metricsList = metrics.length
    ? Array.from(new Set(metrics.map(mapMetricField)))
    : ['impressions', 'clicks', 'spend'];
  const filteringPayload = buildFilteringPayload(
    normalizeDimensionFilters(options?.filters && typeof options.filters === 'object'
      ? options.filters.dimensionFilters
      : []),
  );

  const baseUrl = getBaseUrl();
  const reportPath = getReportPath();
  const url = reportPath.startsWith('http') ? reportPath : `${baseUrl}${reportPath}`;

  const pageSize = Number(options.pageSize || 1000);
  const maxPages = Number(options.maxPages || 3);
  let page = 1;
  const rows = [];

  while (page <= maxPages) {
    const params = new URLSearchParams();
    params.set('advertiser_id', String(advertiserId));
    params.set('report_type', String(options.reportType || settings.reportType || 'BASIC'));
    params.set('service_type', String(options.serviceType || settings.serviceType || 'AUCTION'));
    params.set('data_level', String(dataLevel));
    if (start) params.set('start_date', String(start));
    if (end) params.set('end_date', String(end));
    params.set('metrics', JSON.stringify(metricsList));
    params.set('dimensions', JSON.stringify(dimensions));
    params.set('page_size', String(pageSize));
    params.set('page', String(page));
    if (filteringPayload.length) {
      params.set('filtering', JSON.stringify(filteringPayload));
    }
    const rawParams = {
      advertiserId: String(advertiserId),
      dataLevel,
      start,
      end,
      metrics: metricsList,
      dimensions,
      filtering: filteringPayload,
      page,
      pageSize,
    };

    try {
      const response = await httpClient.requestJson(
        `${url}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': String(accessToken),
          },
        },
        {
          provider: 'TIKTOK_ADS',
          endpoint: '/report/integrated/get',
          connectionKey: integration?.id || advertiserId,
          runId: options?.runId || null,
        },
      );
      const json = response.data || {};
      await rawStoreService.appendRawApiResponse({
        tenantId: integration?.tenantId || null,
        brandId: integration?.clientId || null,
        provider: 'TIKTOK_ADS',
        connectionId: integration?.id || null,
        endpoint: '/report/integrated/get',
        params: rawParams,
        payload: json,
        cursor: String(page),
        httpStatus: response.status || null,
      });
      if (json.code && Number(json.code) !== 0) {
        safeLog('TikTok API retornou erro', json.code, json.message || json.error || '');
        return rows;
      }

      const list =
        (json.data && Array.isArray(json.data.list) && json.data.list) ||
        (json.data && Array.isArray(json.data.data) && json.data.data) ||
        (Array.isArray(json.list) ? json.list : []) ||
        [];

      if (!list.length) {
        return rows;
      }

      rows.push(...list);

      const pageInfo = json.data?.page_info || json.data?.pageInfo || null;
      const totalPage = pageInfo?.total_page || pageInfo?.totalPage || null;
      if (totalPage && page >= totalPage) break;
      if (list.length < pageSize) break;
      page += 1;
    } catch (err) {
      safeLog('Erro ao chamar TikTok API', err?.message || err);
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
        provider: 'TIKTOK_ADS',
        connectionId: integration?.id || null,
        endpoint: '/report/integrated/get',
        params: rawParams,
        payload: errorPayload,
        cursor: String(page),
        httpStatus: err?.status || null,
      });
      return rows;
    }
  }

  const metricsRows = [];
  rows.forEach((row) => {
    const metricsObj = row.metrics && typeof row.metrics === 'object' ? row.metrics : row;
    const dims = row.dimensions && typeof row.dimensions === 'object' ? row.dimensions : row;
    const collectedAt =
      dims.stat_time_day ||
      dims.stat_time_hour ||
      dims.date ||
      row.stat_time_day ||
      row.stat_time_hour ||
      row.date ||
      null;

    metricsList.forEach((metric) => {
      const rawVal = metricsObj?.[metric] ?? row?.[metric];
      if (rawVal === undefined || rawVal === null) return;
      const numVal = Number(rawVal);
      if (Number.isNaN(numVal)) return;
      metricsRows.push({
        name: mapMetricName(metric),
        value: numVal,
        collectedAt,
        meta: { provider: 'tiktok_ads' },
      });
    });
  });

  safeLog('TikTok metrics obtidas', {
    integrationId: integration.id,
    count: metricsRows.length,
  });

  return metricsRows;
}

module.exports = {
  fetchAccountMetrics,
};
