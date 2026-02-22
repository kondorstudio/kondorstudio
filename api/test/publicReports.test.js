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
    publicShares: [],
    exports: [],
  };

  const prisma = {
    reportPublicShare: {
      findFirst: async ({ where, include }) => {
        const found = state.publicShares.find((item) => {
          if (where.tokenHash && item.tokenHash !== where.tokenHash) return false;
          if (where.status && item.status !== where.status) return false;
          return true;
        });
        if (!found) return null;
        const share = { ...found };
        if (include?.dashboard) {
          const dashboard = state.dashboards.find((item) => item.id === found.dashboardId);
          if (!dashboard) {
            share.dashboard = null;
            return share;
          }
          const dashboardResult = { ...dashboard };
          if (include.dashboard.include?.publishedVersion) {
            dashboardResult.publishedVersion =
              state.versions.find((version) => version.id === dashboard.publishedVersionId) ||
              null;
          }
          share.dashboard = dashboardResult;
        }
        return share;
      },
    },
    reportDashboardExport: {
      findFirst: async ({ where, include }) => {
        const allowedStatuses = where?.status?.in || null;
        const found = state.exports.find((item) => {
          if (where?.publicTokenHash && item.publicTokenHash !== where.publicTokenHash) {
            return false;
          }
          if (allowedStatuses && !allowedStatuses.includes(item.status)) return false;
          return true;
        });
        if (!found) return null;
        const exportRecord = { ...found };
        if (include?.dashboard) {
          const dashboard = state.dashboards.find((item) => item.id === found.dashboardId);
          if (!dashboard) {
            exportRecord.dashboard = null;
            return exportRecord;
          }
          const dashboardResult = { ...dashboard };
          if (include.dashboard.include?.publishedVersion) {
            dashboardResult.publishedVersion =
              state.versions.find((version) => version.id === dashboard.publishedVersionId) ||
              null;
          }
          exportRecord.dashboard = dashboardResult;
        }
        return exportRecord;
      },
    },
    brandSourceConnection: {
      findMany: async () => [],
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
    queryMetricsReportei: async (tenantId, payload) => {
      metricsCalls.push({ tenantId, payload, reportei: true });
      return { rows: [], totals: {}, meta: { currency: 'USD', dataSource: 'ga4_live' } };
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
    status: 'PUBLISHED',
    publishedVersionId: versionId,
  });
  state.publicShares.push({
    id: randomUUID(),
    tenantId: 'tenant-1',
    dashboardId: state.dashboards[0].id,
    tokenHash,
    status: 'ACTIVE',
    createdByUserId: 'user-1',
    createdAt: new Date(),
    revokedAt: null,
  });

  const res = await request(app).get(`/api/public/reports/${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body?.dashboard?.name, 'Public Dashboard');
  assert.equal(res.body?.dashboard?.brandId, 'brand-1');
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
    status: 'PUBLISHED',
    publishedVersionId: versionId,
  });
  state.publicShares.push({
    id: randomUUID(),
    tenantId: 'tenant-2',
    dashboardId: state.dashboards[0].id,
    tokenHash,
    status: 'ACTIVE',
    createdByUserId: 'user-2',
    createdAt: new Date(),
    revokedAt: null,
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

test('public metrics query forwards GA4 scope for live-eligible widgets', async () => {
  const { app, state, metricsCalls } = buildApp();
  const token = 'public-token-ga4';
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const versionId = randomUUID();
  state.versions.push({
    id: versionId,
    layoutJson: { widgets: [], theme: {}, globalFilters: {} },
  });

  state.dashboards.push({
    id: randomUUID(),
    tenantId: 'tenant-ga4',
    brandId: 'brand-ga4',
    name: 'Shared GA4',
    status: 'PUBLISHED',
    publishedVersionId: versionId,
  });
  state.publicShares.push({
    id: randomUUID(),
    tenantId: 'tenant-ga4',
    dashboardId: state.dashboards[0].id,
    tokenHash,
    status: 'ACTIVE',
    createdByUserId: 'user-ga4',
    createdAt: new Date(),
    revokedAt: null,
  });

  const res = await request(app)
    .post('/api/public/metrics/query')
    .send({
      token,
      responseFormat: 'reportei',
      dateRange: { start: '2026-02-01', end: '2026-02-07' },
      dimensions: ['date'],
      metrics: ['sessions'],
      filters: [{ field: 'platform', op: 'eq', value: 'GA4' }],
      requiredPlatforms: ['GA4'],
    });

  assert.equal(res.status, 200);
  assert.equal(metricsCalls.length, 1);
  assert.equal(metricsCalls[0].tenantId, 'tenant-ga4');
  assert.equal(metricsCalls[0].payload.brandId, 'brand-ga4');
  assert.equal(metricsCalls[0].payload.requiredPlatforms[0], 'GA4');
  assert.equal(metricsCalls[0].reportei, true);
});

test('public report returns not found when share is revoked', async () => {
  const { app, state } = buildApp();
  const token = 'public-token-revoked';
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const versionId = randomUUID();
  const dashboardId = randomUUID();

  state.versions.push({
    id: versionId,
    layoutJson: { widgets: [], theme: {}, globalFilters: {} },
  });

  state.dashboards.push({
    id: dashboardId,
    tenantId: 'tenant-3',
    brandId: 'brand-3',
    name: 'Revogado',
    status: 'PUBLISHED',
    publishedVersionId: versionId,
  });

  state.publicShares.push({
    id: randomUUID(),
    tenantId: 'tenant-3',
    dashboardId,
    tokenHash,
    status: 'REVOKED',
    createdByUserId: 'user-3',
    createdAt: new Date(),
    revokedAt: new Date(),
  });

  const res = await request(app).get(`/api/public/reports/${token}`);
  assert.equal(res.status, 404);
  assert.equal(res.body?.error?.code, 'PUBLIC_REPORT_NOT_FOUND');
});

test('old token is invalid after rotation while new active token works', async () => {
  const { app, state } = buildApp();
  const oldToken = 'old-token-123';
  const newToken = 'new-token-456';
  const oldHash = createHash('sha256').update(oldToken).digest('hex');
  const newHash = createHash('sha256').update(newToken).digest('hex');
  const versionId = randomUUID();
  const dashboardId = randomUUID();

  state.versions.push({
    id: versionId,
    layoutJson: { widgets: [], theme: {}, globalFilters: {} },
  });

  state.dashboards.push({
    id: dashboardId,
    tenantId: 'tenant-4',
    brandId: 'brand-4',
    name: 'Rotacionado',
    status: 'PUBLISHED',
    publishedVersionId: versionId,
  });

  state.publicShares.push({
    id: randomUUID(),
    tenantId: 'tenant-4',
    dashboardId,
    tokenHash: oldHash,
    status: 'REVOKED',
    createdByUserId: 'user-4',
    createdAt: new Date(Date.now() - 10000),
    revokedAt: new Date(Date.now() - 5000),
  });

  state.publicShares.push({
    id: randomUUID(),
    tenantId: 'tenant-4',
    dashboardId,
    tokenHash: newHash,
    status: 'ACTIVE',
    createdByUserId: 'user-4',
    createdAt: new Date(),
    revokedAt: null,
  });

  const oldRes = await request(app).get(`/api/public/reports/${oldToken}`);
  assert.equal(oldRes.status, 404);

  const newRes = await request(app).get(`/api/public/reports/${newToken}`);
  assert.equal(newRes.status, 200);
  assert.equal(newRes.body?.dashboard?.name, 'Rotacionado');
});

test('public report resolves with valid temporary export token', async () => {
  const { app, state } = buildApp();
  const token = 'export-token-valid';
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const versionId = randomUUID();
  const dashboardId = randomUUID();

  state.versions.push({
    id: versionId,
    layoutJson: { widgets: [], theme: {}, globalFilters: {} },
  });

  state.dashboards.push({
    id: dashboardId,
    tenantId: 'tenant-5',
    brandId: 'brand-5',
    name: 'Export Temp',
    status: 'PUBLISHED',
    publishedVersionId: versionId,
  });

  state.exports.push({
    id: randomUUID(),
    tenantId: 'tenant-5',
    dashboardId,
    status: 'PROCESSING',
    format: 'PDF',
    publicTokenHash: tokenHash,
    publicTokenExpiresAt: new Date(Date.now() + 60_000),
    meta: { purpose: 'pdf_temp_export' },
  });

  const res = await request(app).get(`/api/public/reports/${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body?.dashboard?.name, 'Export Temp');
});

test('public report rejects expired temporary export token', async () => {
  const { app, state } = buildApp();
  const token = 'export-token-expired';
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const versionId = randomUUID();
  const dashboardId = randomUUID();

  state.versions.push({
    id: versionId,
    layoutJson: { widgets: [], theme: {}, globalFilters: {} },
  });

  state.dashboards.push({
    id: dashboardId,
    tenantId: 'tenant-6',
    brandId: 'brand-6',
    name: 'Export Temp Expired',
    status: 'PUBLISHED',
    publishedVersionId: versionId,
  });

  state.exports.push({
    id: randomUUID(),
    tenantId: 'tenant-6',
    dashboardId,
    status: 'PROCESSING',
    format: 'PDF',
    publicTokenHash: tokenHash,
    publicTokenExpiresAt: new Date(Date.now() - 60_000),
    meta: { purpose: 'pdf_temp_export' },
  });

  const res = await request(app).get(`/api/public/reports/${token}`);
  assert.equal(res.status, 404);
  assert.equal(res.body?.error?.code, 'PUBLIC_REPORT_NOT_FOUND');
});
