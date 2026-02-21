process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

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
    '../src/middleware/auth',
    '../src/middleware/tenantGuard',
    '../src/prisma',
    '../src/services/ga4AdminService',
    '../src/services/ga4OAuthService',
    '../src/services/ga4PropertyScopeService',
    '../src/services/brandGa4SettingsService',
    '../src/lib/googleClient',
    '../src/services/ga4DataService',
    '../src/services/connectionStateService',
    '../src/controllers/integrationsGa4Controller',
    '../src/routes/integrationsGa4',
    '../src/routes/integrationsGa4Public',
    '../src/routes/analyticsDashboards',
  ].forEach((path) => {
    try {
      resetModule(path);
    } catch (_) {}
  });
});

function buildApp({
  syncPropertiesError = null,
  statusIntegration = null,
  connectionState = null,
  oauthStatePayload = null,
  propertiesSelectScopeResult = null,
} = {}) {
  const tracker = {
    buildAuthUrlArgs: null,
    buildStateArgs: null,
    requiredRoleSets: [],
  };
  const auth = (req, _res, next) => {
    req.user = { id: 'user-1', role: 'OWNER' };
    req.tenantId = 'tenant-1';
    next();
  };
  auth.requireRole = (...roles) => {
    tracker.requiredRoleSets.push(roles);
    return (_req, _res, next) => next();
  };
  mockModule('../src/middleware/auth', auth);

  mockModule('../src/middleware/tenantGuard', (req, _res, next) => {
    req.db = {
      integrationGoogleGa4: {
        findFirst: async () => statusIntegration,
        findMany: async () => (statusIntegration ? [statusIntegration] : []),
        updateMany: async () => ({ count: statusIntegration ? 1 : 0 }),
      },
      integrationGoogleGa4Property: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
    };
    next();
  });

  mockModule('../src/prisma', {
    prisma: {
      client: {
        count: async ({ where }) => {
          const ids = Array.isArray(where?.id?.in) ? where.id.in : [];
          return ids.length;
        },
        findFirst: async ({ where }) => {
          if (!where?.id || !where?.tenantId) return null;
          return { id: String(where.id), tenantId: String(where.tenantId) };
        },
      },
      brandGa4Settings: {
        count: async () => 0,
      },
      integrationGoogleGa4: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
    },
    useTenant: () => ({
      integrationGoogleGa4: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
      integrationGoogleGa4Property: {
        updateMany: async () => ({ count: 0 }),
      },
    }),
  });

  mockModule('../src/services/ga4AdminService', {
    syncProperties: async () => {
      if (syncPropertiesError) throw syncPropertiesError;
      return [
        {
          id: 'prop-1',
          propertyId: '123456789',
          displayName: 'Demo Property',
          isSelected: true,
        },
      ];
    },
    listProperties: async () => [],
    selectProperty: async ({ propertyId }) => ({
      id: 'prop-1',
      propertyId: String(propertyId || '123456789'),
      displayName: 'Demo Property',
      isSelected: true,
    }),
    getSelectedProperty: async () => ({ propertyId: '123456789' }),
  });

  mockModule('../src/services/ga4OAuthService', {
    isMockMode: () => false,
    buildState: (args) => {
      tracker.buildStateArgs = args;
      return 'state';
    },
    verifyState: () =>
      oauthStatePayload || {
        tenantId: 'tenant-1',
        userId: 'user-1',
      },
    getIntegration: async () => null,
    ensureMockIntegration: async () => ({}),
    exchangeCode: async () => ({}),
    disconnect: async () => ({}),
  });

  mockModule('../src/services/ga4PropertyScopeService', {
    APPLY_MODE: {
      LEGACY_INTEGRATION_ONLY: 'LEGACY_INTEGRATION_ONLY',
      SINGLE_BRAND: 'SINGLE_BRAND',
      ALL_BRANDS: 'ALL_BRANDS',
    },
    applyPropertyScopeSelection: async () =>
      propertiesSelectScopeResult || {
        scopeApplied: 'LEGACY_INTEGRATION_ONLY',
        affectedBrandsTotal: 0,
        affectedBrandsSucceeded: 0,
        affectedBrandsFailed: 0,
        failures: [],
        syncQueuedTotal: 0,
        syncSkippedTotal: 0,
      },
  });

  mockModule('../src/services/brandGa4SettingsService', {
    resolveBrandGa4ActivePropertyId: async ({ brandId }) =>
      brandId ? '383714125' : null,
    upsertBrandGa4Settings: async (_payload) => ({
      propertyId: '383714125',
      timezone: 'UTC',
      leadEvents: [],
      conversionEvents: [],
      revenueEvent: null,
      lastHistoricalSyncAt: null,
      lastSuccessAt: null,
      lastError: null,
      backfillCursor: null,
      updatedAt: new Date().toISOString(),
    }),
    setBrandGa4ActiveProperty: async ({ propertyId }) =>
      String(propertyId || '383714125'),
  });

  mockModule('../src/lib/googleClient', {
    buildAuthUrl: (args) => {
      tracker.buildAuthUrlArgs = args;
      return 'http://example.com/oauth';
    },
  });

  mockModule('../src/services/ga4DataService', {
    runReport: async () => ({
      dimensionHeaders: [],
      metricHeaders: [],
      rows: [],
      totals: [],
      quota: null,
    }),
  });

  mockModule('../src/services/connectionStateService', {
    STATUS: {
      CONNECTED: 'CONNECTED',
      DISCONNECTED: 'DISCONNECTED',
      ERROR: 'ERROR',
      REAUTH_REQUIRED: 'REAUTH_REQUIRED',
    },
    getConnectionState: async () => connectionState,
    upsertConnectionState: async () => null,
  });

  resetModule('../src/controllers/integrationsGa4Controller');
  resetModule('../src/routes/integrationsGa4');
  resetModule('../src/routes/integrationsGa4Public');
  resetModule('../src/routes/analyticsDashboards');

  const integrationsRouter = require('../src/routes/integrationsGa4');
  const integrationsPublicRouter = require('../src/routes/integrationsGa4Public');
  const analyticsRouter = require('../src/routes/analyticsDashboards');

  const app = express();
  app.use(express.json());
  app.use('/api/integrations/ga4', integrationsPublicRouter);
  app.use('/api/integrations/ga4', integrationsRouter);
  app.use('/api/analytics', analyticsRouter);
  return { app, tracker };
}

