const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { prisma, useTenant } = require('../prisma');
const googleClient = require('../lib/googleClient');
const { encrypt, decrypt } = require('../lib/crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_local_secret';
const STATE_PURPOSE = 'ga4_oauth_state';
const TOKEN_SKEW_MS = Number(process.env.GA4_TOKEN_SKEW_MS || 300000);

function isMockMode() {
  return process.env.GA4_MOCK_MODE === 'true';
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
  if (!scope) return '';
  if (Array.isArray(scope)) return scope.join(' ');
  return String(scope);
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
    where: { tenantId: String(tenantId), userId: String(userId) },
  });

  if (existing && existing.status === 'CONNECTED') return existing;

  const data = {
    userId: String(userId),
    googleAccountEmail: null,
    accessToken: encrypt('mock_access_token'),
    refreshTokenEnc: encrypt('mock_refresh_token'),
    tokenExpiry: new Date(Date.now() + 3600 * 1000),
    scope:
      process.env.GOOGLE_OAUTH_SCOPES ||
      'https://www.googleapis.com/auth/analytics.readonly',
    status: 'CONNECTED',
    lastError: null,
  };

  if (existing) {
    return db.integrationGoogleGa4.update({
      where: { id: existing.id },
      data,
    });
  }

  return db.integrationGoogleGa4.create({ data });
}

async function getIntegration(tenantId, userId) {
  return prisma.integrationGoogleGa4.findFirst({
    where: {
      tenantId: String(tenantId),
      userId: String(userId),
    },
  });
}

async function markIntegrationError(tenantId, userId, message) {
  const existing = await getIntegration(tenantId, userId);
  if (!existing) return null;
  const nextStatus = existing.status === 'CONNECTED' ? 'CONNECTED' : 'ERROR';
  return prisma.integrationGoogleGa4.update({
    where: { id: existing.id },
    data: { status: nextStatus, lastError: message || 'GA4 error' },
  });
}

async function resetIntegration(
  tenantId,
  userId,
  message,
  { status = 'ERROR', clearTokens = true } = {}
) {
  const existing = await getIntegration(tenantId, userId);
  if (!existing) return null;
  return prisma.integrationGoogleGa4.update({
    where: { id: existing.id },
    data: {
      status,
      lastError: message || 'GA4 error',
      accessToken: clearTokens ? null : existing.accessToken,
      refreshTokenEnc: clearTokens ? null : existing.refreshTokenEnc,
      tokenExpiry: clearTokens ? null : existing.tokenExpiry,
    },
  });
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
    where: { tenantId: String(tenantId), userId: String(userId) },
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
    return db.integrationGoogleGa4.update({
      where: { id: existing.id },
      data,
    });
  }

  return db.integrationGoogleGa4.create({ data });
}

async function exchangeCode({ code, state }) {
  if (isMockMode()) {
    const payload = verifyState(state);
    return ensureMockIntegration(payload.tenantId, payload.userId);
  }

  const payload = verifyState(state);
  const tokenResponse = await googleClient.exchangeCodeForTokens(code);
  const scope = normalizeScope(tokenResponse.scope || process.env.GOOGLE_OAUTH_SCOPES);
  const tokenExpiry = resolveExpiry(tokenResponse);

  let accessTokenEnc = null;
  if (tokenResponse.access_token) {
    accessTokenEnc = encrypt(String(tokenResponse.access_token));
  }

  const existing = await getIntegration(payload.tenantId, payload.userId);
  let refreshTokenEnc = null;
  if (tokenResponse.refresh_token) {
    refreshTokenEnc = encrypt(String(tokenResponse.refresh_token));
  } else if (existing?.refreshTokenEnc) {
    refreshTokenEnc = existing.refreshTokenEnc;
  }

  if (!refreshTokenEnc) {
    await resetIntegration(payload.tenantId, payload.userId, 'Missing refresh token');
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

  const integration = await getIntegration(tenantId, userId);
  if (!integration || integration.status !== 'CONNECTED') {
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
        await markIntegrationError(
          tenantId,
          userId,
          'Access token decrypt failed. Reconnect GA4.'
        );
        const err = new Error('Access token invalido. Reconecte o GA4.');
        err.status = 400;
        err.code = 'GA4_REAUTH_REQUIRED';
        throw err;
      }
    }
  }

  if (!integration.refreshTokenEnc) {
    await markIntegrationError(tenantId, userId, 'Missing refresh token');
    const err = new Error('Refresh token missing. Reconnect GA4.');
    err.status = 400;
    err.code = 'GA4_REAUTH_REQUIRED';
    throw err;
  }

  let refreshToken;
  try {
    refreshToken = decrypt(integration.refreshTokenEnc);
  } catch (error) {
    await markIntegrationError(
      tenantId,
      userId,
      'Refresh token decrypt failed. Reconnect GA4.'
    );
    const err = new Error('Refresh token invalido. Reconecte o GA4.');
    err.status = 400;
    err.code = 'GA4_REAUTH_REQUIRED';
    throw err;
  }

  const tokenResponse = await googleClient.refreshAccessToken(refreshToken);
  if (!tokenResponse.access_token) {
    await markIntegrationError(tenantId, userId, 'OAuth refresh failed. Reconnect GA4.');
    const err = new Error('OAuth refresh failed. Reconnect GA4.');
    err.status = 400;
    err.code = 'GA4_REAUTH_REQUIRED';
    throw err;
  }

  const accessTokenEnc = encrypt(String(tokenResponse.access_token));
  const tokenExpiry = resolveExpiry(tokenResponse);

  await prisma.integrationGoogleGa4.update({
    where: { id: integration.id },
    data: {
      accessToken: accessTokenEnc,
      tokenExpiry,
      status: 'CONNECTED',
      lastError: null,
    },
  });

  return tokenResponse.access_token;
}

async function disconnect({ tenantId, userId, clearTokens = true }) {
  const integration = await getIntegration(tenantId, userId);
  if (!integration) return null;

  return prisma.integrationGoogleGa4.update({
    where: { id: integration.id },
    data: {
      status: 'DISCONNECTED',
      lastError: null,
      accessToken: clearTokens ? null : integration.accessToken,
      refreshTokenEnc: clearTokens ? null : integration.refreshTokenEnc,
      tokenExpiry: clearTokens ? null : integration.tokenExpiry,
    },
  });
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
