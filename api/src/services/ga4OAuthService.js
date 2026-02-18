const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { prisma, useTenant } = require('../prisma');
const googleClient = require('../lib/googleClient');
const { encrypt, decrypt } = require('../lib/crypto');
const connectionStateService = require('./connectionStateService');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_local_secret';
const STATE_PURPOSE = 'ga4_oauth_state';
const TOKEN_SKEW_MS = Number(process.env.GA4_TOKEN_SKEW_MS || 300000);
const REFRESH_LOCK_TTL_MS = Number(process.env.GA4_REFRESH_LOCK_TTL_MS || 10000);
const refreshLocks = new Map();
const GA4_CONNECTION_PROVIDER = 'GA4';
const GA4_CONNECTION_KEY = 'ga4_oauth';

async function syncGa4ConnectionState(payload = {}) {
  try {
    await connectionStateService.upsertConnectionState({
      provider: GA4_CONNECTION_PROVIDER,
      connectionKey: GA4_CONNECTION_KEY,
      ...payload,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[ga4OAuthService] failed to sync connection state', error?.message || error);
    }
  }
}

function mapGa4StatusToConnectionStatus(status) {
  const value = String(status || '').trim().toUpperCase();
  if (!value) return connectionStateService.STATUS.ERROR;
  if (value === 'CONNECTED') return connectionStateService.STATUS.CONNECTED;
  if (value === 'DISCONNECTED') return connectionStateService.STATUS.DISCONNECTED;
  if (value === 'NEEDS_RECONNECT' || value === 'REAUTH_REQUIRED') {
    return connectionStateService.STATUS.REAUTH_REQUIRED;
  }
  return connectionStateService.STATUS.ERROR;
}

function isMockMode() {
  return process.env.GA4_MOCK_MODE === 'true';
}

function withRefreshLock(tenantId, executor) {
  const key = String(tenantId || 'unknown');
  const now = Date.now();
  const existing = refreshLocks.get(key);
  if (existing && now - existing.startedAt < REFRESH_LOCK_TTL_MS) {
    return existing.promise;
  }

  const promise = (async () => executor())()
    .finally(() => {
      const current = refreshLocks.get(key);
      if (current && current.promise === promise) {
        refreshLocks.delete(key);
      }
    });

  refreshLocks.set(key, { startedAt: now, promise });
  return promise;
}

function buildState({ tenantId, userId }) {
  const nonce = crypto.randomBytes(16).toString('hex');
  return jwt.sign(
    { tenantId, userId, nonce, purpose: STATE_PURPOSE },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
}

function verifyState(state) {
  if (!state) {
    const err = new Error('OAuth state missing');
    err.status = 400;
    throw err;
  }
  let payload;
  try {
    payload = jwt.verify(state, JWT_SECRET);
  } catch (error) {
    const err = new Error('Invalid OAuth state');
    err.status = 400;
    throw err;
  }
  if (!payload || payload.purpose !== STATE_PURPOSE) {
    const err = new Error('Invalid OAuth state purpose');
    err.status = 400;
    throw err;
  }
  return payload;
}

function normalizeScope(scope) {
  const normalized = googleClient.normalizeScopes(scope);
  const scopes = googleClient.applyScopePolicy(normalized);
  return scopes.join(' ');
}

function buildReauthError() {
  const err = new Error('REAUTH_REQUIRED');
  err.status = 409;
  err.code = 'REAUTH_REQUIRED';
  return err;
}

function isReauthFailure(error) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  const dataError = String(error?.data?.error || '').toLowerCase();
  const dataDesc = String(error?.data?.error_description || '').toLowerCase();
  return (
    message.includes('invalid_grant') ||
    message.includes('revoked') ||
    dataError === 'invalid_grant' ||
    dataDesc.includes('invalid_grant') ||
    dataDesc.includes('revoked')
  );
}

function resolveExpiry(tokenResponse) {
  if (tokenResponse?.expiry_date) {
    return new Date(Number(tokenResponse.expiry_date));
  }
  if (tokenResponse?.expires_in) {
    return new Date(Date.now() + Number(tokenResponse.expires_in) * 1000);
  }
  return null;
}

async function ensureMockIntegration(tenantId, userId) {
  const db = useTenant(tenantId);
  const existing = await db.integrationGoogleGa4.findFirst({
    where: { tenantId: String(tenantId) },
  });

  if (existing && existing.status === 'CONNECTED') {
    await syncGa4ConnectionState({
      tenantId,
      connectionId: existing.id,
      status: connectionStateService.STATUS.CONNECTED,
      reasonCode: null,
      reasonMessage: null,
      nextAction: null,
      lastSuccessAt: new Date(),
    });
    return existing;
  }

  const data = {
    userId: String(userId),
    googleAccountEmail: null,
    accessToken: encrypt('mock_access_token'),
    refreshTokenEnc: encrypt('mock_refresh_token'),
    tokenExpiry: new Date(Date.now() + 3600 * 1000),
    scope: googleClient.getOAuthScopes().join(' '),
    status: 'CONNECTED',
    lastError: null,
  };

  if (existing) {
    const updated = await db.integrationGoogleGa4.update({
      where: { id: existing.id },
      data,
    });
    await syncGa4ConnectionState({
      tenantId,
      connectionId: updated.id,
      status: connectionStateService.STATUS.CONNECTED,
      reasonCode: null,
      reasonMessage: null,
      nextAction: null,
      lastSuccessAt: new Date(),
    });
    return updated;
  }

  const created = await db.integrationGoogleGa4.create({ data });
  await syncGa4ConnectionState({
    tenantId,
    connectionId: created.id,
    status: connectionStateService.STATUS.CONNECTED,
    reasonCode: null,
    reasonMessage: null,
    nextAction: null,
    lastSuccessAt: new Date(),
  });
  return created;
}

async function getIntegration(tenantId) {
  return prisma.integrationGoogleGa4.findUnique({
    where: {
      tenantId: String(tenantId),
    },
  });
}

async function markIntegrationError(tenantId, userId, message) {
  const existing = await getIntegration(tenantId);
  if (!existing) return null;
  const nextStatus =
    existing.status === 'CONNECTED'
      ? 'CONNECTED'
      : existing.status === 'NEEDS_RECONNECT'
      ? 'NEEDS_RECONNECT'
      : 'ERROR';
  const updated = await prisma.integrationGoogleGa4.update({
    where: { id: existing.id },
    data: { status: nextStatus, lastError: message || 'GA4 error' },
  });
  await syncGa4ConnectionState({
    tenantId,
    connectionId: updated.id,
    status: connectionStateService.STATUS.ERROR,
    reasonCode: 'GA4_ERROR',
    reasonMessage: message || 'GA4 error',
    nextAction: 'Check credentials and retry',
    lastErrorAt: new Date(),
  });
  return updated;
}

async function resetIntegration(
  tenantId,
  userId,
  message,
  { status = 'ERROR', clearTokens = true } = {}
) {
  const existing = await getIntegration(tenantId);
  if (!existing) return null;
  const updated = await prisma.integrationGoogleGa4.update({
    where: { id: existing.id },
    data: {
      status,
      lastError: message || 'GA4 error',
      accessToken: clearTokens ? null : existing.accessToken,
      refreshTokenEnc: clearTokens ? null : existing.refreshTokenEnc,
      tokenExpiry: clearTokens ? null : existing.tokenExpiry,
    },
  });
  await syncGa4ConnectionState({
    tenantId,
    connectionId: updated.id,
    status: mapGa4StatusToConnectionStatus(status),
    reasonCode: status === 'DISCONNECTED' ? 'MANUAL_DISCONNECT' : 'GA4_ERROR',
    reasonMessage: message || 'GA4 error',
    nextAction:
      status === 'NEEDS_RECONNECT' || status === 'REAUTH_REQUIRED'
        ? 'Reconnect GA4 account'
        : status === 'DISCONNECTED'
          ? null
          : 'Check credentials and retry',
    lastErrorAt:
      status === 'CONNECTED' || status === 'DISCONNECTED' ? null : new Date(),
    lastSuccessAt: status === 'CONNECTED' ? new Date() : undefined,
  });
  return updated;
}

async function markIntegrationNeedsReconnect(
  tenantId,
  userId,
  message,
  { clearTokens = true, clearRefreshToken = false } = {}
) {
  const existing = await getIntegration(tenantId);
  if (!existing) return null;
  const updated = await prisma.integrationGoogleGa4.update({
    where: { id: existing.id },
    data: {
      status: 'NEEDS_RECONNECT',
      lastError: message || 'REAUTH_REQUIRED',
      accessToken: clearTokens ? null : existing.accessToken,
      refreshTokenEnc: clearRefreshToken ? null : existing.refreshTokenEnc,
      tokenExpiry: clearTokens ? null : existing.tokenExpiry,
    },
  });
  await syncGa4ConnectionState({
    tenantId,
    connectionId: updated.id,
    status: connectionStateService.STATUS.REAUTH_REQUIRED,
    reasonCode: 'REAUTH_REQUIRED',
    reasonMessage: message || 'REAUTH_REQUIRED',
    nextAction: 'Reconnect GA4 account',
    lastErrorAt: new Date(),
  });
  return updated;
}

async function upsertIntegration({
  tenantId,
  userId,
  accessToken,
  refreshTokenEnc,
  tokenExpiry,
  scope,
  googleAccountEmail,
}) {
  const db = useTenant(tenantId);
  const existing = await db.integrationGoogleGa4.findFirst({
    where: { tenantId: String(tenantId) },
  });

  const data = {
    userId: String(userId),
    googleAccountEmail: googleAccountEmail || null,
    accessToken: accessToken || null,
    refreshTokenEnc: refreshTokenEnc || null,
    tokenExpiry,
    scope: scope || '',
    status: 'CONNECTED',
    lastError: null,
  };

  if (existing) {
    const updated = await db.integrationGoogleGa4.update({
      where: { id: existing.id },
      data,
    });
    await syncGa4ConnectionState({
      tenantId,
      connectionId: updated.id,
      status: connectionStateService.STATUS.CONNECTED,
      reasonCode: null,
      reasonMessage: null,
      nextAction: null,
      lastSuccessAt: new Date(),
    });
    return updated;
  }

  const created = await db.integrationGoogleGa4.create({ data });
  await syncGa4ConnectionState({
    tenantId,
    connectionId: created.id,
    status: connectionStateService.STATUS.CONNECTED,
    reasonCode: null,
    reasonMessage: null,
    nextAction: null,
    lastSuccessAt: new Date(),
  });
  return created;
}

async function exchangeCode({ code, state }) {
  if (isMockMode()) {
    const payload = verifyState(state);
    return ensureMockIntegration(payload.tenantId, payload.userId);
  }

  const payload = verifyState(state);
  const tokenResponse = await googleClient.exchangeCodeForTokens(code);
  const scope = normalizeScope(
    tokenResponse.scope || googleClient.getOAuthScopes()
  );
  const tokenExpiry = resolveExpiry(tokenResponse);

  let accessTokenEnc = null;
  if (tokenResponse.access_token) {
    accessTokenEnc = encrypt(String(tokenResponse.access_token));
  }

  const existing = await getIntegration(payload.tenantId);
  let refreshTokenEnc = null;
  if (tokenResponse.refresh_token) {
    refreshTokenEnc = encrypt(String(tokenResponse.refresh_token));
  } else if (existing?.refreshTokenEnc) {
    refreshTokenEnc = existing.refreshTokenEnc;
  }

  if (!refreshTokenEnc) {
    await markIntegrationNeedsReconnect(
      payload.tenantId,
      payload.userId,
      'Missing refresh token',
      { clearTokens: true, clearRefreshToken: false }
    );
    const err = new Error('Refresh token missing. Reconnect with prompt=consent.');
    err.status = 400;
    err.code = 'GA4_REFRESH_TOKEN_MISSING';
    throw err;
  }

  return upsertIntegration({
    tenantId: payload.tenantId,
    userId: payload.userId,
    accessToken: accessTokenEnc,
    refreshTokenEnc,
    tokenExpiry,
    scope,
    googleAccountEmail: existing?.googleAccountEmail || null,
  });
}

async function getValidAccessToken({ tenantId, userId }) {
  if (isMockMode()) {
    return 'mock_access_token';
  }

  const integration = await getIntegration(tenantId);
  if (!integration) {
    const err = new Error('GA4 integration not connected');
    err.status = 400;
    err.code = 'GA4_NOT_CONNECTED';
    throw err;
  }
  if (integration.status === 'NEEDS_RECONNECT') {
    throw buildReauthError();
  }
  if (integration.status !== 'CONNECTED') {
    const err = new Error('GA4 integration not connected');
    err.status = 400;
    err.code = 'GA4_NOT_CONNECTED';
    throw err;
  }

  const now = Date.now();
  if (integration.accessToken && integration.tokenExpiry) {
    if (new Date(integration.tokenExpiry).getTime() - TOKEN_SKEW_MS > now) {
      try {
        return decrypt(integration.accessToken);
      } catch (error) {
        await markIntegrationNeedsReconnect(
          tenantId,
          userId,
          'Access token decrypt failed. Reconnect GA4.',
          { clearTokens: true, clearRefreshToken: false }
        );
        throw buildReauthError();
      }
    }
  }

  if (!integration.refreshTokenEnc) {
    await markIntegrationNeedsReconnect(
      tenantId,
      userId,
      'Missing refresh token',
      { clearTokens: true, clearRefreshToken: false }
    );
    throw buildReauthError();
  }

  let refreshToken;
  try {
    refreshToken = decrypt(integration.refreshTokenEnc);
  } catch (error) {
    await markIntegrationNeedsReconnect(
      tenantId,
      userId,
      'Refresh token decrypt failed. Reconnect GA4.',
      { clearTokens: true, clearRefreshToken: true }
    );
    throw buildReauthError();
  }

  return withRefreshLock(tenantId, async () => {
    let tokenResponse;
    try {
      tokenResponse = await googleClient.refreshAccessToken(refreshToken);
    } catch (error) {
      if (isReauthFailure(error)) {
        await markIntegrationNeedsReconnect(
          tenantId,
          userId,
          'REAUTH_REQUIRED',
          { clearTokens: true, clearRefreshToken: true }
        );
        throw buildReauthError();
      }
      await markIntegrationError(tenantId, userId, 'OAuth refresh failed. Reconnect GA4.');
      const err = new Error('OAuth refresh failed. Reconnect GA4.');
      err.status = error?.status || 400;
      err.code = 'GA4_REAUTH_REQUIRED';
      throw err;
    }
    if (!tokenResponse.access_token) {
      await markIntegrationError(tenantId, userId, 'OAuth refresh failed. Reconnect GA4.');
      const err = new Error('OAuth refresh failed. Reconnect GA4.');
      err.status = 400;
      err.code = 'GA4_REAUTH_REQUIRED';
      throw err;
    }

    const accessTokenEnc = encrypt(String(tokenResponse.access_token));
    const tokenExpiry = resolveExpiry(tokenResponse);

    const updated = await prisma.integrationGoogleGa4.update({
      where: { id: integration.id },
      data: {
        accessToken: accessTokenEnc,
        tokenExpiry,
        status: 'CONNECTED',
        lastError: null,
      },
    });
    await syncGa4ConnectionState({
      tenantId,
      connectionId: updated.id,
      status: connectionStateService.STATUS.CONNECTED,
      reasonCode: null,
      reasonMessage: null,
      nextAction: null,
      lastSuccessAt: new Date(),
    });

    return tokenResponse.access_token;
  });
}

async function disconnect({ tenantId, userId, clearTokens = true }) {
  const integration = await getIntegration(tenantId);
  if (!integration) return null;

  const updated = await prisma.integrationGoogleGa4.update({
    where: { id: integration.id },
    data: {
      status: 'DISCONNECTED',
      lastError: null,
      accessToken: clearTokens ? null : integration.accessToken,
      refreshTokenEnc: clearTokens ? null : integration.refreshTokenEnc,
      tokenExpiry: clearTokens ? null : integration.tokenExpiry,
    },
  });
  await syncGa4ConnectionState({
    tenantId,
    connectionId: updated.id,
    status: connectionStateService.STATUS.DISCONNECTED,
    reasonCode: 'MANUAL_DISCONNECT',
    reasonMessage: null,
    nextAction: null,
    lastErrorAt: null,
  });
  return updated;
}

module.exports = {
  buildState,
  verifyState,
  exchangeCode,
  getValidAccessToken,
  getIntegration,
  disconnect,
  ensureMockIntegration,
  isMockMode,
  markIntegrationError,
  resetIntegration,
};