test('GET /integrations/ga4/oauth/start returns url', async () => {
  const { app, tracker } = buildApp();
  const res = await request(app).get('/api/integrations/ga4/oauth/start');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.url, 'http://example.com/oauth');
  assert.equal(Boolean(tracker.buildAuthUrlArgs?.forceConsent), true);
});

test('integrations ga4 router allows MEMBER to update brand settings', async () => {
  const { tracker } = buildApp();
  const hasMemberRoleSet = tracker.requiredRoleSets.some((roles) =>
    roles.includes('MEMBER'),
  );
  assert.equal(hasMemberRoleSet, true);
});

test('GET /integrations/ga4/oauth/start forwards brand/client context into oauth state', async () => {
  const { app, tracker } = buildApp();
  const brandId = 'a5a5a5a5-a5a5-45a5-95a5-a5a5a5a5a5a5';
  const res = await request(app)
    .get(`/api/integrations/ga4/oauth/start?clientId=${brandId}&brandId=${brandId}`);
  assert.equal(res.statusCode, 200);
  assert.equal(String(tracker.buildStateArgs?.clientId || ''), brandId);
  assert.equal(String(tracker.buildStateArgs?.brandId || ''), brandId);
});

test('GET /integrations/ga4/properties/sync returns properties', async () => {
  const { app } = buildApp();
  const res = await request(app).get('/api/integrations/ga4/properties/sync');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items.length, 1);
});

