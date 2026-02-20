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
    '../src/services/ga4AdminService',
    '../src/services/ga4OAuthService',
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
} = {}) {
  const tracker = { buildAuthUrlArgs: null };
  const auth = (req, _res, next) => {
    req.user = { id: 'user-1', role: 'OWNER' };
    req.tenantId = 'tenant-1';
    next();
  };
  auth.requireRole = () => (_req, _res, next) => next();
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
    selectProperty: async () => ({ propertyId: '123456789' }),
    getSelectedProperty: async () => ({ propertyId: '123456789' }),
  });

  mockModule('../src/services/ga4OAuthService', {
    isMockMode: () => false,
    buildState: () => 'state',
    verifyState: () => ({ tenantId: 'tenant-1', userId: 'user-1' }),
    getIntegration: async () => null,
    ensureMockIntegration: async () => ({}),
    exchangeCode: async () => ({}),
    disconnect: async () => ({}),
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
