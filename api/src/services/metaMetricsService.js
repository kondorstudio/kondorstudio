// Provider de métricas para integrações "meta" (Facebook/Instagram Ads).
//
// É usado pelo updateMetricsJob.js, que espera a função:
//    fetchAccountMetrics(integration, range) -> Promise<Array<{ name, value }>>
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
// Parâmetro `range` (opcional) vindo do job:
//   { since: "YYYY-MM-DD", until: "YYYY-MM-DD" }

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[metaMetricsService]', ...args);
}

function getBaseUrl() {
  return process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v17.0';
}

/**
 * buildFieldsList(credentials)
 * Prioridade:
 *  - credentials.fields (array)
 *  - META_DEFAULT_FIELDS (csv)
 *  - fallback: ["impressions","clicks","spend"]
 */
function buildFieldsList(credentials) {
  if (Array.isArray(credentials.fields) && credentials.fields.length) {
    return credentials.fields;
  }

  if (process.env.META_DEFAULT_FIELDS) {
    return process.env.META_DEFAULT_FIELDS
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
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
 * fetchAccountMetrics(integration, range?)
 *
 * - integration: registro prisma.Integration com:
 *    - provider/type "meta"
 *    - credentialsJson com accessToken + accountId
 * - range: { since, until } (datas em string "YYYY-MM-DD")
 *
 * Retorna: Array<{ name: string, value: number }>
 */
async function fetchAccountMetrics(integration, range) {
  if (!integration) {
    safeLog('fetchAccountMetrics chamado sem integration');
    return [];
  }

  let credentials = null;
  try {
    credentials = integration.credentialsJson
      ? JSON.parse(integration.credentialsJson)
      : null;
  } catch (err) {
    safeLog(
      'Erro ao parsear credentialsJson',
      err && err.message ? err.message : err,
    );
    return [];
  }

  const accessToken = credentials && credentials.accessToken;
  const accountId =
    credentials &&
    (credentials.accountId ||
      credentials.adAccountId ||
      credentials.account_id);

  if (!accessToken || !accountId) {
    safeLog('Credenciais incompletas para Meta (accessToken/accountId ausentes)');
    return [];
  }

  const level = credentials.level || 'account';
  const fields = buildFieldsList(credentials);
  const baseUrl = getBaseUrl();

  // Monta time_range (quando range foi informado)
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
      for (const field of fields) {
        if (row[field] === undefined || row[field] === null) continue;

        const numVal = Number(row[field]);
        if (Number.isNaN(numVal)) continue;

        metrics.push({
          name: `meta.${field}`,
          value: numVal,
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
