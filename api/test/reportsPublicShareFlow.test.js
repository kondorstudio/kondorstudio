process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
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

function extractTokenFromUrl(url) {
  const parts = String(url || '').split('/');
  return parts[parts.length - 1] || '';
}

function createFakePrisma() {
  const state = {
    dashboards: [],
    versions: [],
    publicShares: [],
  };

  const prisma = {
    reportDashboard: {
      findFirst: async ({ where, include }) => {
        const found = state.dashboards.find((item) => {
          if (where.id && item.id !== where.id) return false;
          if (where.tenantId && item.tenantId !== where.tenantId) return false;
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
      update: async ({ where, data }) => {
        const index = state.dashboards.findIndex((item) => item.id === where.id);
        if (index === -1) return null;
        const updated = {
          ...state.dashboards[index],
          ...data,
          updatedAt: new Date(),
        };
        state.dashboards[index] = updated;
        return { ...updated };
      },
    },
    reportPublicShare: {
      create: async ({ data }) => {
        const share = {
          id: randomUUID(),
          tenantId: data.tenantId,
          dashboardId: data.dashboardId,
          tokenHash: data.tokenHash,
          status: data.status || 'ACTIVE',
          createdByUserId: data.createdByUserId,
          createdAt: data.createdAt || new Date(),
          revokedAt: data.revokedAt || null,
        };
        state.publicShares.push(share);
        return { ...share };
      },
      findFirst: async ({ where, orderBy, include }) => {
        let items = state.publicShares.filter((item) => {
          if (where.tenantId && item.tenantId !== where.tenantId) return false;
          if (where.dashboardId && item.dashboardId !== where.dashboardId) return false;
          if (where.tokenHash && item.tokenHash !== where.tokenHash) return false;
          if (where.status && item.status !== where.status) return false;
          return true;
        });
        if (!items.length) return null;
        if (orderBy?.createdAt === 'desc') {
          items = items.slice().sort((a, b) => b.createdAt - a.createdAt);
        }
        const share = { ...items[0] };
        if (include?.dashboard) {
          const dashboard = state.dashboards.find((item) => item.id === share.dashboardId);
          if (!dashboard) {
            share.dashboard = null;
          } else {
            const dashboardResult = { ...dashboard };
            if (include.dashboard.include?.publishedVersion) {
              dashboardResult.publishedVersion =
                state.versions.find((version) => version.id === dashboard.publishedVersionId) ||
                null;
            }
            share.dashboard = dashboardResult;
          }
        }
        return share;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        state.publicShares = state.publicShares.map((item) => {
          if (where.tenantId && item.tenantId !== where.tenantId) return item;
          if (where.dashboardId && item.dashboardId !== where.dashboardId) return item;
          if (where.status && item.status !== where.status) return item;
          count += 1;
          return { ...item, ...data };
        });
        return { count };
      },
    },
    reportDashboardExport: {
      findFirst: async () => null,
    },
    brandSourceConnection: {
      findMany: async () => [],
    },
    $transaction: async (fn) => fn(prisma),
  };

  return { prisma, state };
}

function buildApp() {
  const { prisma, state } = createFakePrisma();

  mockModule('../src/prisma', { prisma });
  mockModule('../src/middleware/auth', (req, _res, next) => {
    req.user = {
      id: req.headers['x-user-id'] || 'user-1',
      role: req.headers['x-role'] || 'ADMIN',
      tenantId: req.headers['x-tenant-id'] || 'tenant-1',
    };
    req.tenantId = req.user.tenantId;
    next();
  });
  mockModule('../src/middleware/tenant', (req, _res, next) => {
    req.tenantId = req.tenantId || req.user?.tenantId || 'tenant-1';
    req.db = {};
    next();
  });
  mockModule('../src/modules/metrics/metrics.service', {
    queryMetrics: async () => ({ rows: [], totals: {}, meta: { currency: 'USD' } }),
  });

  resetModule('../src/modules/reports/dashboards.service');
  resetModule('../src/modules/reports/dashboards.controller');
  resetModule('../src/modules/reports/dashboards.routes');
  resetModule('../src/routes/reportsDashboards');
  resetModule('../src/modules/reports/publicReports.service');
  resetModule('../src/modules/reports/publicReports.controller');
  resetModule('../src/routes/publicReports');

  const dashboardsRouter = require('../src/routes/reportsDashboards');
  const publicRouter = require('../src/routes/publicReports');

  const app = express();
  app.use(express.json());
  app.use('/api/reports/dashboards', dashboardsRouter);
  app.use('/api/public', publicRouter);

  return { app, state };
}

test('create share token resolves in public report endpoint', async () => {
  const { app, state } = buildApp();
  const dashboardId = randomUUID();
  const versionId = randomUUID();
  state.versions.push({
    id: versionId,
    layoutJson: { widgets: [], theme: {}, globalFilters: {} },
  });
  state.dashboards.push({
    id: dashboardId,
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    groupId: null,
    name: 'Share flow',
    status: 'PUBLISHED',
    publishedVersionId: versionId,
    createdByUserId: 'user-1',
    sharedEnabled: false,
    sharedTokenHash: null,
    sharedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const createRes = await request(app)
    .post(`/api/reports/dashboards/${dashboardId}/public-share`)
    .set('x-role', 'MEMBER');

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.status, 'ACTIVE');
  assert.ok(createRes.body.publicUrl);

  const token = extractTokenFromUrl(createRes.body.publicUrl);
  const publicRes = await request(app).get(`/api/public/reports/${token}`);
  assert.equal(publicRes.status, 200);
  assert.equal(publicRes.body.dashboard.name, 'Share flow');
});

test('rotate invalidates old token', async () => {
  const { app, state } = buildApp();
  const dashboardId = randomUUID();
  const versionId = randomUUID();
  state.versions.push({
    id: versionId,
    layoutJson: { widgets: [], theme: {}, globalFilters: {} },
  });
  state.dashboards.push({
    id: dashboardId,
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    groupId: null,
    name: 'Rotate flow',
    status: 'PUBLISHED',
    publishedVersionId: versionId,
    createdByUserId: 'user-1',
    sharedEnabled: false,
    sharedTokenHash: null,
    sharedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const first = await request(app)
    .post(`/api/reports/dashboards/${dashboardId}/public-share`)
    .set('x-role', 'MEMBER');
  assert.equal(first.status, 201);
  const oldToken = extractTokenFromUrl(first.body.publicUrl);

  const rotate = await request(app)
    .post(`/api/reports/dashboards/${dashboardId}/public-share/rotate`)
    .set('x-role', 'MEMBER');
  assert.equal(rotate.status, 201);
  const newToken = extractTokenFromUrl(rotate.body.publicUrl);
  assert.notEqual(newToken, oldToken);

  const oldRes = await request(app).get(`/api/public/reports/${oldToken}`);
  assert.equal(oldRes.status, 404);

  const newRes = await request(app).get(`/api/public/reports/${newToken}`);
  assert.equal(newRes.status, 200);
});

test('revoked share token cannot access public report', async () => {
  const { app, state } = buildApp();
  const dashboardId = randomUUID();
  const versionId = randomUUID();
  state.versions.push({
    id: versionId,
    layoutJson: { widgets: [], theme: {}, globalFilters: {} },
  });
  state.dashboards.push({
    id: dashboardId,
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    groupId: null,
    name: 'Revoke flow',
    status: 'PUBLISHED',
    publishedVersionId: versionId,
    createdByUserId: 'user-1',
    sharedEnabled: false,
    sharedTokenHash: null,
    sharedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const created = await request(app)
    .post(`/api/reports/dashboards/${dashboardId}/public-share`)
    .set('x-role', 'MEMBER');
  assert.equal(created.status, 201);
  const token = extractTokenFromUrl(created.body.publicUrl);

  const revoke = await request(app)
    .delete(`/api/reports/dashboards/${dashboardId}/public-share`)
    .set('x-role', 'MEMBER');
  assert.equal(revoke.status, 200);

  const publicRes = await request(app).get(`/api/public/reports/${token}`);
  assert.equal(publicRes.status, 404);
});

test('cannot create public share for non-published dashboard', async () => {
  const { app, state } = buildApp();
  const dashboardId = randomUUID();
  state.dashboards.push({
    id: dashboardId,
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    groupId: null,
    name: 'Draft flow',
    status: 'DRAFT',
    publishedVersionId: null,
    createdByUserId: 'user-1',
    sharedEnabled: false,
    sharedTokenHash: null,
    sharedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const res = await request(app)
    .post(`/api/reports/dashboards/${dashboardId}/public-share`)
    .set('x-role', 'MEMBER');

  assert.equal(res.status, 400);
  assert.equal(res.body?.error?.code, 'DASHBOARD_NOT_PUBLISHED');
});
