// Provider de métricas para integrações "meta" (Facebook/Instagram Ads).
//
// É usado pelo updateMetricsJob.js, que espera a função:
//    fetchAccountMetrics(integration, options) -> Promise<Array<{ name, value }>>
//
// - Não salva nada no banco (isso é responsabilidade do job).
// - Não quebra se credenciais estiverem incompletas: apenas retorna [].
// - Usa fetch da Graph API (Node 18+ tem fetch global por padrão).
//
// Credenciais esperadas em integration.credentialsJson (JSON):
// {
//   "accessToken": "EAAB...",
//   "accountId": "act_1234567890",
//   "fields": ["impressions","clicks","spend"],
//   "level": "account" | "campaign" | ... (opcional, default "account")
// }
//
// Também é possível usar envs para defaults globais:
//   META_GRAPH_BASE_URL (default: https://graph.facebook.com/v17.0)
//   META_DEFAULT_FIELDS (csv, ex: "impressions,clicks,spend")
//
// Opções (options):
//   - range: { since: "YYYY-MM-DD", until: "YYYY-MM-DD" }
//   - metricTypes: ["impressions","clicks",...]
//   - granularity: "day" (default)

const { decrypt } = require('../utils/crypto');
const httpClient = require('../lib/httpClient');
const rawApiResponseService = require('./rawApiResponseService');

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[metaMetricsService]', ...args);
}

function getBaseUrl() {
  return process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v17.0';
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function resolveActionList(...values) {
  for (const value of values) {
    const list = normalizeList(value);
    if (!list.length) continue;
    if (list.some((item) => item === '*' || item.toLowerCase() === 'all')) {
      return [];
    }
    return list;
  }
  return null;
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
    field: filter.key,
    operator: filter.operator === 'NOT_IN' ? 'NOT_IN' : 'IN',
    value: filter.values,
  }));
}

/**
 * buildFieldsList(credentials, metricTypes)
 * Prioridade:
 *  - metricTypes (array)
 *  - credentials.fields (array or csv)
 *  - META_DEFAULT_FIELDS (csv)
 *  - fallback: ["impressions","clicks","spend"]
 */
function buildFieldSelection(credentials, metricTypes) {
  const fromMetrics = normalizeList(metricTypes);

  let baseFields = [];
  if (fromMetrics.length) {
    baseFields = fromMetrics;
  } else {
    const fromCredentials = normalizeList(credentials.fields);
    if (fromCredentials.length) {
      baseFields = fromCredentials;
    } else if (process.env.META_DEFAULT_FIELDS) {
      const fromEnv = normalizeList(process.env.META_DEFAULT_FIELDS);
      if (fromEnv.length) {
        baseFields = fromEnv;
      }
    }
  }

  if (!baseFields.length) {
    baseFields = ['impressions', 'clicks', 'spend'];
  }

  const wantsConversions =
    fromMetrics.includes('conversions') || baseFields.includes('conversions');
  const wantsRevenue =
    fromMetrics.includes('revenue') || baseFields.includes('revenue');

  const fields = baseFields.filter(
    (field) => field !== 'conversions' && field !== 'revenue',
  );
  if (wantsConversions && !fields.includes('actions')) {
    fields.push('actions');
  }
  if (wantsRevenue && !fields.includes('action_values')) {
    fields.push('action_values');
  }

  return { fields, wantsConversions, wantsRevenue };
}

function sumActionValues(actions, allowedActions) {
  if (!Array.isArray(actions)) return 0;
  const allowAll = !Array.isArray(allowedActions) || allowedActions.length === 0;
  const allowSet = allowAll ? null : new Set(allowedActions);
  return actions.reduce((sum, entry) => {
    if (!entry) return sum;
    const actionType = String(entry.action_type || entry.actionType || '').trim();
    if (!actionType) return sum;
    if (allowSet && !allowSet.has(actionType)) return sum;
    const value = Number(entry.value);
    if (Number.isNaN(value)) return sum;
    return sum + value;
  }, 0);
}

