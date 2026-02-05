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
    dashboards: [],
    versions: [],
    clients: [],
    brandGroups: [],
    publicShares: [],
    brandSourceConnections: [],
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
          sharedEnabled: data.sharedEnabled ?? false,
          sharedTokenHash: data.sharedTokenHash ?? null,
          sharedAt: data.sharedAt ?? null,
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
      findMany: async ({ where, orderBy }) => {
        let items = state.dashboards.filter((item) => item.tenantId === where.tenantId);
        if (where.brandId) {
          items = items.filter((item) => item.brandId === where.brandId);
        }
        if (where.groupId) {
          items = items.filter((item) => item.groupId === where.groupId);
        }
        if (where.status) {
          items = items.filter((item) => item.status === where.status);
        }
        if (where.publishedVersionId && where.publishedVersionId.not !== undefined) {
          items = items.filter((item) => item.publishedVersionId !== null);
        }
        if (orderBy?.updatedAt === 'desc') {
          items = items.slice().sort((a, b) => b.updatedAt - a.updatedAt);
        }
        return items.map((item) => ({ ...item }));
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
      delete: async ({ where }) => {
        const index = state.dashboards.findIndex((item) => item.id === where.id);
        if (index === -1) return null;
        const [removed] = state.dashboards.splice(index, 1);
        return removed ? { ...removed } : null;
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
      findMany: async ({ where, orderBy }) => {
        let items = state.versions.filter((item) => item.dashboardId === where.dashboardId);
        if (orderBy?.versionNumber === 'desc') {
          items = items.slice().sort((a, b) => b.versionNumber - a.versionNumber);
        }
        return items.map((item) => ({ ...item }));
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
      findFirst: async ({ where, orderBy }) => {
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
        return { ...items[0] };
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        state.publicShares = state.publicShares.map((item) => {
          if (where.tenantId && item.tenantId !== where.tenantId) return item;
          if (where.dashboardId && item.dashboardId !== where.dashboardId) return item;
          if (where.status && item.status !== where.status) return item;
          count += 1;
          return {
            ...item,
            ...data,
          };
        });
        return { count };
      },
    },
    brandSourceConnection: {
      findMany: async ({ where, select }) => {
        let items = state.brandSourceConnections.filter((item) => {
          if (where.tenantId && item.tenantId !== where.tenantId) return false;
          if (where.brandId && item.brandId !== where.brandId) return false;
          if (where.status && item.status !== where.status) return false;
          if (where.platform?.in && !where.platform.in.includes(item.platform)) return false;
          return true;
        });
        if (select?.platform) {
          items = items.map((item) => ({ platform: item.platform }));
        }
        return items.map((item) => ({ ...item }));
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
  resetModule('../src/modules/reports/dashboards.controller');
  resetModule('../src/modules/reports/dashboards.routes');
  resetModule('../src/routes/reportsDashboards');

  const router = require('../src/routes/reportsDashboards');

  const app = express();
  app.use(express.json());
  app.use('/api/reports/dashboards', router);
  return { app, prisma, state };
}

test('create dashboard creates version 1', async () => {
  const { app, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-1' });

  const createRes = await request(app)
    .post('/api/reports/dashboards')
    .set('x-role', 'MEMBER')
    .send({ name: 'Meu Dashboard', brandId });

  assert.equal(createRes.statusCode, 201);
  assert.equal(createRes.body.latestVersion.versionNumber, 1);

  const versionsRes = await request(app)
    .get(`/api/reports/dashboards/${createRes.body.id}/versions`)
    .set('x-role', 'MEMBER');

  assert.equal(versionsRes.statusCode, 200);
  assert.equal(versionsRes.body.items[0].versionNumber, 1);
});

test('create version increments version_number', async () => {
  const { app, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-1' });

  const createRes = await request(app)
    .post('/api/reports/dashboards')
    .set('x-role', 'MEMBER')
    .send({ name: 'Dashboard', brandId });

  const versionRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/versions`)
    .set('x-role', 'MEMBER')
    .send({ layoutJson: buildLayout() });

  assert.equal(versionRes.statusCode, 201);
  assert.equal(versionRes.body.versionNumber, 2);
});

test('clone dashboard creates draft with latest layout', async () => {
  const { app, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-1' });

  const createRes = await request(app)
    .post('/api/reports/dashboards')
    .set('x-role', 'MEMBER')
    .send({ name: 'Dashboard Base', brandId });

  const latestLayout = buildLayout();
  latestLayout.theme.brandColor = '#111111';

  await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/versions`)
    .set('x-role', 'MEMBER')
    .send({ layoutJson: latestLayout });

  const cloneRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/clone`)
    .set('x-role', 'MEMBER');

  assert.equal(cloneRes.statusCode, 201);
  assert.notEqual(cloneRes.body.id, createRes.body.id);
  assert.equal(cloneRes.body.name, 'Dashboard Base (cópia)');
  assert.equal(cloneRes.body.status, 'DRAFT');
  assert.equal(cloneRes.body.latestVersion.versionNumber, 1);
  assert.equal(cloneRes.body.latestVersion.layoutJson.theme.brandColor, '#111111');
});

test('delete dashboard removes it from list', async () => {
  const { app, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-1' });

  const createRes = await request(app)
    .post('/api/reports/dashboards')
    .set('x-role', 'MEMBER')
    .send({ name: 'Dashboard apagar', brandId });

  const deleteRes = await request(app)
    .delete(`/api/reports/dashboards/${createRes.body.id}`)
    .set('x-role', 'MEMBER');

  assert.equal(deleteRes.statusCode, 200);

  const listRes = await request(app)
    .get('/api/reports/dashboards')
    .set('x-role', 'MEMBER');

  assert.equal(listRes.statusCode, 200);
  assert.equal(
    listRes.body.items.some((item) => item.id === createRes.body.id),
    false,
  );
});

test('publish rejects invalid layout', async () => {
  const { app, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-1' });

  const createRes = await request(app)
    .post('/api/reports/dashboards')
    .set('x-role', 'MEMBER')
    .send({ name: 'Dashboard', brandId });

  const invalidVersionId = randomUUID();

  state.versions.push({
    id: invalidVersionId,
    dashboardId: createRes.body.id,
    versionNumber: 2,
    layoutJson: {},
    createdByUserId: 'user-1',
    createdAt: new Date(),
  });

  const publishRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/publish`)
    .set('x-role', 'MEMBER')
    .send({ versionId: invalidVersionId });

  assert.equal(publishRes.statusCode, 400);
  assert.equal(publishRes.body.error.code, 'INVALID_LAYOUT');
});

test('rollback updates published_version_id', async () => {
  const { app, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-1' });

  const createRes = await request(app)
    .post('/api/reports/dashboards')
    .set('x-role', 'MEMBER')
    .send({ name: 'Dashboard', brandId });

  const version1Id = createRes.body.latestVersion.id;

  const versionRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/versions`)
    .set('x-role', 'MEMBER')
    .send({ layoutJson: buildLayout() });

  const version2Id = versionRes.body.id;

  const publishRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/publish`)
    .set('x-role', 'MEMBER')
    .send({ versionId: version2Id });

  assert.equal(publishRes.statusCode, 200);
  assert.equal(publishRes.body.publishedVersionId, version2Id);

  const rollbackRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/rollback`)
    .set('x-role', 'MEMBER')
    .send({ versionId: version1Id });

  assert.equal(rollbackRes.statusCode, 200);
  assert.equal(rollbackRes.body.publishedVersionId, version1Id);
});

test('viewer cannot publish or rollback', async () => {
  const { app, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-1' });

  const createRes = await request(app)
    .post('/api/reports/dashboards')
    .set('x-role', 'MEMBER')
    .send({ name: 'Dashboard', brandId });

  const publishRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/publish`)
    .set('x-role', 'CLIENT')
    .send({ versionId: createRes.body.latestVersion.id });

  assert.equal(publishRes.statusCode, 403);

  const rollbackRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/rollback`)
    .set('x-role', 'CLIENT')
    .send({ versionId: createRes.body.latestVersion.id });

  assert.equal(rollbackRes.statusCode, 403);
});

test('tenant isolation prevents cross-tenant access', async () => {
  const { app, prisma, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-2' });

  const otherDashboard = await prisma.reportDashboard.create({
    data: {
      tenantId: 'tenant-2',
      brandId,
      groupId: null,
      name: 'Outro tenant',
      status: 'DRAFT',
      createdByUserId: 'user-2',
    },
  });

  const res = await request(app)
    .get(`/api/reports/dashboards/${otherDashboard.id}`)
    .set('x-role', 'ADMIN')
    .set('x-tenant-id', 'tenant-1');

  assert.equal(res.statusCode, 404);
});

test('clone prevents cross-tenant access', async () => {
  const { app, prisma } = buildApp();
  const dashboard = await prisma.reportDashboard.create({
    data: {
      tenantId: 'tenant-2',
      brandId: randomUUID(),
      groupId: null,
      name: 'Outro tenant',
      status: 'DRAFT',
      createdByUserId: 'user-2',
    },
  });

  const res = await request(app)
    .post(`/api/reports/dashboards/${dashboard.id}/clone`)
    .set('x-role', 'ADMIN')
    .set('x-tenant-id', 'tenant-1');

  assert.equal(res.statusCode, 404);
});

test('create public share returns active url for published dashboard', async () => {
  const { app, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-1' });

  const createRes = await request(app)
    .post('/api/reports/dashboards')
    .set('x-role', 'MEMBER')
    .send({ name: 'Publicavel', brandId });

  await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/publish`)
    .set('x-role', 'MEMBER')
    .send({ versionId: createRes.body.latestVersion.id });

  const shareRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/public-share`)
    .set('x-role', 'MEMBER');

  assert.equal(shareRes.statusCode, 201);
  assert.equal(shareRes.body.status, 'ACTIVE');
  assert.equal(typeof shareRes.body.publicUrl, 'string');
  assert.ok(shareRes.body.publicUrl.includes('/public/reports/'));
  assert.equal(state.publicShares.length, 1);
  assert.equal(state.publicShares[0].status, 'ACTIVE');
});

test('rotate public share revokes old active token and creates a new one', async () => {
  const { app, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-1' });

  const createRes = await request(app)
    .post('/api/reports/dashboards')
    .set('x-role', 'MEMBER')
    .send({ name: 'Dash rotacao', brandId });

  await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/publish`)
    .set('x-role', 'MEMBER')
    .send({ versionId: createRes.body.latestVersion.id });

  const firstShare = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/public-share`)
    .set('x-role', 'MEMBER');
  assert.equal(firstShare.statusCode, 201);

  const rotateRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/public-share/rotate`)
    .set('x-role', 'MEMBER');

  assert.equal(rotateRes.statusCode, 201);
  assert.equal(rotateRes.body.status, 'ACTIVE');
  assert.equal(state.publicShares.length, 2);
  assert.equal(
    state.publicShares.filter((item) => item.status === 'ACTIVE').length,
    1,
  );
  assert.equal(
    state.publicShares.filter((item) => item.status === 'REVOKED').length,
    1,
  );
});

