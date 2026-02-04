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

function buildExportServiceHarness(options = {}) {
  const createCalls = [];
  const updateCalls = [];
  const activeConnections = Array.isArray(options.activeConnections)
    ? options.activeConnections
    : [];
  const defaultLayout = {
    theme: {
      mode: 'light',
      brandColor: '#F59E0B',
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
    pages: [
      {
        id: 'a3f2a8ee-0f0f-4f34-84af-9d53d3ed4d73',
        name: 'Pagina 1',
        widgets: [
          {
            id: 'f95f9e5f-af6f-4fdb-b7e2-a93e7992fd2d',
            type: 'text',
            title: 'Cabecalho',
            layout: { x: 0, y: 0, w: 12, h: 2, minW: 2, minH: 2 },
            content: { text: 'Texto', format: 'plain' },
            viz: {},
          },
        ],
      },
    ],
  };
  const dashboard =
    options.dashboard ||
    {
      id: 'dashboard-1',
      tenantId: 'tenant-1',
      brandId: 'brand-1',
      name: 'Dashboard Exportavel',
      status: 'PUBLISHED',
      publishedVersionId: 'version-1',
      publishedVersion: { id: 'version-1', layoutJson: defaultLayout },
    };

  mockModule('../src/prisma', {
    prisma: {
      reportDashboard: {
        findFirst: async () => dashboard,
      },
      reportDashboardExport: {
        create: async ({ data }) => {
          createCalls.push(data);
          return {
            id: 'export-temp-1',
            ...data,
            meta: data.meta || null,
          };
        },
        update: async ({ data }) => {
          updateCalls.push(data);
          return {
            id: 'export-temp-1',
            ...data,
          };
        },
      },
      brandSourceConnection: {
        findMany: async ({ where }) =>
          activeConnections
            .filter((item) => {
              if (item.tenantId !== where.tenantId) return false;
              if (item.brandId !== where.brandId) return false;
              if (item.status !== where.status) return false;
              return true;
            })
            .map((item) => ({ platform: item.platform })),
      },
      upload: {
        create: async () => ({ id: 'upload-1' }),
      },
    },
  });

  mockModule('../src/services/uploadsService', {
    uploadBuffer: async () => ({ key: 'key', url: 'https://files.example.com/file.pdf' }),
  });

  const page = {
    goto: async () => {},
    waitForFunction: async () => {},
    waitForTimeout: async () => {},
    pdf: async () => {
      if (options.failPdfGeneration) throw new Error('pdf-fail');
      return Buffer.from('pdf-bytes');
    },
    close: async () => {},
  };
  const browser = {
    newPage: async () => page,
    close: async () => {},
  };
  const playwrightResolved = require.resolve('playwright');
  const previousPlaywright = require.cache[playwrightResolved];
  require.cache[playwrightResolved] = {
    exports: {
      chromium: {
        launch: async () => browser,
      },
    },
  };

  resetModule('../src/modules/reports/dashboardHealth.service');
  resetModule('../src/modules/reports/exports.service');
  const service = require('../src/modules/reports/exports.service');

  function restore() {
    if (previousPlaywright) {
      require.cache[playwrightResolved] = previousPlaywright;
    } else {
      delete require.cache[playwrightResolved];
    }
    resetModule('../src/modules/reports/dashboardHealth.service');
    resetModule('../src/modules/reports/exports.service');
  }

  return { service, createCalls, updateCalls, restore };
}

function buildApp(options = {}) {
  const userRole = options.userRole || 'ADMIN';
  const serviceMock =
    options.serviceMock ||
    {
      createDashboardExport: async () => ({
        export: { id: 'export-1', status: 'READY' },
        url: 'https://files.example.com/export.pdf',
      }),
      exportDashboardPdf: async () => ({
        buffer: Buffer.from('pdf-bytes'),
        filename: 'Relatorio-Teste.pdf',
      }),
    };

  mockModule('../src/prisma', { prisma: {} });
  mockModule('../src/middleware/auth', (req, _res, next) => {
    req.user = { id: 'user-1', role: userRole, tenantId: 'tenant-1' };
    req.tenantId = 'tenant-1';
    next();
  });
  mockModule('../src/middleware/tenant', (req, _res, next) => {
    req.tenantId = req.tenantId || 'tenant-1';
    req.db = {};
    next();
  });
  mockModule('../src/modules/reports/exports.service', serviceMock);

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

test('export-pdf returns a downloadable pdf stream', async () => {
  let calledWith = null;
  const { app } = buildApp({
    serviceMock: {
      createDashboardExport: async () => ({
        export: { id: 'export-1', status: 'READY' },
        url: 'https://files.example.com/export.pdf',
      }),
      exportDashboardPdf: async (...args) => {
        calledWith = args;
        return {
          buffer: Buffer.from('pdf-binary'),
          filename: 'Relatorio-Teste.pdf',
        };
      },
    },
  });

  const payload = {
    filters: {
      dateRange: {
        preset: 'last_30_days',
      },
      platforms: ['META_ADS'],
    },
    page: 'current',
    orientation: 'landscape',
  };
  const res = await request(app)
    .post('/api/reports/dashboards/dashboard-1/export-pdf')
    .send(payload);

  assert.equal(res.status, 200);
  assert.match(String(res.headers['content-type'] || ''), /application\/pdf/);
  assert.match(
    String(res.headers['content-disposition'] || ''),
    /attachment; filename\*=UTF-8''Relatorio-Teste\.pdf/,
  );
  assert.equal(Buffer.from(res.body).toString('utf8'), 'pdf-binary');
  assert.deepEqual(calledWith, [
    'tenant-1',
    'user-1',
    'dashboard-1',
    payload,
  ]);
});

test('export-pdf validates payload and returns 400 for invalid body', async () => {
  const { app } = buildApp();
  const res = await request(app)
    .post('/api/reports/dashboards/dashboard-1/export-pdf')
    .send({
      page: 'invalid-page',
    });

  assert.equal(res.status, 400);
  assert.equal(res.body?.error?.code, 'VALIDATION_ERROR');
});

test('export-pdf requires editor permissions', async () => {
  const { app } = buildApp({ userRole: 'CLIENT' });
  const res = await request(app)
    .post('/api/reports/dashboards/dashboard-1/export-pdf')
    .send({});

  assert.equal(res.status, 403);
});

test('export-pdf returns 422 when dashboard is invalid', async () => {
  const { app } = buildApp({
    serviceMock: {
      createDashboardExport: async () => ({
        export: { id: 'export-1', status: 'READY' },
        url: 'https://files.example.com/export.pdf',
      }),
      exportDashboardPdf: async () => {
        const err = new Error(
          'Nao e possivel exportar este relatorio pois existem widgets com dados invalidos ou conexoes pendentes.',
        );
        err.code = 'DASHBOARD_INVALID';
        err.status = 422;
        throw err;
      },
    },
  });

  const res = await request(app)
    .post('/api/reports/dashboards/dashboard-1/export-pdf')
    .send({});

  assert.equal(res.status, 422);
  assert.equal(res.body?.error?.code, 'DASHBOARD_INVALID');
});

test('exportDashboardPdf persists temporary token expiry and clears token after success', async () => {
  const { service, createCalls, updateCalls, restore } = buildExportServiceHarness();
  try {
    const result = await service.exportDashboardPdf(
      'tenant-1',
      'user-1',
      'dashboard-1',
      { page: 'current', orientation: 'portrait' },
    );

    assert.equal(Buffer.from(result.buffer).toString('utf8'), 'pdf-bytes');
    assert.equal(createCalls.length, 1);
    assert.ok(createCalls[0].publicTokenHash);
    assert.ok(createCalls[0].publicTokenExpiresAt instanceof Date);

    const finalUpdate = updateCalls[updateCalls.length - 1];
    assert.equal(finalUpdate.status, 'READY');
    assert.equal(finalUpdate.publicTokenHash, null);
    assert.equal(finalUpdate.publicTokenExpiresAt, null);
    assert.ok(finalUpdate.publicTokenUsedAt instanceof Date);
  } finally {
    restore();
  }
});

test('exportDashboardPdf invalidates temporary token when generation fails', async () => {
  const { service, createCalls, updateCalls, restore } = buildExportServiceHarness({
    failPdfGeneration: true,
  });
  try {
    await assert.rejects(
      () =>
        service.exportDashboardPdf('tenant-1', 'user-1', 'dashboard-1', {
          page: 'current',
          orientation: 'portrait',
        }),
      /pdf-fail/,
    );

    assert.equal(createCalls.length, 1);
    const finalUpdate = updateCalls[updateCalls.length - 1];
    assert.equal(finalUpdate.status, 'ERROR');
    assert.equal(finalUpdate.publicTokenHash, null);
    assert.equal(finalUpdate.publicTokenExpiresAt, null);
    assert.ok(finalUpdate.publicTokenUsedAt instanceof Date);
  } finally {
    restore();
  }
});

test('exportDashboardPdf blocks when health status is BLOCKED', async () => {
  const blockedDashboard = {
    id: 'dashboard-1',
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    name: 'Dashboard Bloqueado',
    status: 'PUBLISHED',
    publishedVersionId: 'version-1',
    publishedVersion: {
      id: 'version-1',
      layoutJson: {
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
            id: '74d19647-13f3-4c6f-b0d4-fe1779f7043c',
            name: 'Pagina 1',
            widgets: [
              {
                id: '190f521b-98da-4f72-9499-92b41235f6d2',
                type: 'bar',
                title: 'Meta Ads',
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
      },
    },
  };
  const { service, createCalls, restore } = buildExportServiceHarness({
    dashboard: blockedDashboard,
  });
  try {
    await assert.rejects(
      () =>
        service.exportDashboardPdf('tenant-1', 'user-1', 'dashboard-1', {
          page: 'current',
          orientation: 'portrait',
        }),
      (error) => {
        assert.equal(error?.code, 'DASHBOARD_INVALID');
        assert.equal(error?.status, 422);
        assert.equal(error?.details?.status, 'BLOCKED');
        return true;
      },
    );
    assert.equal(createCalls.length, 0);
  } finally {
    restore();
  }
});
