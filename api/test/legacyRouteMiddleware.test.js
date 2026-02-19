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

function buildApp({ mode = 'warn', reportingEnabled = 'true' } = {}) {
  process.env.LEGACY_ROUTES_MODE = mode;
  process.env.REPORTING_V1_ENABLED = reportingEnabled;
  process.env.LEGACY_ROUTES_SUNSET_AT = '2026-12-31T23:59:59.000Z';
  process.env.LEGACY_ROUTE_LOG_TTL_MS = '1';

  const createdLogs = [];

  mockModule('../src/prisma', {
    prisma: {
      systemLog: {
        create: async ({ data }) => {
          createdLogs.push(data);
          return data;
        },
      },
    },
  });

  resetModule('../src/modules/observability/legacyRoute.middleware');
  const { legacyRouteGuard } = require('../src/modules/observability/legacyRoute.middleware');

  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', tenantId: 'tenant-1' };
    req.tenantId = 'tenant-1';
    next();
  });
  app.use(
    '/legacy',
    legacyRouteGuard({ kind: 'reporting-v1', successorPath: '/api/reports/dashboards' }),
  );
  app.get('/legacy/ping', (_req, res) => res.json({ ok: true }));

  return { app, createdLogs };
}

test('legacyRouteGuard permite rota em modo warn e injeta headers', async () => {
  const { app, createdLogs } = buildApp({ mode: 'warn', reportingEnabled: 'true' });
  const res = await request(app).get('/legacy/ping');

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.deprecation, 'true');
  assert.equal(res.headers['x-kondor-legacy-route'], 'reporting-v1');
  assert.ok(res.headers.sunset);
  assert.ok(res.headers.link);
  assert.equal(createdLogs.length > 0, true);
});

test('legacyRouteGuard bloqueia rota em modo block', async () => {
  const { app } = buildApp({ mode: 'block', reportingEnabled: 'true' });
  const res = await request(app).get('/legacy/ping');

  assert.equal(res.statusCode, 410);
  assert.equal(res.body.code, 'LEGACY_ROUTE_DISABLED');
});
