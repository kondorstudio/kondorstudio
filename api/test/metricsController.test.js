process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { randomUUID } = require('crypto');

function mockModule(path, exports) {
  const resolved = require.resolve(path);
  require.cache[resolved] = { exports };
}

function resetModule(path) {
  const resolved = require.resolve(path);
  delete require.cache[resolved];
}

function buildAppWithService(serviceImpl) {
  mockModule('../src/modules/metrics/metrics.service', serviceImpl);
  resetModule('../src/modules/metrics/metrics.controller');
  resetModule('../src/modules/metrics/metrics.routes');
  const router = require('../src/modules/metrics/metrics.routes');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenantId = randomUUID();
    next();
  });
  app.use('/metrics', router);
  return app;
}

test('metrics controller maps database connection slot pressure to 503', async () => {
  const app = buildAppWithService({
    queryMetrics: async () => {
      throw new Error(
        'FATAL: remaining connection slots are reserved for roles with the SUPERUSER attribute',
      );
    },
    queryMetricsReportei: async () => {
      throw new Error('not used');
    },
  });

  const response = await request(app).post('/metrics/query').send({
    brandId: randomUUID(),
    dateRange: { start: '2026-01-01', end: '2026-01-31' },
    dimensions: [],
    metrics: ['spend'],
    filters: [],
    compareTo: null,
  });

  assert.equal(response.status, 503);
  assert.equal(response.body?.error?.code, 'DB_CONNECTION_LIMIT');
});

test('metrics controller maps prisma P1001 to 503', async () => {
  const app = buildAppWithService({
    queryMetrics: async () => {
      const err = new Error("Can't reach database server at host:5432");
      err.code = 'P1001';
      throw err;
    },
    queryMetricsReportei: async () => {
      throw new Error('not used');
    },
  });

  const response = await request(app).post('/metrics/query').send({
    brandId: randomUUID(),
    dateRange: { start: '2026-01-01', end: '2026-01-31' },
    dimensions: [],
    metrics: ['spend'],
    filters: [],
    compareTo: null,
  });

  assert.equal(response.status, 503);
  assert.equal(response.body?.error?.code, 'DB_UNAVAILABLE');
});

test('metrics controller maps prisma P2024 pool timeout to 503', async () => {
  const app = buildAppWithService({
    queryMetrics: async () => {
      const err = new Error(
        'Timed out fetching a new connection from the connection pool.',
      );
      err.code = 'P2024';
      throw err;
    },
    queryMetricsReportei: async () => {
      throw new Error('not used');
    },
  });

  const response = await request(app).post('/metrics/query').send({
    brandId: randomUUID(),
    dateRange: { start: '2026-01-01', end: '2026-01-31' },
    dimensions: [],
    metrics: ['spend'],
    filters: [],
    compareTo: null,
  });

  assert.equal(response.status, 503);
  assert.equal(response.body?.error?.code, 'DB_POOL_TIMEOUT');
});
