const {
  getIntegrationSettings,
  normalizeMetricsPayload,
} = require('./providerUtils');
const tiktokMetricsService = require('../../../services/tiktokMetricsService');

async function listSelectableAccounts(integration) {
  const settings = getIntegrationSettings(integration);
  const advertiserId = settings.advertiserId || settings.advertiser_id || null;
  if (advertiserId) {
    return [
      {
        id: String(advertiserId),
        displayName: `Advertiser ${advertiserId}`,
        meta: { advertiserId: String(advertiserId) },
      },
    ];
  }

  return [];
}

async function queryMetrics(connection, querySpec = {}) {
  if (!connection || !connection.integration) {
    return { series: [], table: [], totals: {}, meta: { source: 'TIKTOK_ADS', mocked: true } };
  }

  const integration = {
    ...connection.integration,
    settings: {
      ...(connection.integration.settings || {}),
      advertiserId: connection.externalAccountId,
      advertiser_id: connection.externalAccountId,
    },
  };

  const range = {
    since: querySpec?.dateFrom || querySpec?.since || null,
    until: querySpec?.dateTo || querySpec?.until || null,
  };

  const metrics = Array.isArray(querySpec.metrics) ? querySpec.metrics : null;
  const rows = await tiktokMetricsService.fetchAccountMetrics(integration, {
    range,
    metricTypes: metrics,
    granularity: querySpec.granularity || 'day',
    level: querySpec.level,
    breakdown: querySpec.breakdown,
    widgetType: querySpec.widgetType,
    filters: querySpec.filters,
    options: querySpec.options,
  });

  const normalized = normalizeMetricsPayload(rows || []);
  return { ...normalized, meta: { source: 'TIKTOK_ADS' } };
}

module.exports = {
  listSelectableAccounts,
  queryMetrics,
};