function resolveMetaActionTypes(credentials = {}, integration = {}) {
  const settings = integration.settings || {};
  const config = integration.config || {};
  const defaultConversions = ['lead', 'purchase'];
  const defaultRevenue = ['purchase'];

  const conversionActions = resolveActionList(
    credentials.conversionActions,
    credentials.conversion_actions,
    settings.conversionActions,
    settings.conversion_actions,
    config.conversionActions,
    config.conversion_actions,
    process.env.META_CONVERSION_ACTIONS,
  );
  const revenueActions = resolveActionList(
    credentials.revenueActions,
    credentials.revenue_actions,
    settings.revenueActions,
    settings.revenue_actions,
    config.revenueActions,
    config.revenue_actions,
    process.env.META_REVENUE_ACTIONS,
  );

  return {
    conversionActions:
      conversionActions === null ? defaultConversions : conversionActions,
    revenueActions: revenueActions === null ? defaultRevenue : revenueActions,
  };
}

function buildFieldsList(credentials, metricTypes, integration) {
  const { fields, wantsConversions, wantsRevenue } = buildFieldSelection(
    credentials,
    metricTypes,
  );
  const { conversionActions, revenueActions } = resolveMetaActionTypes(
    credentials,
    integration,
  );
  return {
    fields,
    wantsConversions,
    wantsRevenue,
    conversionActions,
    revenueActions,
  };
}


/**
 * buildTimeRangeParams(range)
 * range: { since: 'YYYY-MM-DD', until: 'YYYY-MM-DD' }
 */
function buildTimeRangeParams(range) {
  if (!range || typeof range !== 'object') return {};
  const { since, until } = range;
  if (!since && !until) return {};

  const payload = {};
  if (since) payload.since = since;
  if (until) payload.until = until;

  return payload;
}

/**
 * fetchAccountMetrics(integration, options?)
 *
 * - integration: registro prisma.Integration com:
 *    - provider/type "meta"
 *    - settings/credentialsJson com accessToken + accountId
 * - options:
 *    - range: { since, until }
 *    - metricTypes
 *
 * Retorna: Array<{ name: string, value: number, collectedAt?: string }>
 */
function resolveAccessToken(credentials, integration) {
  if (credentials?.accessToken) return credentials.accessToken;
  if (integration?.accessToken) return integration.accessToken;
  if (integration?.accessTokenEncrypted) {
    try {
      return decrypt(integration.accessTokenEncrypted);
    } catch (err) {
      safeLog('Falha ao decrypt accessTokenEncrypted', err?.message || err);
    }
  }
  if (integration?.settings?.accessToken) return integration.settings.accessToken;
  return null;
}

