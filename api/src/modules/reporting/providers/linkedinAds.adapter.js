const { getIntegrationSettings } = require('./providerUtils');

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

async function queryMetrics() {
  return { series: [], table: [], totals: {}, meta: { source: 'LINKEDIN_ADS', mocked: true } };
}

module.exports = {
  listSelectableAccounts,
  queryMetrics,
};
