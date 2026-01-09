const {
  getIntegrationSettings,
  resolveAccessToken,
} = require('./providerUtils');

async function listSelectableAccounts(integration) {
  const settings = getIntegrationSettings(integration);
  const locationId = settings.locationId || settings.location_id || null;
  if (locationId) {
    return [
      {
        id: String(locationId),
        displayName: `Location ${locationId}`,
        meta: { locationId: String(locationId) },
      },
    ];
  }

  const accessToken = resolveAccessToken(integration);
  if (!accessToken) return [];

  const url = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';

  try {
    /* eslint-disable no-undef */
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const accounts = Array.isArray(json.accounts) ? json.accounts : [];
    const locations = [];

    for (const account of accounts) {
      const accountName = account.name;
      if (!accountName) continue;
      const locUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,storefrontAddress`;
      /* eslint-disable no-undef */
      const locRes = await fetch(locUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!locRes.ok) continue;
      const locJson = await locRes.json();
      const locs = Array.isArray(locJson.locations) ? locJson.locations : [];
      locs.forEach((loc) => {
        if (!loc.name) return;
        const id = loc.name.replace('locations/', '');
        locations.push({
          id,
          displayName: loc.title || `Location ${id}`,
          meta: {
            locationId: id,
            accountName,
            address: loc.storefrontAddress || null,
          },
        });
      });
    }

    return locations;
  } catch (_) {
    return [];
  }
}

async function queryMetrics() {
  return { series: [], table: [], totals: {}, meta: { source: 'GBP', mocked: true } };
}

module.exports = {
  listSelectableAccounts,
  queryMetrics,
};
