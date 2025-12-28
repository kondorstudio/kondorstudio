const { prisma } = require('../prisma');
const { decrypt, encrypt } = require('../utils/crypto');

const REFRESH_THRESHOLD_DAYS = Number(process.env.META_TOKEN_REFRESH_THRESHOLD_DAYS) || 7;

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  console.log('[refreshMetaTokensJob]', ...args);
}

function resolveExpiresAt(config) {
  if (!config || typeof config !== 'object') return null;
  const expiresIn = Number(config.expiresIn || config.expires_in || 0);
  if (!expiresIn) return null;
  const base = config.tokenRefreshedAt || config.connectedAt || config.connected_at;
  if (!base) return null;
  const baseDate = new Date(base);
  if (Number.isNaN(baseDate.getTime())) return null;
  return new Date(baseDate.getTime() + expiresIn * 1000);
}

function shouldRefresh(expiresAt) {
  if (!expiresAt) return false;
  const now = new Date();
  const thresholdMs = REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  return expiresAt.getTime() - now.getTime() <= thresholdMs;
}

async function refreshToken(accessToken) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const oauthVersion = process.env.META_OAUTH_VERSION || 'v24.0';

  if (!appId || !appSecret) {
    throw new Error('META_APP_ID/META_APP_SECRET não configurados');
  }
  if (!accessToken) {
    throw new Error('Access token ausente para refresh');
  }

  const url = new URL(`https://graph.facebook.com/${oauthVersion}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', String(appId));
  url.searchParams.set('client_secret', String(appSecret));
  url.searchParams.set('fb_exchange_token', String(accessToken));

  const res = await fetch(url.toString());
  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json.access_token) {
    const msg = json?.error?.message || 'Meta refresh error';
    throw new Error(msg);
  }

  return {
    accessToken: json.access_token,
    expiresIn: Number(json.expires_in || 0) || null,
    tokenType: json.token_type || null,
  };
}

async function pollOnce() {
  const candidates = await prisma.integration.findMany({
    where: {
      provider: 'META',
      status: 'CONNECTED',
      accessTokenEncrypted: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      accessTokenEncrypted: true,
      config: true,
      settings: true,
    },
    take: 50,
  });

  if (!candidates.length) {
    return { ok: true, refreshed: 0 };
  }

  let refreshedCount = 0;

  for (const integration of candidates) {
    const config =
      integration.config && typeof integration.config === 'object' && !Array.isArray(integration.config)
        ? integration.config
        : {};
    const expiresAt = resolveExpiresAt(config);
    if (!shouldRefresh(expiresAt)) continue;

    let plainToken = null;
    try {
      plainToken = decrypt(integration.accessTokenEncrypted);
    } catch (err) {
      safeLog('Falha ao decrypt token', integration.id, err?.message || err);
      continue;
    }

    try {
      const refreshed = await refreshToken(plainToken);
      const now = new Date();
      const updatedConfig = {
        ...config,
        tokenRefreshedAt: now.toISOString(),
        expiresIn: refreshed.expiresIn || config.expiresIn || null,
      };

      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessTokenEncrypted: encrypt(String(refreshed.accessToken)),
          config: updatedConfig,
          lastSyncedAt: now,
        },
      });

      refreshedCount += 1;
    } catch (err) {
      safeLog('Erro ao refresh token', integration.id, err?.message || err);
    }
  }

  return { ok: true, refreshed: refreshedCount };
}

module.exports = {
  pollOnce,
};