async function fetchAccountMetrics(integration, options = {}) {
  if (!integration) {
    safeLog('fetchAccountMetrics chamado sem integration');
    return [];
  }

  const range = options.range || (options.since || options.until ? options : null);
  const metricTypes = Array.isArray(options.metricTypes) ? options.metricTypes : null;
  const dimensionFilters = normalizeDimensionFilters(
    options?.filters && typeof options.filters === 'object'
      ? options.filters.dimensionFilters
      : [],
  );

  let credentials = {};
  try {
    if (integration.credentialsJson) {
      credentials = JSON.parse(integration.credentialsJson) || {};
    } else if (integration.settings && typeof integration.settings === 'object') {
      credentials = integration.settings;
    }
  } catch (err) {
    safeLog('Erro ao parsear credenciais', err && err.message ? err.message : err);
    return [];
  }

  const accessToken = resolveAccessToken(credentials, integration);
  const accountId =
    credentials.accountId ||
    credentials.adAccountId ||
    credentials.account_id ||
    (integration.settings && integration.settings.accountId);

  if (!accessToken || !accountId) {
    safeLog('Credenciais incompletas para Meta (accessToken/accountId ausentes)');
    return [];
  }

  const level = credentials.level || 'account';
  const {
    fields,
    wantsConversions,
    wantsRevenue,
    conversionActions,
    revenueActions,
  } = buildFieldsList(credentials, metricTypes, integration);
  const baseUrl = getBaseUrl();

  const timeRangePayload = buildTimeRangeParams(range);

  const params = new URLSearchParams();
  params.set('access_token', accessToken);
  params.set('level', level);
  params.set('time_increment', '1'); // diário
  params.set('fields', fields.join(','));

  if (Object.keys(timeRangePayload).length) {
    params.set('time_range', JSON.stringify(timeRangePayload));
  } else if (credentials.date_preset) {
    params.set('date_preset', credentials.date_preset);
  }

  const filteringPayload = buildFilteringPayload(dimensionFilters);
  if (filteringPayload.length) {
    params.set('filtering', JSON.stringify(filteringPayload));
  }

  const url = `${baseUrl}/${encodeURIComponent(accountId)}/insights?${params.toString()}`;
  const rawParams = {
    accountId: String(accountId),
    level: String(level),
    fields,
    timeRange: timeRangePayload,
    filtering: filteringPayload,
    metricTypes: metricTypes || null,
  };

  try {
    const response = await httpClient.requestJson(
      url,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      {
        provider: 'META',
        endpoint: '/insights',
        connectionKey: integration?.id || accountId,
        runId: options?.runId || null,
      },
    );
    const json = response.data || {};
    await rawApiResponseService.appendRawApiResponse({
      tenantId: integration?.tenantId || null,
      brandId: integration?.clientId || null,
      provider: 'META',
      connectionId: integration?.id || null,
      endpoint: '/insights',
      params: rawParams,
      payload: json,
      httpStatus: response.status || null,
    });

    const data = Array.isArray(json.data) ? json.data : [];
    if (!data.length) {
      safeLog('Meta retornou zero linhas de insights');
      return [];
    }

    const metrics = [];

    for (const row of data) {
      const collectedAt = row.date_start || row.date || null;
      const actions = Array.isArray(row.actions) ? row.actions : [];
      const actionValues = Array.isArray(row.action_values) ? row.action_values : [];

      if (wantsConversions) {
        const conversions = sumActionValues(actions, conversionActions);
        metrics.push({
          name: 'conversions',
          value: conversions,
          collectedAt,
          meta: {
            provider: 'meta',
            rawField: 'actions',
            dateStart: row.date_start || null,
            dateStop: row.date_stop || null,
          },
        });
      }

      if (wantsRevenue) {
        const revenue = sumActionValues(actionValues, revenueActions);
        metrics.push({
          name: 'revenue',
          value: revenue,
          collectedAt,
          meta: {
            provider: 'meta',
            rawField: 'action_values',
            dateStart: row.date_start || null,
            dateStop: row.date_stop || null,
          },
        });
      }

      for (const field of fields) {
        if (field === 'actions' || field === 'action_values') continue;
        if (row[field] === undefined || row[field] === null) continue;

        const numVal = Number(row[field]);
        if (Number.isNaN(numVal)) continue;

        metrics.push({
          name: field,
          value: numVal,
          collectedAt,
          meta: {
            provider: 'meta',
            rawField: field,
            dateStart: row.date_start || null,
            dateStop: row.date_stop || null,
          },
        });
      }
    }

    safeLog('Meta metrics obtidas', {
      integrationId: integration.id,
      count: metrics.length,
    });

    return metrics;
  } catch (err) {
    safeLog(
      'Erro ao chamar Meta Graph API',
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
    await rawApiResponseService.appendRawApiResponse({
      tenantId: integration?.tenantId || null,
      brandId: integration?.clientId || null,
      provider: 'META',
      connectionId: integration?.id || null,
      endpoint: '/insights',
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
