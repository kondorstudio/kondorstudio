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

function buildApp() {
  const auth = (req, _res, next) => {
    req.user = { id: 'user-1', role: 'OWNER' };
    req.tenantId = 'tenant-1';
    next();
  };
  auth.requireRole = () => (_req, _res, next) => next();
  mockModule('../src/middleware/auth', auth);

  mockModule('../src/middleware/tenantGuard', (req, _res, next) => {
    req.db = {};
    next();
  });

  mockModule('../src/services/ga4AdminService', {
    syncProperties: async () => [
      {
        id: 'prop-1',
        propertyId: '123456789',
        displayName: 'Demo Property',
        isSelected: true,
      },
    ],
    listProperties: async () => [],
    selectProperty: async () => ({ propertyId: '123456789' }),
    getSelectedProperty: async () => ({ propertyId: '123456789' }),
  });

  mockModule('../src/services/ga4OAuthService', {
    isMockMode: () => false,
    buildState: () => 'state',
    getIntegration: async () => null,
    ensureMockIntegration: async () => ({}),
    exchangeCode: async () => ({}),
    disconnect: async () => ({}),
  });

  mockModule('../src/lib/googleClient', {
    buildAuthUrl: () => 'http://example.com/oauth',
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

  resetModule('../src/routes/integrationsGa4');
  resetModule('../src/routes/analyticsDashboards');

  const integrationsRouter = require('../src/routes/integrationsGa4');
  const analyticsRouter = require('../src/routes/analyticsDashboards');

  const app = express();
  app.use(express.json());
  app.use('/api/integrations/ga4', integrationsRouter);
  app.use('/api/analytics', analyticsRouter);
  return app;
}

test('GET /integrations/ga4/oauth/start returns url', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/integrations/ga4/oauth/start');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.url, 'http://example.com/oauth');
});

test('GET /integrations/ga4/properties/sync returns properties', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/integrations/ga4/properties/sync');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items.length, 1);
});

test('POST /analytics/ga4/run-report returns data', async () => {
  const app = buildApp();
  const res = await request(app)
    .post('/api/analytics/ga4/run-report')
    .send({ propertyId: '123456789', metrics: ['sessions'] });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body);
});
