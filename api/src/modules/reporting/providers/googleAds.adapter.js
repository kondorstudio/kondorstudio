const {
  getIntegrationSettings,
  normalizeMetricsPayload,
} = require('./providerUtils');
const googleAdsMetricsService = require('../../../services/googleAdsMetricsService');

function getBaseUrl() {
  return process.env.GOOGLE_ADS_API_BASE_URL || 'https://googleads.googleapis.com/v14';
}

async function fetchAccessibleCustomers(accessToken) {
  const url = `${getBaseUrl()}/customers:listAccessibleCustomers`;
  try {
    /* eslint-disable no-undef */
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const names = Array.isArray(json.resourceNames) ? json.resourceNames : [];
    return names.map((name) => String(name).replace('customers/', '')).filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function listSelectableAccounts(integration) {
  const settings = getIntegrationSettings(integration);
  const accessToken = settings.accessToken || settings.access_token || null;
  const developerToken = settings.developerToken || settings.developer_token || null;

  if (!accessToken) {
    if (settings.customerId || settings.customer_id) {
      const customerId = String(settings.customerId || settings.customer_id);
      return [
        {
          id: customerId,
          displayName: `Customer ${customerId}`,
          meta: { customerId },
        },
      ];
    }
    return [];
  }

  const ids = await fetchAccessibleCustomers(accessToken);
  if (!ids.length) return [];

  if (!developerToken) {
    return ids.map((id) => ({
      id,
      displayName: `Customer ${id}`,
      meta: { customerId: id },
    }));
  }

  return ids.map((id) => ({
    id,
    displayName: `Customer ${id}`,
    meta: { customerId: id },
  }));
}

async function queryMetrics(connection, querySpec = {}) {
  if (!connection || !connection.integration) {
    return { series: [], table: [], totals: {}, meta: { mocked: true } };
  }

  const integration = {
    ...connection.integration,
    settings: {
      ...(connection.integration.settings || {}),
      customerId: connection.externalAccountId,
      customer_id: connection.externalAccountId,
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
  const rows = await googleAdsMetricsService.fetchAccountMetrics(integration, {
    range,
    metricTypes: metrics,
    granularity: querySpec.granularity || 'day',
    filters,
  });

  const normalized = normalizeMetricsPayload(rows || []);
  return { ...normalized, meta: { source: 'GOOGLE_ADS' } };
}

module.exports = {
  listSelectableAccounts,
  queryMetrics,
};