test('dashboard not published cannot create public share', async () => {
  const { app, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-1' });

  const createRes = await request(app)
    .post('/api/reports/dashboards')
    .set('x-role', 'MEMBER')
    .send({ name: 'Rascunho', brandId });

  const shareRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/public-share`)
    .set('x-role', 'MEMBER');

  assert.equal(shareRes.statusCode, 400);
  assert.equal(shareRes.body.error.code, 'DASHBOARD_NOT_PUBLISHED');
});

test('public share is blocked when dashboard health is BLOCKED by invalid widget query', async () => {
  const { app, state } = buildApp();
  const brandId = randomUUID();
  state.clients.push({ id: brandId, tenantId: 'tenant-1' });

  const createRes = await request(app)
    .post('/api/reports/dashboards')
    .set('x-role', 'MEMBER')
    .send({ name: 'Bloqueado', brandId });

  await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/publish`)
    .set('x-role', 'MEMBER')
    .send({ versionId: createRes.body.latestVersion.id });

  const publishedVersion = state.versions.find(
    (version) => version.id === createRes.body.latestVersion.id,
  );
  publishedVersion.layoutJson = {
    ...buildLayout(),
    pages: [
      {
        id: randomUUID(),
        name: 'Página 1',
        widgets: [
          {
            id: randomUUID(),
            type: 'bar',
            title: 'Meta Ads',
            layout: { x: 0, y: 0, w: 6, h: 4, minW: 2, minH: 2 },
            query: {
              dimensions: [],
              metrics: ['spend'],
              filters: [],
            },
            viz: {},
          },
        ],
      },
    ],
  };

  const shareRes = await request(app)
    .post(`/api/reports/dashboards/${createRes.body.id}/public-share`)
    .set('x-role', 'MEMBER');

  assert.equal(shareRes.statusCode, 422);
  assert.equal(shareRes.body?.error?.code, 'DASHBOARD_BLOCKED');
});
