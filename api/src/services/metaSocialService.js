// api/src/services/metaSocialService.js
// Serviço responsável pela integração Meta Social
// (Facebook Pages + Instagram Graph API)

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { encrypt } = require('../utils/crypto');
const { useTenant } = require('../prisma');

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

async function waitForInstagramContainer(containerId, accessToken) {
  if (!containerId) return;
  const base = getGraphBaseUrl();
  const maxAttempts = Number(process.env.META_IG_CONTAINER_POLL_ATTEMPTS) || 6;
  const delayMs = Number(process.env.META_IG_CONTAINER_POLL_DELAY_MS) || 4000;

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

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function publishInstagramPost({ igBusinessId, accessToken, mediaUrl, caption, mediaType }) {
  if (!igBusinessId) throw new Error('Missing igBusinessId');
  if (!accessToken) throw new Error('Missing accessToken');
  if (!mediaUrl) throw new Error('Missing mediaUrl');

  const payload = {
    access_token: accessToken,
    caption: caption || undefined,
  };

  if (mediaType === 'video') {
    payload.media_type = 'VIDEO';
    payload.video_url = mediaUrl;
  } else {
    payload.image_url = mediaUrl;
  }

  const createResult = await graphPost(`${igBusinessId}/media`, payload);
  const creationId = createResult?.id;
  if (!creationId) {
    throw new Error('Instagram media container not created');
  }

  if (mediaType === 'video') {
    await waitForInstagramContainer(creationId, accessToken);
  }

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

module.exports = {
  /**
   * Gera a URL de conexão OAuth do Meta
   */
  buildConnectUrl({ tenantId }) {
    if (!tenantId) {
      throw new Error('tenantId is required to build Meta OAuth URL');
    }

    const appId = assertEnv('META_APP_ID');
    const redirectUri = assertEnv('META_SOCIAL_REDIRECT_URI');
    const oauthVersion = getOauthVersion();

    const nonce = crypto.randomBytes(16).toString('hex');
    const state = jwt.sign(
      {
        tenantId: String(tenantId),
        nonce,
        purpose: 'meta_social_oauth_state',
      },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    const scope = [
      'public_profile',
      'email',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
    ].join(',');

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

    // 1) Validar state (JWT + purpose + tenantId)
    let payload;
    try {
      payload = jwt.verify(String(state), JWT_SECRET);
    } catch (err) {
      throw new Error('Invalid OAuth state');
    }

    if (!payload || payload.purpose !== 'meta_social_oauth_state') {
      throw new Error('Invalid OAuth state purpose');
    }

    const tenantId = payload.tenantId;
    if (!tenantId) {
      throw new Error('OAuth state missing tenantId');
    }

    // 2) Env obrigatórias
    const appId = assertEnv('META_APP_ID');
    const appSecret = assertEnv('META_APP_SECRET');
    const redirectUri = assertEnv('META_SOCIAL_REDIRECT_URI');
    const oauthVersion = getOauthVersion();

    if (typeof fetch !== 'function') {
      throw new Error('Global fetch() not available in this Node runtime');
    }

    const graphGet = buildGraphGet(oauthVersion);

    // 3) code → short-lived token
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

    // 4) short → long-lived token
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

    // 5) Buscar Pages
    const pagesResp = await graphGet('me/accounts', {
      access_token: longToken,
      fields: 'id,name',
      limit: 200,
    });

    const pages = Array.isArray(pagesResp?.data) ? pagesResp.data : [];

    // 6) Para cada Page, buscar Instagram Business conectado
    const accounts = [];

    for (const page of pages) {
      const pageId = page?.id ? String(page.id) : null;
      const pageName = page?.name ? String(page.name) : null;
      if (!pageId) continue;

      let igBusinessAccountId = null;
      let igUsername = null;

      try {
        const pageInfo = await graphGet(pageId, {
          access_token: longToken,
          fields: 'instagram_business_account{id,username}',
        });

        const ig = pageInfo?.instagram_business_account;
        if (ig?.id) igBusinessAccountId = String(ig.id);
        if (ig?.username) igUsername = String(ig.username);
      } catch (_) {
        // não falha a integração inteira por erro numa page
      }

      accounts.push({
        pageId,
        pageName,
        igBusinessAccountId,
        igUsername,
      });
    }

    // 7) Persistir integração no banco (multi-tenant)
    const db = useTenant(String(tenantId));
    const now = new Date();

    const encryptedToken = encrypt(String(longToken));

    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
    ];

    const config = {
      connectedAt: now.toISOString(),
      expiresIn,
      accounts,
    };

    const existing = await db.integration.findFirst({
      where: {
        provider: 'META',
        ownerType: 'AGENCY',
        ownerKey: 'AGENCY',
      },
      select: { id: true },
    });

    if (existing?.id) {
      await db.integration.update({
        where: { id: existing.id },
        data: {
          status: 'CONNECTED',
          providerName: 'Meta (Facebook/Instagram)',
          accessTokenEncrypted: encryptedToken,
          scopes,
          config,
          lastSyncedAt: now,
        },
      });
    } else {
      await db.integration.create({
        data: {
          provider: 'META',
          providerName: 'Meta (Facebook/Instagram)',
          status: 'CONNECTED',
          ownerType: 'AGENCY',
          ownerKey: 'AGENCY',
          accessTokenEncrypted: encryptedToken,
          scopes,
          config,
          lastSyncedAt: now,
        },
      });
    }

    return {
      tenantId,
      accounts,
      expiresIn,
    };
  },

  publishInstagramPost,
  publishFacebookPost,
};
