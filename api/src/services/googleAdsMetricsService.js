// Provider de métricas para integrações "google" (Google Ads).
//
// É usado pelo updateMetricsJob.js, que espera a função:
//    fetchAccountMetrics(integration, options) -> Promise<Array<{ name, value }>>
//
// - Não salva nada no banco (isso é responsabilidade do job).
// - Não quebra se credenciais estiverem incompletas: apenas retorna [].
// - Usa fetch para chamar a Google Ads API (googleAds:search).
//
// Credenciais esperadas em integration.credentialsJson (JSON):
// {
//   "accessToken": "ya29...",
//   "developerToken": "xxxxx",
//   "customerId": "123-456-7890",
//   "loginCustomerId": "987-654-3210",     // opcional
//   "fields": ["metrics.impressions","metrics.clicks","metrics.cost_micros"],
//   "date_preset": "LAST_30_DAYS"          // opcional (quando não passar range)
// }
//
// Também é possível usar envs para defaults globais:
//   GOOGLE_ADS_API_BASE_URL  (default: https://googleads.googleapis.com/v14)
//   GOOGLE_ADS_DEFAULT_FIELDS (csv, ex: "metrics.impressions,metrics.clicks,metrics.cost_micros")
//
// Opções (options):
//   - range: { since: "YYYY-MM-DD", until: "YYYY-MM-DD" }
//   - metricTypes: ["impressions","clicks","spend",...]
//   - granularity: "day" (default)
//
// Observação importante:
// - Se o campo "metrics.cost_micros" for retornado, ele será convertido para valor monetário
//   (cost_micros / 1_000_000) e exposto como "spend".

const rawStoreService = require('./rawStoreService');
const httpClient = require('../lib/httpClient');

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[googleAdsMetricsService]', ...args);
}

