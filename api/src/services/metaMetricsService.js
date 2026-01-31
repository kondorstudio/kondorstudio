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
function buildFieldsList(credentials, metricTypes) {
  const fromMetrics = normalizeList(metricTypes);
  if (fromMetrics.length) return fromMetrics;

  const fromCredentials = normalizeList(credentials.fields);
  if (fromCredentials.length) return fromCredentials;

  if (process.env.META_DEFAULT_FIELDS) {
    const fromEnv = normalizeList(process.env.META_DEFAULT_FIELDS);
    if (fromEnv.length) return fromEnv;
  }

  return ['impressions', 'clicks', 'spend'];
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
  const fields = buildFieldsList(credentials, metricTypes);
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

  try {
    /* eslint-disable no-undef */
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      safeLog('Resposta não OK da Meta', res.status, text);
      return [];
    }

    const json = await res.json();

    const data = Array.isArray(json.data) ? json.data : [];
    if (!data.length) {
      safeLog('Meta retornou zero linhas de insights');
      return [];
    }

    const metrics = [];

    for (const row of data) {
      const collectedAt = row.date_start || row.date || null;
      for (const field of fields) {
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
    return [];
  }
}

module.exports = {
  fetchAccountMetrics,
};
