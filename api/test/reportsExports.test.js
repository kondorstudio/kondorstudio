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
  mockModule('../src/prisma', { prisma: {} });
  mockModule('../src/middleware/auth', (req, _res, next) => {
    req.user = { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-1' };
    req.tenantId = 'tenant-1';
    next();
  });
  mockModule('../src/middleware/tenant', (req, _res, next) => {
    req.tenantId = req.tenantId || 'tenant-1';
    req.db = {};
    next();
  });
  mockModule('../src/modules/reports/exports.service', {
    createDashboardExport: async () => ({
      export: { id: 'export-1', status: 'READY' },
      url: 'https://files.example.com/export.pdf',
    }),
  });

  resetModule('../src/modules/reports/exports.controller');
  resetModule('../src/modules/reports/exports.routes');
  resetModule('../src/modules/reports/dashboards.routes');
  resetModule('../src/routes/reportsDashboards');

  const router = require('../src/routes/reportsDashboards');
  const app = express();
  app.use(express.json());
  app.use('/api/reports/dashboards', router);

  return { app };
}

test('create export returns download url', async () => {
  const { app } = buildApp();
  const res = await request(app)
    .post('/api/reports/dashboards/dashboard-1/exports')
    .send({ format: 'pdf' });

  assert.equal(res.status, 201);
  assert.equal(res.body?.id, 'export-1');
  assert.ok(res.body?.downloadUrl);
  assert.match(res.body.downloadUrl, /\/api\/reports\/exports\/export-1\/download/);
});
