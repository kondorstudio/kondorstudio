process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('crypto');
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

function createFakePrisma() {
  const state = {
    dashboards: [],
    versions: [],
  };

  const prisma = {
    reportDashboard: {
      findFirst: async ({ where, include }) => {
        const found = state.dashboards.find((item) => {
          if (where.id && item.id !== where.id) return false;
          if (where.tenantId && item.tenantId !== where.tenantId) return false;
          if (where.sharedEnabled !== undefined && item.sharedEnabled !== where.sharedEnabled) {
            return false;
          }
          if (where.sharedTokenHash && item.sharedTokenHash !== where.sharedTokenHash) {
            return false;
          }
          return true;
        });
        if (!found) return null;
        const result = { ...found };
        if (include?.publishedVersion) {
          result.publishedVersion =
            state.versions.find((version) => version.id === found.publishedVersionId) ||
            null;
        }
        return result;
      },
    },
    reportDashboardExport: {
      findFirst: async () => null,
    },
  };

  return { prisma, state };
}

function buildApp() {
  const { prisma, state } = createFakePrisma();
  const metricsCalls = [];

  mockModule('../src/prisma', { prisma });
  mockModule('../src/modules/metrics/metrics.service', {
    queryMetrics: async (tenantId, payload) => {
      metricsCalls.push({ tenantId, payload });
      return { rows: [], totals: {}, meta: { currency: 'USD' } };
    },
  });

  resetModule('../src/modules/reports/publicReports.service');
  resetModule('../src/modules/reports/publicReports.controller');
  resetModule('../src/routes/publicReports');

  const router = require('../src/routes/publicReports');
  const app = express();
  app.use(express.json());
  app.use('/api/public', router);

  return { app, state, metricsCalls };
}

test('public report resolves by token', async () => {
  const { app, state } = buildApp();
  const token = 'public-token-12345';
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const versionId = randomUUID();
  state.versions.push({
    id: versionId,
    layoutJson: { widgets: [], theme: {}, globalFilters: {} },
  });

  state.dashboards.push({
    id: randomUUID(),
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    name: 'Public Dashboard',
    sharedEnabled: true,
    sharedTokenHash: tokenHash,
    publishedVersionId: versionId,
  });

  const res = await request(app).get(`/api/public/reports/${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body?.dashboard?.name, 'Public Dashboard');
  assert.deepEqual(res.body?.layoutJson?.widgets, []);
});

test('public metrics query resolves tenant and brand from token', async () => {
  const { app, state, metricsCalls } = buildApp();
  const token = 'public-token-67890';
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const versionId = randomUUID();
  state.versions.push({
    id: versionId,
    layoutJson: { widgets: [], theme: {}, globalFilters: {} },
  });

  state.dashboards.push({
    id: randomUUID(),
    tenantId: 'tenant-2',
    brandId: 'brand-2',
    name: 'Shared Dashboard',
    sharedEnabled: true,
    sharedTokenHash: tokenHash,
    publishedVersionId: versionId,
  });

  const res = await request(app)
    .post('/api/public/metrics/query')
    .send({
      token,
      dateRange: { start: '2025-01-01', end: '2025-01-07' },
      dimensions: [],
      metrics: ['spend'],
      filters: [],
    });

  assert.equal(res.status, 200);
  assert.equal(metricsCalls.length, 1);
  assert.equal(metricsCalls[0].tenantId, 'tenant-2');
  assert.equal(metricsCalls[0].payload.brandId, 'brand-2');
  assert.equal(metricsCalls[0].payload.metrics[0], 'spend');
});
