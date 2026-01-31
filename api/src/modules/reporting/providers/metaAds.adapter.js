const {
  resolveAccessToken,
  getIntegrationConfig,
  normalizeMetricsPayload,
} = require('./providerUtils');
const metaMetricsService = require('../../../services/metaMetricsService');

function getGraphBaseUrl() {
  const base = process.env.META_GRAPH_BASE_URL;
  if (base && String(base).trim()) return String(base).replace(/\/$/, '');
  const version = process.env.META_OAUTH_VERSION || 'v24.0';
  return `https://graph.facebook.com/${version}`;
}

function fallbackAccountsFromConfig(integration) {
  const config = getIntegrationConfig(integration);
  const accounts = Array.isArray(config.accounts) ? config.accounts : [];
  return accounts
    .filter((account) => account && account.adAccountId)
    .map((account) => ({
      id: String(account.adAccountId),
      displayName: account.name
        ? `${account.name} (${account.adAccountId})`
        : String(account.adAccountId),
      meta: {
        currency: account.currency || null,
        timezone: account.timezone || null,
        status: account.status ?? null,
      },
    }));
}

async function listSelectableAccounts(integration) {
  const accessToken = resolveAccessToken(integration);
  if (!accessToken) return fallbackAccountsFromConfig(integration);

  const base = getGraphBaseUrl();
  const url = new URL(`${base}/me/adaccounts`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set(
    'fields',
    'id,name,account_status,currency,timezone_name',
  );
  url.searchParams.set('limit', '200');

  try {
    /* eslint-disable no-undef */
    const res = await fetch(url.toString());
    if (!res.ok) {
      return fallbackAccountsFromConfig(integration);
    }
    const json = await res.json();
    const data = Array.isArray(json.data) ? json.data : [];
    if (!data.length) return fallbackAccountsFromConfig(integration);
    return data.map((acc) => ({
      id: String(acc.id),
      displayName: acc.name ? `${acc.name} (${acc.id})` : String(acc.id),
      meta: {
        currency: acc.currency || null,
        timezone: acc.timezone_name || null,
        status: acc.account_status ?? null,
      },
    }));
  } catch (_) {
    return fallbackAccountsFromConfig(integration);
  }
}

async function queryMetrics(connection, querySpec = {}) {
  if (!connection || !connection.integration) {
    return { series: [], table: [], totals: {}, meta: { mocked: true } };
  }

  const integration = {
    ...connection.integration,
    settings: {
      ...(connection.integration.settings || {}),
      accountId: connection.externalAccountId,
      adAccountId: connection.externalAccountId,
    },
  };

  const range = {
    since: querySpec?.dateFrom || querySpec?.since || null,
    until: querySpec?.dateTo || querySpec?.until || null,
  };

  const metrics = Array.isArray(querySpec.metrics) ? querySpec.metrics : null;
  const filters =
    querySpec?.filters && typeof querySpec.filters === 'object'
      ? querySpec.filters
      : null;
  const rows = await metaMetricsService.fetchAccountMetrics(integration, {
    range,
    metricTypes: metrics,
    granularity: querySpec.granularity || 'day',
    filters,
  });

  const normalized = normalizeMetricsPayload(rows || []);
  return { ...normalized, meta: { source: 'META_ADS' } };
}

module.exports = {
  listSelectableAccounts,
  queryMetrics,
};
