// Provider de métricas para integrações "google" (Google Ads).
//
// É usado pelo updateMetricsJob.js, que espera a função:
//    fetchAccountMetrics(integration, range) -> Promise<Array<{ name, value }>>
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
// Parâmetro `range` (opcional) vindo do job:
//   { since: "YYYY-MM-DD", until: "YYYY-MM-DD" }
//
// Observação importante:
// - Se o campo "metrics.cost_micros" for retornado, ele será convertido para valor monetário
//   (cost_micros / 1_000_000) e exposto como "google_ads.cost".

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[googleAdsMetricsService]', ...args);
}

function getBaseUrl() {
  return process.env.GOOGLE_ADS_API_BASE_URL || 'https://googleads.googleapis.com/v14';
}

/**
 * buildFieldsList(credentials)
 * Prioridade:
 *  - credentials.fields (array)
 *  - GOOGLE_ADS_DEFAULT_FIELDS (csv)
 *  - fallback: ["metrics.impressions","metrics.clicks","metrics.cost_micros"]
 */
function buildFieldsList(credentials) {
  if (Array.isArray(credentials.fields) && credentials.fields.length) {
    return credentials.fields;
  }

  if (process.env.GOOGLE_ADS_DEFAULT_FIELDS) {
    return process.env.GOOGLE_ADS_DEFAULT_FIELDS.split(',')
      .map((f) => f.trim())
      .filter(Boolean);
  }

  return ['metrics.impressions', 'metrics.clicks', 'metrics.cost_micros'];
}

/**
 * buildDateFilter(range)
 * range: { since: 'YYYY-MM-DD', until: 'YYYY-MM-DD' }
 * Retorna string com trecho " WHERE segments.date BETWEEN '...' AND '...'" ou vazio.
 */
function buildDateFilter(range) {
  if (!range || typeof range !== 'object') return '';
  const { since, until } = range;
  if (!since && !until) return '';

  // Google Ads exige formato YYYY-MM-DD
  if (since && until) {
    return ` WHERE segments.date BETWEEN '${since}' AND '${until}'`;
  }
  if (since && !until) {
    return ` WHERE segments.date >= '${since}'`;
  }
  if (!since && until) {
    return ` WHERE segments.date <= '${until}'`;
  }
  return '';
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
 * fetchAccountMetrics(integration, range?)
 *
 * - integration: registro prisma.Integration com:
 *    - type/provider "google"
 *    - credentialsJson com accessToken + developerToken + customerId
 * - range: { since, until } (datas em string "YYYY-MM-DD")
 *
 * Retorna: Array<{ name: string, value: number }>
 *   name: "google_ads.<campoSimples>", ex: "google_ads.impressions"
 *
 * Regras especiais:
 *   - metrics.cost_micros é convertido para:
 *       name: "google_ads.cost"
 *       value: cost_micros_total / 1_000_000
 */
async function fetchAccountMetrics(integration, range) {
  if (!integration) {
    safeLog('fetchAccountMetrics chamado sem integration');
    return [];
  }

  let credentials = null;
  try {
    // compatível com integrationsService.create (credentialsJson)
    credentials = integration.credentialsJson
      ? JSON.parse(integration.credentialsJson)
      : null;
  } catch (err) {
    safeLog('Erro ao parsear credentialsJson', err && err.message ? err.message : err);
    return [];
  }

  const accessToken = credentials && credentials.accessToken;
  const developerToken = credentials && credentials.developerToken;
  let customerId = credentials && (credentials.customerId || credentials.customer_id);

  if (!accessToken || !developerToken || !customerId) {
    safeLog('Credenciais incompletas para Google Ads (accessToken/developerToken/customerId ausentes)');
    return [];
  }

  // Normaliza customerId removendo traços
  customerId = String(customerId).replace(/-/g, '');

  const fields = buildFieldsList(credentials);
  const baseUrl = getBaseUrl();

  // Monta GAQL
  const selectClause = `SELECT ${fields.join(', ')}`;
  const fromClause = ' FROM customer';
  const whereClause = buildDateFilter(range);

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

  try {
    /* eslint-disable no-undef */
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      safeLog('Resposta não OK da Google Ads API', res.status, text);
      return [];
    }

    const json = await res.json();

    const results = Array.isArray(json.results) ? json.results : [];
    if (!results.length) {
      safeLog('Google Ads retornou zero linhas de resultados');
      return [];
    }

    // Agregamos métricas por campo (somatório)
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

    const metrics = [];
    for (const field of Object.keys(totals)) {
      let value = totals[field];
      let shortName = field.split('.').pop() || field;

      // Conversão especial para cost_micros -> cost
      if (field === 'metrics.cost_micros' || shortName === 'cost_micros') {
        shortName = 'cost';
        value = value / 1_000_000; // cost_micros para unidade monetária
      }

      metrics.push({
        name: `google_ads.${shortName}`,
        value,
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
    // Não jogamos erro pra fora, para não derrubar o worker inteiro.
    return [];
  }
}

module.exports = {
  fetchAccountMetrics,
};
