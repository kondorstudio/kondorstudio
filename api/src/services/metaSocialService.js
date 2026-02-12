// api/src/services/metaSocialService.js
// Serviço responsável pela integração Meta
// (Facebook Pages + Instagram Graph API + Meta Ads OAuth)

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { encrypt } = require('../utils/crypto');
const { useTenant } = require('../prisma');
const { syncAfterConnection } = require('./factMetricsSyncService');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_local_secret';

function getOauthVersion() {
  return process.env.META_OAUTH_VERSION || 'v24.0';
}

function getGraphBaseUrl() {
  const base = process.env.META_GRAPH_BASE_URL;
  if (base && String(base).trim()) return String(base).replace(/\/$/, '');
  return `https://graph.facebook.com/${getOauthVersion()}`;
}

function assertEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing env var: ${name}`);
  }
  return String(v);
}

function normalizeKind(kind) {
  const raw = String(kind || '').trim().toLowerCase();
  if (!raw) return 'meta_business';
  if (raw === 'instagram') return 'instagram_only';
  return raw;
}

function splitCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveRedirectUri(kind) {
  const normalized = normalizeKind(kind);
  const candidates = [];

  if (normalized === 'meta_ads') {
    candidates.push(process.env.META_ADS_REDIRECT_URI);
  }

  candidates.push(process.env.META_SOCIAL_REDIRECT_URI);
  candidates.push(process.env.META_OAUTH_REDIRECT_URI);

  const redirectUri = candidates.find((value) => value && String(value).trim());
  if (!redirectUri) {
    throw new Error(
      'Missing Meta redirect URI env (META_SOCIAL_REDIRECT_URI or META_OAUTH_REDIRECT_URI)',
    );
  }

  return String(redirectUri);
}

function resolveScopes(kind) {
  const normalized = normalizeKind(kind);

  if (normalized === 'meta_ads') {
    const envScopes = splitCsv(process.env.META_ADS_SCOPES);
    if (envScopes.length) return envScopes;
    return ['public_profile', 'email', 'ads_read', 'business_management'];
  }

  const envScopes = splitCsv(process.env.META_SOCIAL_SCOPES);
  if (envScopes.length) return envScopes;

  return [
    'public_profile',
    'email',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'instagram_basic',
    'instagram_manage_insights',
    'instagram_content_publish',
  ];
}

function buildOwnerKey(clientId, kind) {
  if (!clientId) return 'AGENCY';
  return `${clientId}:${normalizeKind(kind)}`;
}

async function ensureDataSourceConnection(db, payload) {
  if (!db || !payload) return null;
  const brandId = payload.brandId ? String(payload.brandId) : null;
  const source = payload.source ? String(payload.source) : null;
  const externalAccountId = payload.externalAccountId
    ? String(payload.externalAccountId)
    : null;
  const displayName = payload.displayName ? String(payload.displayName) : null;
  const integrationId = payload.integrationId ? String(payload.integrationId) : null;
  const meta =
    payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
      ? payload.meta
      : null;

  if (!brandId || !source || !externalAccountId || !displayName) return null;

  const existing = await db.dataSourceConnection.findFirst({
    where: {
      brandId,
      source,
      externalAccountId,
    },
    select: { id: true },
  });

  if (existing?.id) {
    return db.dataSourceConnection.update({
      where: { id: existing.id },
      data: {
        integrationId,
        displayName,
        status: 'CONNECTED',
        meta,
      },
    });
  }

  return db.dataSourceConnection.create({
    data: {
      brandId,
      source,
      integrationId,
      externalAccountId,
      displayName,
      status: 'CONNECTED',
      meta,
    },
  });
}

async function ensureBrandSourceConnection(db, payload) {
  if (!db || !payload) return null;
  const brandId = payload.brandId ? String(payload.brandId) : null;
  const platform = payload.platform ? String(payload.platform) : null;
  const externalAccountId = payload.externalAccountId
    ? String(payload.externalAccountId)
    : null;
  const externalAccountName = payload.externalAccountName
    ? String(payload.externalAccountName)
    : null;

  if (!brandId || !platform || !externalAccountId || !externalAccountName) return null;

  return db.brandSourceConnection.upsert({
    where: {
      brandId_platform_externalAccountId: {
        brandId,
        platform,
        externalAccountId,
      },
    },
    update: {
      externalAccountName,
      status: 'ACTIVE',
    },
    create: {
      brandId,
      platform,
      externalAccountId,
      externalAccountName,
      status: 'ACTIVE',
    },
  });
}

async function ensureMetaConnectionsFromCallback({
  tenantId,
  clientId,
  kind,
  integrationId,
  accounts,
  settings,
}) {
  if (!tenantId || !clientId || !integrationId) return;

  const db = useTenant(String(tenantId));
  const normalizedKind = normalizeKind(kind);

  if (normalizedKind === 'meta_ads') {
    const safeAccounts = Array.isArray(accounts) ? accounts : [];
    for (const account of safeAccounts) {
      const adAccountId = account?.adAccountId ? String(account.adAccountId) : null;
      if (!adAccountId) continue;
      await ensureDataSourceConnection(db, {
        brandId: clientId,
        source: 'META_ADS',
        integrationId,
        externalAccountId: adAccountId,
        displayName: account?.name ? String(account.name) : `Ad Account ${adAccountId}`,
        meta: {
          currency: account?.currency ? String(account.currency) : null,
          timezone: account?.timezone ? String(account.timezone) : null,
          accountStatus: account?.status ?? null,
        },
      });
    }

    const defaultAccountId = settings?.adAccountId || settings?.accountId || null;
    const defaultAccount =
      safeAccounts.find((account) => String(account?.adAccountId || '') === String(defaultAccountId)) ||
      safeAccounts.find((account) => account?.adAccountId) ||
      null;

    if (defaultAccount?.adAccountId) {
      const externalAccountId = String(defaultAccount.adAccountId);
      const externalAccountName =
        defaultAccount?.name ? String(defaultAccount.name) : `Ad Account ${externalAccountId}`;

      await ensureBrandSourceConnection(db, {
        brandId: clientId,
        platform: 'META_ADS',
        externalAccountId,
        externalAccountName,
      });

      // Sync async: evita atrasar o redirect do callback OAuth.
      syncAfterConnection({
        tenantId,
        brandId: clientId,
        platform: 'META_ADS',
        externalAccountId,
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[metaSocialService] syncAfterConnection(meta_ads) error', err?.message || err);
      });
    }

    return;
  }

  // Meta social (pages/instagram): garante DataSourceConnection para pages e IG Business.
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  for (const account of safeAccounts) {
    const pageId = account?.pageId ? String(account.pageId) : null;
    const pageName = account?.pageName ? String(account.pageName) : null;
    const igId = account?.igBusinessAccountId ? String(account.igBusinessAccountId) : null;
    const igUsername = account?.igUsername ? String(account.igUsername) : null;

    if (pageId) {
      await ensureDataSourceConnection(db, {
        brandId: clientId,
        source: 'META_SOCIAL',
        integrationId,
        externalAccountId: pageId,
        displayName: pageName || `Page ${pageId}`,
        meta: {
          pageId,
          pageName,
          igBusinessId: igId,
          igUsername,
        },
      });
    }

    if (igId) {
      await ensureDataSourceConnection(db, {
        brandId: clientId,
        source: 'META_SOCIAL',
        integrationId,
        externalAccountId: igId,
        displayName: igUsername ? `@${igUsername}` : `Instagram ${igId}`,
        meta: {
          pageId,
          pageName,
          igBusinessId: igId,
          igUsername,
        },
      });
    }
  }
}

function buildGraphGet(oauthVersion) {
  return async function graphGet(path, params = {}) {
    const url = new URL(`https://graph.facebook.com/${oauthVersion}/${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    const res = await fetch(url.toString());
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = json?.error?.message || 'Graph API error';
      const code = json?.error?.code || 'unknown';
      throw new Error(`Graph GET ${path} failed (${code}): ${msg}`);
    }

    return json;
  };
}

