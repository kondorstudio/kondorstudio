const {
  getIntegrationSettings,
  normalizeMetricsPayload,
} = require('./providerUtils');
const linkedinMetricsService = require('../../../services/linkedinAdsMetricsService');

async function listSelectableAccounts(integration) {
  const settings = getIntegrationSettings(integration);
  const accountId = settings.accountId || settings.account_id || null;
  if (accountId) {
    return [
      {
        id: String(accountId),
        displayName: `Account ${accountId}`,
        meta: { accountId: String(accountId) },
      },
    ];
  }

  return [];
}

async function queryMetrics(connection, querySpec = {}) {
  if (!connection || !connection.integration) {
    return { series: [], table: [], totals: {}, meta: { source: 'LINKEDIN_ADS', mocked: true } };
  }

  const integration = {
    ...connection.integration,
    settings: {
      ...(connection.integration.settings || {}),
      accountId: connection.externalAccountId,
      account_id: connection.externalAccountId,
    },
  };

  const range = {
    since: querySpec?.dateFrom || querySpec?.since || null,
    until: querySpec?.dateTo || querySpec?.until || null,
  };

  const metrics = Array.isArray(querySpec.metrics) ? querySpec.metrics : null;
  const rows = await linkedinMetricsService.fetchAccountMetrics(integration, {
    range,
    metricTypes: metrics,
    granularity: querySpec.granularity || 'day',
    level: querySpec.level,
    breakdown: querySpec.breakdown,
    widgetType: querySpec.widgetType,
    filters: querySpec.filters,
    options: querySpec.options,
    dateFrom: querySpec.dateFrom,
    dateTo: querySpec.dateTo,
  });

  const normalized = normalizeMetricsPayload(rows || []);
  return { ...normalized, meta: { source: 'LINKEDIN_ADS' } };
}

module.exports = {
  listSelectableAccounts,
  queryMetrics,
};