test('POST /analytics/ga4/run-report returns data', async () => {
  const { app } = buildApp();
  const res = await request(app)
    .post('/api/analytics/ga4/run-report')
    .send({ propertyId: '123456789', metrics: ['sessions'] });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body);
});

test('GET /integrations/ga4/oauth/callback redirects with connected=0 on reauth sync failure', async () => {
  const syncError = Object.assign(new Error('REAUTH_REQUIRED'), {
    code: 'REAUTH_REQUIRED',
    status: 409,
  });
  const { app } = buildApp({ syncPropertiesError: syncError });
  const res = await request(app).get('/api/integrations/ga4/oauth/callback?code=abc&state=state');
  assert.equal(res.statusCode, 302);
  assert.match(String(res.headers.location || ''), /connected=0/);
  assert.match(String(res.headers.location || ''), /error=REAUTH_REQUIRED/);
});

test('GET /integrations/ga4/oauth/callback preserves clientId on success redirect', async () => {
  const clientId = '8f8f8f8f-8f8f-48f8-98f8-8f8f8f8f8f8f';
  const { app } = buildApp({
    oauthStatePayload: {
      tenantId: 'tenant-1',
      userId: 'user-1',
      clientId,
    },
  });
  const res = await request(app).get('/api/integrations/ga4/oauth/callback?code=abc&state=state');
  assert.equal(res.statusCode, 302);
  assert.match(String(res.headers.location || ''), /connected=1/);
  assert.match(String(res.headers.location || ''), /clientId=8f8f8f8f-8f8f-48f8-98f8-8f8f8f8f8f8f/);
});

test('POST /integrations/ga4/properties/select returns scoped counters', async () => {
  const { app } = buildApp({
    propertiesSelectScopeResult: {
      scopeApplied: 'ALL_BRANDS',
      affectedBrandsTotal: 3,
      affectedBrandsSucceeded: 2,
      affectedBrandsFailed: 1,
      failures: [{ brandId: 'brand-3', message: 'failed', code: 'X' }],
      syncQueuedTotal: 2,
      syncSkippedTotal: 1,
    },
  });

  const res = await request(app)
    .post('/api/integrations/ga4/properties/select')
    .send({
      propertyId: '123456789',
      applyMode: 'ALL_BRANDS',
      syncAfterSelect: true,
    });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.selectedProperty?.propertyId, '123456789');
  assert.equal(res.body?.scopeApplied, 'ALL_BRANDS');
  assert.equal(res.body?.affectedBrandsTotal, 3);
  assert.equal(res.body?.syncQueuedTotal, 2);
});

test('GET /integrations/ga4/status reports statusSource=connectionState when state exists', async () => {
  const { app } = buildApp({
    statusIntegration: {
      id: 'ga4-integration-1',
      status: 'CONNECTED',
      googleAccountEmail: 'ga4@example.com',
      lastError: null,
    },
    connectionState: {
      status: 'REAUTH_REQUIRED',
    },
  });
  const res = await request(app).get('/api/integrations/ga4/status');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'REAUTH_REQUIRED');
  assert.equal(res.body.statusSource, 'connectionState');
});

test('GET /integrations/ga4/status exposes propertyScope mismatch when brand scope differs', async () => {
  const { app } = buildApp({
    statusIntegration: {
      id: 'ga4-integration-1',
      status: 'CONNECTED',
      googleAccountEmail: 'ga4@example.com',
      lastError: null,
    },
  });
  const res = await request(app).get('/api/integrations/ga4/status?brandId=brand-1');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.propertyScope?.brandActivePropertyId, '383714125');
  assert.equal(res.body?.propertyScope?.integrationSelectedPropertyId, '123456789');
  assert.equal(res.body?.propertyScope?.mismatch, true);
});
