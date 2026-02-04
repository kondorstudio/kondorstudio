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

function createFakePrisma() {
  const state = {
    dashboards: [],
    versions: [],
    connections: [],
  };

  const prisma = {
    reportDashboard: {
      findFirst: async ({ where, include }) => {
        const found = state.dashboards.find(
          (item) => item.id === where.id && item.tenantId === where.tenantId,
        );
        if (!found) return null;
        const result = { ...found };
        if (include?.publishedVersion) {
          result.publishedVersion =
            state.versions.find((item) => item.id === found.publishedVersionId) || null;
        }
        return result;
      },
    },
    brandSourceConnection: {
      findMany: async ({ where }) => {
        const requestedPlatforms = where?.platform?.in || null;
        return state.connections
          .filter((item) => {
            if (item.tenantId !== where.tenantId) return false;
            if (item.brandId !== where.brandId) return false;
            if (item.status !== where.status) return false;
            if (requestedPlatforms && !requestedPlatforms.includes(item.platform)) return false;
            return true;
          })
          .map((item) => ({ platform: item.platform }));
      },
    },
  };

  return { prisma, state };
}

function buildApp() {
  const { prisma, state } = createFakePrisma();

  mockModule('../src/prisma', { prisma });
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

  resetModule('../src/modules/reports/dashboardHealth.service');
  resetModule('../src/modules/reports/dashboards.service');
  resetModule('../src/modules/reports/dashboards.controller');
  resetModule('../src/modules/reports/dashboards.routes');
  resetModule('../src/routes/reportsDashboards');

  const router = require('../src/routes/reportsDashboards');
  const app = express();
  app.use(express.json());
  app.use('/api/reports/dashboards', router);

  return { app, state };
}

function createPublishedDashboard(state, layoutJson) {
  const dashboardId = randomUUID();
  const versionId = randomUUID();
  state.versions.push({
    id: versionId,
    dashboardId,
    layoutJson,
  });
  state.dashboards.push({
    id: dashboardId,
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    name: 'Health Dashboard',
    status: 'PUBLISHED',
    publishedVersionId: versionId,
  });
  return dashboardId;
}

test('health returns BLOCKED when required platform is missing', async () => {
  const { app, state } = buildApp();
  const dashboardId = createPublishedDashboard(state, {
    theme: {},
    globalFilters: {
      dateRange: { preset: 'last_7_days' },
      platforms: [],
      accounts: [],
      compareTo: null,
      autoRefreshSec: 0,
    },
    pages: [
      {
        id: randomUUID(),
        name: 'Pagina 1',
        widgets: [
          {
            id: randomUUID(),
            type: 'bar',
            title: 'Meta',
            layout: { x: 0, y: 0, w: 6, h: 4, minW: 2, minH: 2 },
            query: {
              dimensions: ['platform'],
              metrics: ['spend'],
              filters: [{ field: 'platform', op: 'eq', value: 'META_ADS' }],
            },
            viz: {},
          },
        ],
      },
    ],
  });

  const res = await request(app).get(`/api/reports/dashboards/${dashboardId}/health`);
  assert.equal(res.status, 200);
  assert.equal(res.body?.status, 'BLOCKED');
  assert.deepEqual(res.body?.missingPlatforms, ['META_ADS']);
  assert.equal(res.body?.invalidWidgets?.[0]?.reason, 'MISSING_CONNECTION');
  assert.equal(res.body?.invalidWidgets?.[0]?.platform, 'META_ADS');
});

test('health returns WARN when no platform is explicitly required', async () => {
  const { app, state } = buildApp();
  const dashboardId = createPublishedDashboard(state, {
    theme: {},
    globalFilters: {
      dateRange: { preset: 'last_7_days' },
      platforms: [],
      accounts: [],
      compareTo: null,
      autoRefreshSec: 0,
    },
    widgets: [
      {
        id: randomUUID(),
        type: 'table',
        title: 'Tabela',
        layout: { x: 0, y: 0, w: 12, h: 6, minW: 2, minH: 2 },
        query: {
          dimensions: ['campaign_id'],
          metrics: ['spend'],
          filters: [],
        },
        viz: {},
      },
    ],
  });

  const res = await request(app).get(`/api/reports/dashboards/${dashboardId}/health`);
  assert.equal(res.status, 200);
  assert.equal(res.body?.status, 'WARN');
  assert.deepEqual(res.body?.missingPlatforms, []);
});

test('health returns WARN with INVALID_QUERY widget issues', async () => {
  const { app, state } = buildApp();
  const dashboardId = createPublishedDashboard(state, {
    theme: {},
    globalFilters: {
      dateRange: { preset: 'last_7_days' },
      platforms: [],
      accounts: [],
      compareTo: null,
      autoRefreshSec: 0,
    },
    widgets: [
      {
        id: randomUUID(),
        type: 'timeseries',
        title: 'Serie invalida',
        layout: { x: 0, y: 0, w: 12, h: 6, minW: 2, minH: 2 },
        query: {
          dimensions: [],
          metrics: ['spend'],
          filters: [],
        },
        viz: {},
      },
    ],
  });

  const res = await request(app).get(`/api/reports/dashboards/${dashboardId}/health`);
  assert.equal(res.status, 200);
  assert.equal(res.body?.status, 'WARN');
  assert.equal(res.body?.invalidWidgets?.[0]?.reason, 'INVALID_QUERY');
});