async function graphPost(path, params = {}) {
  const base = getGraphBaseUrl();
  const url = new URL(`${base}/${path}`);
  const body = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    body.set(key, String(value));
  });

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || 'Graph API error';
    const code = json?.error?.code || 'unknown';
    throw new Error(`Graph POST ${path} failed (${code}): ${msg}`);
  }

  return json;
}

async function graphDelete(path, params = {}) {
  const base = getGraphBaseUrl();
  const url = new URL(`${base}/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    url.searchParams.set(key, String(value));
  });

  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || 'Graph API error';
    const code = json?.error?.code || 'unknown';
    throw new Error(`Graph DELETE ${path} failed (${code}): ${msg}`);
  }
  return json;
}
async function waitForInstagramContainer(containerId, accessToken) {
  if (!containerId) return;
  const base = getGraphBaseUrl();
  const maxAttempts = Number(process.env.META_IG_CONTAINER_POLL_ATTEMPTS) || 30;
  const delayMs = Number(process.env.META_IG_CONTAINER_POLL_DELAY_MS) || 5000;
  let currentDelay = delayMs;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const url = new URL(`${base}/${containerId}`);
    url.searchParams.set('fields', 'status_code');
    url.searchParams.set('access_token', accessToken);

    const res = await fetch(url.toString());
    const json = await res.json().catch(() => ({}));
    const status = json?.status_code || null;
    if (status === 'FINISHED') return;
    if (status === 'ERROR') {
      throw new Error('Instagram container error');
    }

    await new Promise((resolve) => setTimeout(resolve, currentDelay));
    // backoff leve para vídeos maiores (sem estourar demais)
    currentDelay = Math.min(currentDelay + 1000, 10000);
  }

  throw new Error('Instagram container not ready');
}

function resolveInstagramMediaSpec(postKind, mediaType) {
  const kind = String(postKind || '').toLowerCase();
  const isVideo = String(mediaType || '').toLowerCase() === 'video';

  if (kind === 'reel') {
    if (!isVideo) {
      throw new Error('Reels exige video');
    }
    return { media_type: 'REELS', isVideo: true };
  }

  if (kind === 'story') {
    return { media_type: 'STORIES', isVideo };
  }

  if (isVideo) {
    return { media_type: 'VIDEO', isVideo: true };
  }

  return { media_type: null, isVideo: false };
}

async function publishInstagramPost({
  igBusinessId,
  accessToken,
  mediaUrl,
  caption,
  mediaType,
  postKind,
}) {
  if (!igBusinessId) throw new Error('Missing igBusinessId');
  if (!accessToken) throw new Error('Missing accessToken');
  if (!mediaUrl) throw new Error('Missing mediaUrl');

  const spec = resolveInstagramMediaSpec(postKind, mediaType);
  const payload = { access_token: accessToken };
  const shouldIncludeCaption = spec.media_type !== 'STORIES';
  if (shouldIncludeCaption && caption) payload.caption = caption;

  if (spec.isVideo) {
    payload.video_url = mediaUrl;
  } else {
    payload.image_url = mediaUrl;
  }

  if (spec.media_type) {
    payload.media_type = spec.media_type;
  }

  if (spec.media_type === 'REELS') {
    payload.share_to_feed = true;
  }

  const createResult = await graphPost(`${igBusinessId}/media`, payload);
  const creationId = createResult?.id;
  if (!creationId) {
    throw new Error('Instagram media container not created');
  }

  await waitForInstagramContainer(creationId, accessToken);

  const publishResult = await graphPost(`${igBusinessId}/media_publish`, {
    access_token: accessToken,
    creation_id: creationId,
  });

  return {
    externalId: publishResult?.id || publishResult?.media_id || creationId,
    raw: {
      create: createResult,
      publish: publishResult,
    },
  };
}

async function publishFacebookPost({ pageId, accessToken, mediaUrl, caption, mediaType }) {
  if (!pageId) throw new Error('Missing pageId');
  if (!accessToken) throw new Error('Missing accessToken');
  if (!mediaUrl) throw new Error('Missing mediaUrl');

  const isVideo = mediaType === 'video';
  const endpoint = isVideo ? `${pageId}/videos` : `${pageId}/photos`;
  const payload = {
    access_token: accessToken,
    caption: caption || undefined,
  };

  if (isVideo) {
    payload.file_url = mediaUrl;
    if (caption) payload.description = caption;
  } else {
    payload.url = mediaUrl;
  }

  const result = await graphPost(endpoint, payload);

  return {
    externalId: result?.post_id || result?.id || null,
    raw: result,
  };
}

function parseGrantedScopes(permsResp) {
  const data = Array.isArray(permsResp?.data) ? permsResp.data : [];
  return data
    .filter((item) => item?.status === 'granted' && item?.permission)
    .map((item) => String(item.permission));
}

function pickDefaultPage(accounts, kind) {
  if (!accounts.length) return null;
  if (kind === 'instagram_only') {
    return accounts.find((acc) => acc.igBusinessAccountId) || accounts[0];
  }
  return accounts.find((acc) => acc.igBusinessAccountId) || accounts[0];
}

async function resolvePageAccessToken(pageId, userAccessToken) {
  if (!pageId || !userAccessToken) return userAccessToken || null;
  const base = getGraphBaseUrl();
  const url = new URL(`${base}/${pageId}`);
  url.searchParams.set('fields', 'access_token');
  url.searchParams.set('access_token', userAccessToken);

  try {
    const res = await fetch(url.toString());
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.access_token) {
      return String(json.access_token);
    }
  } catch (_) {
    return userAccessToken;
  }

  return userAccessToken;
}

function normalizeUsername(value) {
  if (!value) return null;
  return String(value).trim().replace(/^@/, '') || null;
}

async function fetchInstagramBusinessDiscovery({
  accessToken,
  igBusinessId,
  username,
  limit = 12,
}) {
  if (!accessToken) throw new Error('Missing Meta access token');
  if (!igBusinessId) throw new Error('Missing igBusinessId');
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) throw new Error('Missing Instagram username');

  const base = getGraphBaseUrl();
  const fields = [
    `business_discovery.username(${normalizedUsername}){`,
    'followers_count,',
    'media_count,',
    `media.limit(${Number(limit) || 12}){like_count,comments_count,timestamp}`,
    '}',
  ].join('');

  const url = new URL(`${base}/${igBusinessId}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || 'Graph API error';
    const code = json?.error?.code || 'unknown';
    throw new Error(`Graph GET business_discovery failed (${code}): ${msg}`);
  }

  return json?.business_discovery || null;
}

module.exports = {
  normalizeKind,
  resolvePageAccessToken,
  fetchInstagramBusinessDiscovery,
  graphDelete,

  /**
   * Gera a URL de conexão OAuth do Meta
   */
  buildConnectUrl({ tenantId, clientId, kind }) {
    if (!tenantId) {
      throw new Error('tenantId is required to build Meta OAuth URL');
    }

    const appId = assertEnv('META_APP_ID');
    const redirectUri = resolveRedirectUri(kind);
    const oauthVersion = getOauthVersion();
    const normalizedKind = normalizeKind(kind);

    const nonce = crypto.randomBytes(16).toString('hex');
    const state = jwt.sign(
      {
        tenantId: String(tenantId),
        clientId: clientId ? String(clientId) : null,
        kind: normalizedKind,
        nonce,
        purpose: 'meta_oauth_state',
      },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    const scope = resolveScopes(normalizedKind).join(',');

    const url = new URL(`https://www.facebook.com/${oauthVersion}/dialog/oauth`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', scope);

    return url.toString();
  },

  /**
   * Processa o callback do OAuth do Meta
   */
  async handleCallback({ code, state }) {
    if (!code) throw new Error('Missing OAuth code');
    if (!state) throw new Error('Missing OAuth state');

    let payload;
    try {
      payload = jwt.verify(String(state), JWT_SECRET);
    } catch (err) {
      throw new Error('Invalid OAuth state');
    }

    if (!payload || payload.purpose !== 'meta_oauth_state') {
      throw new Error('Invalid OAuth state purpose');
    }

    const tenantId = payload.tenantId;
    if (!tenantId) {
      throw new Error('OAuth state missing tenantId');
    }

    const clientId = payload.clientId ? String(payload.clientId) : null;
    const kind = normalizeKind(payload.kind || 'meta_business');

    const appId = assertEnv('META_APP_ID');
    const appSecret = assertEnv('META_APP_SECRET');
    const redirectUri = resolveRedirectUri(kind);
    const oauthVersion = getOauthVersion();

    if (typeof fetch !== 'function') {
      throw new Error('Global fetch() not available in this Node runtime');
    }

    const graphGet = buildGraphGet(oauthVersion);

    const shortTokenResp = await graphGet('oauth/access_token', {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code: String(code),
    });

    const shortToken = shortTokenResp?.access_token;
    if (!shortToken) {
      throw new Error('Meta did not return short-lived access token');
    }

    const longTokenResp = await graphGet('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    });

    const longToken = longTokenResp?.access_token;
    const expiresIn = Number(longTokenResp?.expires_in || 0) || null;

    if (!longToken) {
      throw new Error('Meta did not return long-lived access token');
    }

    let grantedScopes = [];
    try {
      const permsResp = await graphGet('me/permissions', { access_token: longToken });
      grantedScopes = parseGrantedScopes(permsResp);
    } catch (_) {
      grantedScopes = [];
    }

    let metaUserId = null;
    try {
      const meResp = await graphGet('me', { access_token: longToken, fields: 'id,name' });
      metaUserId = meResp?.id ? String(meResp.id) : null;
    } catch (_) {
      metaUserId = null;
    }

    let accounts = [];
    let settings = { kind };
    let providerName = 'Meta (Facebook/Instagram)';
    const tokenToStore = longToken;
    const tokenSource = 'user';

    if (kind === 'meta_ads') {
      providerName = 'Meta Ads';
      const adResp = await graphGet('me/adaccounts', {
        access_token: longToken,
        fields: 'id,name,account_status,currency,timezone_name',
        limit: 200,
      });

      const adAccounts = Array.isArray(adResp?.data) ? adResp.data : [];
      accounts = adAccounts.map((acc) => ({
        adAccountId: acc?.id ? String(acc.id) : null,
        name: acc?.name ? String(acc.name) : null,
        currency: acc?.currency ? String(acc.currency) : null,
        timezone: acc?.timezone_name ? String(acc.timezone_name) : null,
        status: acc?.account_status ?? null,
      }));

      const defaultAccount = accounts.find((acc) => acc.adAccountId) || null;
      if (!defaultAccount?.adAccountId) {
        throw new Error('Nenhuma conta de anúncios encontrada');
      }

      settings = {
        kind,
        adAccountId: defaultAccount.adAccountId,
        accountId: defaultAccount.adAccountId,
        adAccountName: defaultAccount.name || null,
      };
    } else {
      const pagesResp = await graphGet('me/accounts', {
        access_token: longToken,
        fields: 'id,name,access_token,instagram_business_account{id,username}',
        limit: 200,
      });

      const pages = Array.isArray(pagesResp?.data) ? pagesResp.data : [];
      accounts = pages.map((page) => ({
        pageId: page?.id ? String(page.id) : null,
        pageName: page?.name ? String(page.name) : null,
        igBusinessAccountId: page?.instagram_business_account?.id
          ? String(page.instagram_business_account.id)
          : null,
        igUsername: page?.instagram_business_account?.username
          ? String(page.instagram_business_account.username)
          : null,
      }));

      const defaultPage = pickDefaultPage(accounts, kind);
      if (!defaultPage?.pageId) {
        throw new Error('Nenhuma página encontrada');
      }

      settings = {
        kind,
        pageId: defaultPage.pageId,
        pageName: defaultPage.pageName || null,
        igBusinessId: defaultPage.igBusinessAccountId || null,
        igUsername: defaultPage.igUsername || null,
      };

      if (kind === 'instagram_only' && !settings.igBusinessId) {
        throw new Error('Nenhuma conta Instagram Business conectada às páginas autorizadas');
      }
    }

    const encryptedToken = encrypt(String(tokenToStore));
    const now = new Date();
    const scopesToSave = grantedScopes.length ? grantedScopes : resolveScopes(kind);

    const config = {
      connectedAt: now.toISOString(),
      expiresIn,
      kind,
      tokenSource,
      accounts,
      metaUserId,
      scopes: scopesToSave,
    };

    const db = useTenant(String(tenantId));
    const ownerType = clientId ? 'CLIENT' : 'AGENCY';
    const ownerKey = buildOwnerKey(clientId, kind);

    const existing = await db.integration.findFirst({
      where: {
        provider: 'META',
        ownerType,
        ownerKey,
      },
      select: { id: true },
    });

    let persistedIntegrationId = null;

    if (existing?.id) {
      await db.integration.update({
        where: { id: existing.id },
        data: {
          status: 'CONNECTED',
          providerName,
          accessTokenEncrypted: encryptedToken,
          scopes: scopesToSave,
          settings,
          config,
          clientId: clientId || null,
          lastSyncedAt: now,
        },
      });
      persistedIntegrationId = existing.id;
    } else {
      const created = await db.integration.create({
        data: {
          provider: 'META',
          providerName,
          status: 'CONNECTED',
          ownerType,
          ownerKey,
          clientId: clientId || null,
          accessTokenEncrypted: encryptedToken,
          scopes: scopesToSave,
          settings,
          config,
          lastSyncedAt: now,
        },
      });
      persistedIntegrationId = created.id;
    }

    try {
      await ensureMetaConnectionsFromCallback({
        tenantId,
        clientId,
        kind,
        integrationId: persistedIntegrationId,
        accounts,
        settings,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[metaSocialService] ensureMetaConnectionsFromCallback warning',
        err?.message || err,
      );
    }

    return {
      tenantId,
      clientId,
      kind,
      accounts,
      expiresIn,
    };
  },

  publishInstagramPost,
  publishFacebookPost,
};
