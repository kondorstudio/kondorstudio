process.env.NODE_ENV = 'test';

const { randomUUID } = require('crypto');
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

function buildLayout() {
  return {
    theme: {
      mode: 'light',
      brandColor: '#B050F0',
      accentColor: '#22C55E',
      bg: '#FFFFFF',
      text: '#0F172A',
      mutedText: '#64748B',
      cardBg: '#FFFFFF',
      border: '#E2E8F0',
      radius: 16,
    },
    globalFilters: {
      dateRange: { preset: 'last_7_days' },
      platforms: [],
      accounts: [],
      compareTo: null,
      autoRefreshSec: 0,
    },
    widgets: [],
  };
}

function createFakePrisma() {
  const state = {
    templates: [],
    dashboards: [],
    versions: [],
    clients: [],
    brandGroups: [],
  };

  const prisma = {
    client: {
      findFirst: async ({ where }) => {
        const found = state.clients.find(
          (item) => item.id === where.id && item.tenantId === where.tenantId,
        );
        return found ? { id: found.id } : null;
      },
    },
    brandGroup: {
      findFirst: async ({ where }) => {
        const found = state.brandGroups.find(
          (item) => item.id === where.id && item.tenantId === where.tenantId,
        );
        return found ? { id: found.id } : null;
      },
    },
    reportTemplateV2: {
      findMany: async ({ where, orderBy }) => {
        let items = state.templates.slice();
        if (where?.OR) {
          items = items.filter((item) =>
            where.OR.some((clause) => {
              if ('tenantId' in clause) {
                return clause.tenantId === item.tenantId;
              }
              return false;
            }),
          );
        }
        if (orderBy?.length) {
          items = items.slice().sort((a, b) => {
            if (a.tenantId === b.tenantId) return a.name.localeCompare(b.name);
            if (a.tenantId === null) return -1;
            if (b.tenantId === null) return 1;
            return String(a.tenantId).localeCompare(String(b.tenantId));
          });
        }
        return items.map((item) => ({ ...item }));
      },
      findFirst: async ({ where }) => {
        const items = state.templates.filter((item) => item.id === where.id);
        if (!items.length) return null;
        if (!where?.OR) return { ...items[0] };
        const allowed = items.find((item) =>
          where.OR.some((clause) => clause.tenantId === item.tenantId),
        );
        return allowed ? { ...allowed } : null;
      },
    },
    reportDashboard: {
      create: async ({ data }) => {
        const dashboard = {
          id: randomUUID(),
          tenantId: data.tenantId,
          brandId: data.brandId,
          groupId: data.groupId ?? null,
          name: data.name,
          status: data.status ?? 'DRAFT',
          publishedVersionId: data.publishedVersionId ?? null,
          createdByUserId: data.createdByUserId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.dashboards.push(dashboard);
        return { ...dashboard };
      },
      findFirst: async ({ where, include }) => {
        const found = state.dashboards.find(
          (item) => item.id === where.id && item.tenantId === where.tenantId,
        );
        if (!found) return null;
        const result = { ...found };
        if (include?.publishedVersion) {
          result.publishedVersion =
            state.versions.find((item) => item.id === found.publishedVersionId) ||
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
    reportDashboardVersion: {
      create: async ({ data }) => {
        const version = {
          id: randomUUID(),
          dashboardId: data.dashboardId,
          versionNumber: data.versionNumber,
          layoutJson: data.layoutJson,
          createdByUserId: data.createdByUserId ?? null,
          createdAt: new Date(),
        };
        state.versions.push(version);
        return { ...version };
      },
      findFirst: async ({ where, orderBy }) => {
        let items = state.versions.filter((item) => {
          if (where.id && item.id !== where.id) return false;
          if (where.dashboardId && item.dashboardId !== where.dashboardId) return false;
          return true;
        });
        if (!items.length) return null;
        if (orderBy?.versionNumber === 'desc') {
          items = items.slice().sort((a, b) => b.versionNumber - a.versionNumber);
        }
        return { ...items[0] };
      },
    },
    $transaction: async (fn) => fn(prisma),
  };

  return { prisma, state };
}

function buildApp() {
  const { prisma, state } = createFakePrisma();

  mockModule('../src/prisma', { prisma });
  mockModule('../src/middleware/auth', (req, _res, next) => {
    const role = req.headers['x-role'] || 'ADMIN';
    const tenantId = req.headers['x-tenant-id'] || 'tenant-1';
    req.user = { id: 'user-1', role, tenantId };
    req.tenantId = tenantId;
    next();
  });
  mockModule('../src/middleware/tenant', (req, _res, next) => {
    req.tenantId = req.tenantId || req.user?.tenantId || 'tenant-1';
    req.db = {};
    next();
  });

  resetModule('../src/modules/reports/dashboards.service');
  resetModule('../src/modules/reports/templates.service');
  resetModule('../src/modules/reports/templates.controller');
  resetModule('../src/modules/reports/templates.routes');
  resetModule('../src/routes/reportsTemplates');

  const router = require('../src/routes/reportsTemplates');

  const app = express();
  app.use(express.json());
  app.use('/api/reports/templates', router);
  return { app, state };
}

test('GET /templates returns globals and tenant templates', async () => {
  const { app, state } = buildApp();
  const globalId = randomUUID();
  const tenantId = 'tenant-1';
  const tenantTemplateId = randomUUID();
  const otherTenantId = randomUUID();

  state.templates.push(
    {
      id: globalId,
      tenantId: null,
      name: 'Global Template',
      category: 'Ads',
      layoutJson: buildLayout(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: tenantTemplateId,
      tenantId,
      name: 'Tenant Template',
      category: 'Ads',
      layoutJson: buildLayout(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: randomUUID(),
      tenantId: otherTenantId,
      name: 'Other Template',
      category: 'Ads',
      layoutJson: buildLayout(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  );

  const res = await request(app)
    .get('/api/reports/templates')
    .set('x-role', 'CLIENT')
    .set('x-tenant-id', tenantId);

  assert.equal(res.statusCode, 200);
  const ids = res.body.items.map((item) => item.id);
  assert.equal(res.body.items.length, 2);
  assert.ok(ids.includes(globalId));
  assert.ok(ids.includes(tenantTemplateId));
});

test('POST /templates/:id/instantiate creates dashboard + version 1', async () => {
  const { app, state } = buildApp();
  const templateId = randomUUID();
  const brandId = randomUUID();

  state.clients.push({ id: brandId, tenantId: 'tenant-1' });
  state.templates.push({
    id: templateId,
    tenantId: null,
    name: 'Template',
    category: 'Ads',
    layoutJson: buildLayout(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const res = await request(app)
    .post(`/api/reports/templates/${templateId}/instantiate`)
    .set('x-role', 'MEMBER')
    .send({ brandId });

  assert.equal(res.statusCode, 201);
  assert.ok(res.body.dashboardId);
  assert.equal(state.dashboards.length, 1);
  assert.equal(state.versions.length, 1);
  assert.equal(state.versions[0].versionNumber, 1);
});

test('tenant cannot instantiate template from another tenant', async () => {
  const { app, state } = buildApp();
  const templateId = randomUUID();
  const brandId = randomUUID();

  state.clients.push({ id: brandId, tenantId: 'tenant-1' });
  state.templates.push({
    id: templateId,
    tenantId: 'tenant-2',
    name: 'Other Tenant Template',
    category: 'Ads',
    layoutJson: buildLayout(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const res = await request(app)
    .post(`/api/reports/templates/${templateId}/instantiate`)
    .set('x-role', 'MEMBER')
    .set('x-tenant-id', 'tenant-1')
    .send({ brandId });

  assert.equal(res.statusCode, 404);
});

test('instantiate rejects template with invalid layout', async () => {
  const { app, state } = buildApp();
  const templateId = randomUUID();
  const brandId = randomUUID();

  state.clients.push({ id: brandId, tenantId: 'tenant-1' });
  state.templates.push({
    id: templateId,
    tenantId: null,
    name: 'Invalid Layout',
    category: 'Ads',
    layoutJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const res = await request(app)
    .post(`/api/reports/templates/${templateId}/instantiate`)
    .set('x-role', 'MEMBER')
    .send({ brandId });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'INVALID_LAYOUT');
});