function getBaseUrl() {
  return process.env.GOOGLE_ADS_API_BASE_URL || 'https://googleads.googleapis.com/v14';
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

function formatGaqlValue(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return raw;
  const escaped = raw.replace(/\\\\/g, "\\\\").replace(/'/g, "\\'");
  return `'${escaped}'`;
}

const METRIC_FIELD_MAP = {
  impressions: 'metrics.impressions',
  clicks: 'metrics.clicks',
  spend: 'metrics.cost_micros',
  cost: 'metrics.cost_micros',
  conversions: 'metrics.conversions',
  revenue: 'metrics.conversions_value',
  value: 'metrics.conversions_value',
  ctr: 'metrics.ctr',
  cpc: 'metrics.average_cpc',
  cpm: 'metrics.average_cpm',
};

function mapMetricField(metric) {
  if (!metric) return null;
  const raw = String(metric).trim();
  if (!raw) return null;
  if (raw.includes('.')) return raw;
  return METRIC_FIELD_MAP[raw] || `metrics.${raw}`;
}

/**
 * buildFieldsList(credentials, metricTypes)
 * Prioridade:
 *  - metricTypes (array)
 *  - credentials.fields (array or csv)
 *  - GOOGLE_ADS_DEFAULT_FIELDS (csv)
 *  - fallback: ["metrics.impressions","metrics.clicks","metrics.cost_micros"]
 */
function buildFieldsList(credentials, metricTypes) {
  const fromMetrics = normalizeList(metricTypes).map(mapMetricField).filter(Boolean);
  if (fromMetrics.length) return Array.from(new Set(fromMetrics));

  const fromCredentials = normalizeList(credentials.fields).map(mapMetricField).filter(Boolean);
  if (fromCredentials.length) return Array.from(new Set(fromCredentials));

  if (process.env.GOOGLE_ADS_DEFAULT_FIELDS) {
    const fromEnv = normalizeList(process.env.GOOGLE_ADS_DEFAULT_FIELDS)
      .map(mapMetricField)
      .filter(Boolean);
    if (fromEnv.length) return Array.from(new Set(fromEnv));
  }

  return ['metrics.impressions', 'metrics.clicks', 'metrics.cost_micros'];
}

function buildDateCondition(range) {
  if (!range || typeof range !== 'object') return null;
  const { since, until } = range;
  if (!since && !until) return null;

  if (since && until) {
    return `segments.date BETWEEN '${since}' AND '${until}'`;
  }
  if (since && !until) {
    return `segments.date >= '${since}'`;
  }
  if (!since && until) {
    return `segments.date <= '${until}'`;
  }
  return null;
}

function buildDimensionConditions(filters) {
  if (!filters.length) return [];
  return filters
    .map((filter) => {
      const values = filter.values
        .map((value) => formatGaqlValue(value))
        .filter(Boolean);
      if (!values.length) return null;
      const operator = filter.operator === 'NOT_IN' ? 'NOT IN' : 'IN';
      return `${filter.key} ${operator} (${values.join(', ')})`;
    })
    .filter(Boolean);
}

function buildWhereClause(range, dimensionFilters) {
  const conditions = [];
  const dateCondition = buildDateCondition(range);
  if (dateCondition) conditions.push(dateCondition);
  const dimensionConditions = buildDimensionConditions(dimensionFilters);
  if (dimensionConditions.length) {
    conditions.push(...dimensionConditions);
  }
  if (!conditions.length) return '';
  return ` WHERE ${conditions.join(' AND ')}`;
}

/**
 * safeGetDeep(row, path) onde path é "metrics.clicks" etc.
 */
function safeGetDeep(row, path) {
  if (!row || !path) return undefined;
  const parts = path.split('.');
  let current = row;
  for (const p of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[p];
  }
  return current;
}

/**
 * fetchAccountMetrics(integration, options?)
 *
 * - integration: registro prisma.Integration com:
 *    - type/provider "google"
 *    - credentialsJson com accessToken + developerToken + customerId
 * - options: { range, metricTypes, granularity }
 *
 * Retorna: Array<{ name: string, value: number, collectedAt?: string }>
 */
async function fetchAccountMetrics(integration, options = {}) {
  if (!integration) {
    safeLog('fetchAccountMetrics chamado sem integration');
    return [];
  }

  const range = options.range || (options.since || options.until ? options : null);
  const metricTypes = Array.isArray(options.metricTypes) ? options.metricTypes : null;
  const granularity = options.granularity || 'day';
  const includeDate = granularity === 'day' || granularity === 'date';
  const dimensionFilters = normalizeDimensionFilters(
    options?.filters && typeof options.filters === 'object'
      ? options.filters.dimensionFilters
      : [],
  );

  let credentials = {};
  try {
    credentials = integration.credentialsJson
      ? JSON.parse(integration.credentialsJson) || {}
      : (integration.settings && typeof integration.settings === 'object' ? integration.settings : {});
  } catch (err) {
    safeLog('Erro ao parsear credenciais', err && err.message ? err.message : err);
    return [];
  }

  const accessToken = credentials.accessToken || integration.accessToken;
  const developerToken =
    credentials.developerToken ||
    (integration.settings && integration.settings.developerToken);
  let customerId = credentials.customerId || credentials.customer_id;

  if (!accessToken || !developerToken || !customerId) {
    safeLog('Credenciais incompletas para Google Ads (accessToken/developerToken/customerId ausentes)');
    return [];
  }

  customerId = String(customerId).replace(/-/g, '');

  const fields = buildFieldsList(credentials, metricTypes);
  const baseUrl = getBaseUrl();

  const selectFields = includeDate
    ? ['segments.date', ...fields]
    : fields;

  const selectClause = `SELECT ${selectFields.join(', ')}`;
  const fromClause = ' FROM customer';
  const whereClause = buildWhereClause(range, dimensionFilters);

  const query = `${selectClause}${fromClause}${whereClause}`;

  const url = `${baseUrl}/customers/${encodeURIComponent(
    customerId,
  )}/googleAds:search`;

  const body = JSON.stringify({
    query,
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
  };

  if (credentials.loginCustomerId || credentials.login_customer_id) {
    headers['login-customer-id'] = String(
      credentials.loginCustomerId || credentials.login_customer_id,
    ).replace(/-/g, '');
  }
  const rawParams = {
    customerId,
    query,
    fields,
    includeDate,
    range: range || null,
    dimensionFilters,
  };

  try {
    const response = await httpClient.requestJson(
      url,
      {
        method: 'POST',
        headers,
        body,
      },
      {
        provider: 'GOOGLE_ADS',
        endpoint: '/googleAds:search',
        connectionKey: integration?.id || customerId,
        runId: options?.runId || null,
      },
    );
    const json = response.data || {};
    await rawStoreService.appendRawApiResponse({
      tenantId: integration?.tenantId || null,
      brandId: integration?.clientId || null,
      provider: 'GOOGLE_ADS',
      connectionId: integration?.id || null,
      endpoint: '/googleAds:search',
      params: rawParams,
      payload: json,
      httpStatus: response.status || null,
    });

    const results = Array.isArray(json.results) ? json.results : [];
    if (!results.length) {
      safeLog('Google Ads retornou zero linhas de resultados');
      return [];
    }

    const metrics = [];

    if (includeDate) {
      for (const row of results) {
        const dateValue = safeGetDeep(row, 'segments.date') || null;
        for (const field of fields) {
          const rawVal = safeGetDeep(row, field);
          if (rawVal === undefined || rawVal === null) continue;

          let numVal = Number(rawVal);
          if (Number.isNaN(numVal)) continue;

          let shortName = field.split('.').pop() || field;
          if (field === 'metrics.cost_micros' || shortName === 'cost_micros') {
            shortName = 'spend';
            numVal = numVal / 1_000_000;
          }

          metrics.push({
            name: shortName,
            value: numVal,
            collectedAt: dateValue,
            meta: {
              provider: 'google_ads',
              rawField: field,
            },
          });
        }
      }

      safeLog('Google Ads metrics obtidas', {
        integrationId: integration.id,
        count: metrics.length,
      });

      return metrics;
    }

    const totals = {};
    for (const row of results) {
      for (const field of fields) {
        const rawVal = safeGetDeep(row, field);
        if (rawVal === undefined || rawVal === null) continue;

        const numVal = Number(rawVal);
        if (Number.isNaN(numVal)) continue;

        if (!totals[field]) totals[field] = 0;
        totals[field] += numVal;
      }
    }

    for (const field of Object.keys(totals)) {
      let value = totals[field];
      let shortName = field.split('.').pop() || field;

      if (field === 'metrics.cost_micros' || shortName === 'cost_micros') {
        shortName = 'spend';
        value = value / 1_000_000;
      }

      metrics.push({
        name: shortName,
        value,
        meta: {
          provider: 'google_ads',
          rawField: field,
        },
      });
    }

    safeLog('Google Ads metrics obtidas', {
      integrationId: integration.id,
      count: metrics.length,
    });

    return metrics;
  } catch (err) {
    safeLog(
      'Erro ao chamar Google Ads API',
      err && err.message ? err.message : err,
    );
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
      provider: 'GOOGLE_ADS',
      connectionId: integration?.id || null,
      endpoint: '/googleAds:search',
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
