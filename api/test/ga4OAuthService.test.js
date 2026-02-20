process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64');
delete process.env.CRYPTO_KEY;
process.env.JWT_SECRET = 'test_secret';

const test = require('node:test');
const assert = require('node:assert/strict');

function mockModule(path, exports) {
  const resolved = require.resolve(path);
  require.cache[resolved] = { exports };
}

function resetModule(path) {
  const resolved = require.resolve(path);
  delete require.cache[resolved];
}

test.afterEach(() => {
  [
    '../src/prisma',
    '../src/lib/googleClient',
    '../src/services/ga4OAuthService',
  ].forEach((path) => {
    try {
      resetModule(path);
    } catch (_) {}
  });
});

function loadService({
  tokenResponse,
  existingIntegration,
  refreshTokenResponse,
  refreshTokenError,
}) {
  const calls = {
    updates: [],
  };
  let currentIntegration = existingIntegration ? { ...existingIntegration } : null;

  mockModule('../src/prisma', {
    prisma: {
      integrationGoogleGa4: {
        findUnique: async () => currentIntegration || null,
        findFirst: async () => currentIntegration || null,
        update: async (args) => {
          calls.updates.push(args);
          currentIntegration = {
            ...(currentIntegration || {}),
            ...args.data,
            id: currentIntegration?.id || 'id',
            tenantId: currentIntegration?.tenantId || 't1',
            userId: currentIntegration?.userId || 'u1',
          };
          return currentIntegration;
        },
      },
    },
    useTenant: () => ({
      integrationGoogleGa4: {
        findFirst: async () => currentIntegration || null,
        update: async (args) => {
          calls.updates.push(args);
          currentIntegration = {
            ...(currentIntegration || {}),
            ...args.data,
            id: currentIntegration?.id || 'id',
            tenantId: currentIntegration?.tenantId || 't1',
            userId: currentIntegration?.userId || 'u1',
          };
          return currentIntegration;
        },
        create: async (args) => {
          currentIntegration = { id: 'new', ...(args?.data || {}) };
          return currentIntegration;
        },
      },
    }),
  });

  mockModule('../src/lib/googleClient', {
    exchangeCodeForTokens: async () => tokenResponse,
    refreshAccessToken: async () => {
      if (refreshTokenError) throw refreshTokenError;
      return refreshTokenResponse || { access_token: 'token', expires_in: 3600 };
    },
    buildAuthUrl: () => 'http://example.com',
    normalizeScopes: (scope) => {
      if (!scope) return [];
      if (Array.isArray(scope)) return scope;
      return String(scope).split(/\s+/).filter(Boolean);
    },
    applyScopePolicy: (scopes) => scopes || [],
    getOAuthScopes: () => ['https://www.googleapis.com/auth/analytics.readonly'],
  });

  resetModule('../src/services/ga4OAuthService');
  return {
    service: require('../src/services/ga4OAuthService'),
    calls,
  };
}

test('exchangeCode fails when refresh_token missing and no stored token', async () => {
  const { service } = loadService({
    tokenResponse: {
      access_token: 'access',
      expires_in: 3600,
      scope: 'scope',
    },
    existingIntegration: null,
  });

  const state = service.buildState({ tenantId: 't1', userId: 'u1' });

  await assert.rejects(
    () => service.exchangeCode({ code: 'abc', state }),
    (err) => {
      assert.equal(err.code, 'GA4_REFRESH_TOKEN_MISSING');
      return true;
    }
  );
});

test('getValidAccessToken marks NEEDS_RECONNECT on access token decrypt failure', async () => {
  const { service, calls } = loadService({
    tokenResponse: null,
    existingIntegration: {
      id: 'ga4-1',
      tenantId: 't1',
      userId: 'u1',
      status: 'CONNECTED',
      accessToken: 'invalid-base64',
      refreshTokenEnc: 'still-invalid',
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  await assert.rejects(
    () => service.getValidAccessToken({ tenantId: 't1', userId: 'u1' }),
    (err) => {
      assert.equal(err.code, 'REAUTH_REQUIRED');
      assert.equal(err.status, 409);
      return true;
    },
  );

  const reconnectUpdate = calls.updates.find(
    (entry) =>
      entry?.data?.status === 'NEEDS_RECONNECT' &&
      String(entry?.data?.lastError || '').includes('Access token decrypt failed'),
  );
  assert.ok(reconnectUpdate, 'expected update that marks integration as NEEDS_RECONNECT');
});
