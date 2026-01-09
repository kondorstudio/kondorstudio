const { getIntegrationSettings } = require('./providerUtils');

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

async function queryMetrics() {
  return { series: [], table: [], totals: {}, meta: { source: 'TIKTOK_ADS', mocked: true } };
}

module.exports = {
  listSelectableAccounts,
  queryMetrics,
};
