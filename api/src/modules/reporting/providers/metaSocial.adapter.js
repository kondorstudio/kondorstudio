const {
  resolveAccessToken,
  getIntegrationConfig,
  getIntegrationSettings,
} = require('./providerUtils');

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
    .filter((account) => account && account.pageId)
    .map((account) => ({
      id: String(account.pageId),
      displayName: account.pageName
        ? `${account.pageName}${account.igUsername ? ` • @${account.igUsername}` : ''}`
        : String(account.pageId),
      meta: {
        igBusinessAccountId: account.igBusinessAccountId || null,
        igUsername: account.igUsername || null,
      },
    }));
}

function filterInstagramOnly(items, integration) {
  const settings = getIntegrationSettings(integration);
  const kind = settings.kind ? String(settings.kind).toLowerCase() : '';
  if (kind !== 'instagram_only') return items;
  return items.filter((item) => item?.meta?.igBusinessAccountId);
}

async function listSelectableAccounts(integration) {
  const accessToken = resolveAccessToken(integration);
  if (!accessToken) return filterInstagramOnly(fallbackAccountsFromConfig(integration), integration);

  const base = getGraphBaseUrl();
  const url = new URL(`${base}/me/accounts`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set(
    'fields',
    'id,name,instagram_business_account{id,username}',
  );
  url.searchParams.set('limit', '200');

  try {
    /* eslint-disable no-undef */
    const res = await fetch(url.toString());
    if (!res.ok) {
      return filterInstagramOnly(fallbackAccountsFromConfig(integration), integration);
    }
    const json = await res.json();
    const data = Array.isArray(json.data) ? json.data : [];
    if (!data.length) {
      return filterInstagramOnly(fallbackAccountsFromConfig(integration), integration);
    }
    const items = data.map((page) => ({
      id: String(page.id),
      displayName: page.name
        ? `${page.name}${
            page.instagram_business_account?.username
              ? ` • @${page.instagram_business_account.username}`
              : ''
          }`
        : String(page.id),
      meta: {
        igBusinessAccountId: page.instagram_business_account?.id
          ? String(page.instagram_business_account.id)
          : null,
        igUsername: page.instagram_business_account?.username
          ? String(page.instagram_business_account.username)
          : null,
      },
    }));
    return filterInstagramOnly(items, integration);
  } catch (_) {
    return filterInstagramOnly(fallbackAccountsFromConfig(integration), integration);
  }
}

async function queryMetrics() {
  return { series: [], table: [], totals: {}, meta: { source: 'META_SOCIAL', mocked: true } };
}

module.exports = {
  listSelectableAccounts,
  queryMetrics,
};
