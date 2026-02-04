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

function buildCatalog(keys) {
  return keys.map((key) => {
    if (['ctr', 'cpc', 'cpm', 'cpa', 'roas'].includes(key)) {
      const requiredFields = {
        ctr: ['clicks', 'impressions'],
        cpc: ['spend', 'clicks'],
        cpm: ['spend', 'impressions'],
        cpa: ['spend', 'conversions'],
        roas: ['revenue', 'spend'],
      };
      return {
        key,
        label: key.toUpperCase(),
        format: 'PERCENT',
        formula: key,
        requiredFields: requiredFields[key],
      };
    }

    return {
      key,
      label: key.toUpperCase(),
      format: 'NUMBER',
      formula: null,
      requiredFields: null,
    };
  });
}

function buildRows(count, startDate = '2026-01-01') {
  const rows = [];
  const base = new Date(startDate);
  for (let i = 0; i < count; i += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() + i);
    rows.push({
      date: date.toISOString().slice(0, 10),
      spend: String(10 + i),
      impressions: '100',
      clicks: '10',
    });
  }
  return rows;
}

function paginateRows(rows, params) {
  if (!params.length) return rows;
  const limitPlus = params[params.length - 2];
  const offset = params[params.length - 1];
  if (typeof limitPlus !== 'number' || typeof offset !== 'number') {
    return rows;
  }
  return rows.slice(offset, offset + limitPlus);
}

function buildMetricsApp({
  rows = buildRows(60),
  totals,
  compareRows,
  compareTotals,
  connections = [{ platform: 'META_ADS' }],
} = {}) {
  let lastGroupQuery = '';
  let groupByCalls = 0;
  let totalsCalls = 0;
  const totalsRow =
    totals ||
    rows.reduce(
      (acc, row) => {
        acc.spend += Number(row.spend || 0);
        acc.impressions += Number(row.impressions || 0);
        acc.clicks += Number(row.clicks || 0);
        return acc;
      },
      { spend: 0, impressions: 0, clicks: 0 },
    );

  const fakePrisma = {
    client: {
      findFirst: async ({ where }) => (where?.id ? { id: where.id } : null),
    },
    brandSourceConnection: {
      findMany: async ({ where }) => {
        const platforms = where?.platform?.in || [];
        return connections.filter((item) => platforms.includes(item.platform));
      },
    },
    metricsCatalog: {
      findMany: async ({ where }) => buildCatalog(where.key.in),
    },
    $queryRawUnsafe: async (sql, ...params) => {
      if (sql.includes('GROUP BY')) {
        groupByCalls += 1;
        lastGroupQuery = sql;
        const source = groupByCalls === 1 ? rows : compareRows || rows;
        return paginateRows(source, params);
      }
      totalsCalls += 1;
      const source =
        totalsCalls === 1 ? totalsRow : compareTotals || totalsRow;
      return [source];
    },
  };

  mockModule('../src/prisma', { prisma: fakePrisma });
  resetModule('../src/modules/metrics/metrics.service');
  resetModule('../src/modules/metrics/metrics.controller');
  resetModule('../src/modules/metrics/metrics.routes');

  const router = require('../src/modules/metrics/metrics.routes');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const tenantId = req.headers['x-tenant-id'] || 'tenant-1';
    req.user = { id: 'user-1', tenantId, role: 'ADMIN' };
    req.tenantId = tenantId;
    next();
  });
  app.use('/metrics', router);

  return {
    app,
    getLastGroupQuery: () => lastGroupQuery,
  };
}

test('metrics query computes derived totals from base sums', async () => {
  const rows = [
    {
      date: '2026-01-01',
      impressions: '100',
      clicks: '10',
      spend: '50',
      revenue: '200',
      conversions: '5',
    },
    {
      date: '2026-01-02',
      impressions: '100',
      clicks: '20',
      spend: '50',
      revenue: '100',
      conversions: '5',
    },
  ];
  const totals = {
    impressions: '200',
    clicks: '30',
    spend: '100',
    revenue: '300',
    conversions: '10',
  };

  const fakePrisma = {
    client: {
      findFirst: async () => ({ id: 'brand-1' }),
    },
    brandSourceConnection: {
      findMany: async () => [{ platform: 'META_ADS' }],
    },
    metricsCatalog: {
      findMany: async ({ where }) => buildCatalog(where.key.in),
    },
    $queryRawUnsafe: async (sql) => {
      if (sql.includes('GROUP BY')) return rows;
      return [totals];
    },
  };

  mockModule('../src/prisma', { prisma: fakePrisma });
  resetModule('../src/modules/metrics/metrics.service');
  const service = require('../src/modules/metrics/metrics.service');

  const result = await service.queryMetrics('tenant-1', {
    brandId: 'brand-1',
    dateRange: { start: '2026-01-01', end: '2026-01-02' },
    dimensions: ['date'],
    metrics: ['impressions', 'clicks', 'spend', 'revenue', 'ctr', 'roas'],
    filters: [],
    compareTo: null,
  });

  assert.equal(result.rows.length, 2);
  assert.ok(Math.abs(result.rows[0].ctr - 0.1) < 1e-6);
  assert.ok(Math.abs(result.rows[1].ctr - 0.2) < 1e-6);
  assert.ok(Math.abs(result.totals.ctr - 0.15) < 1e-6);
  assert.ok(Math.abs(result.totals.roas - 3) < 1e-6);
});

test('metrics query builds filter placeholders for eq/in', () => {
  resetModule('../src/modules/metrics/metrics.service');
  const service = require('../src/modules/metrics/metrics.service');

  const { whereSql, params } = service.buildWhereClause({
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    dateFrom: '2026-01-01',
    dateTo: '2026-01-31',
    filters: [
      { field: 'account_id', op: 'eq', value: 'acc-1' },
      { field: 'platform', op: 'in', value: ['META_ADS', 'GOOGLE_ADS'] },
    ],
  });

  assert.ok(whereSql.includes('"accountId" = $5'));
  assert.ok(whereSql.includes('"platform" IN ($6, $7)'));
  assert.equal(params.length, 7);
  assert.equal(params[4], 'acc-1');
  assert.equal(params[5], 'META_ADS');
  assert.equal(params[6], 'GOOGLE_ADS');
});

test('metrics query paginates rows and keeps totals for full dataset', async () => {
  const rows = [
    { date: '2026-01-01', impressions: '100', clicks: '10', spend: '50' },
    { date: '2026-01-02', impressions: '100', clicks: '10', spend: '50' },
    { date: '2026-01-03', impressions: '100', clicks: '10', spend: '50' },
  ];
  const totals = {
    impressions: '300',
    clicks: '30',
    spend: '150',
  };

  const fakePrisma = {
    client: {
      findFirst: async () => ({ id: 'brand-1' }),
    },
    brandSourceConnection: {
      findMany: async () => [{ platform: 'META_ADS' }],
    },
    metricsCatalog: {
      findMany: async ({ where }) => buildCatalog(where.key.in),
    },
    $queryRawUnsafe: async (sql) => {
      if (sql.includes('GROUP BY')) return rows;
      return [totals];
    },
  };

  mockModule('../src/prisma', { prisma: fakePrisma });
  resetModule('../src/modules/metrics/metrics.service');
  const service = require('../src/modules/metrics/metrics.service');

  const result = await service.queryMetrics('tenant-1', {
    brandId: 'brand-1',
    dateRange: { start: '2026-01-01', end: '2026-01-03' },
    dimensions: ['date'],
    metrics: ['impressions', 'clicks', 'spend', 'ctr'],
    filters: [],
    pagination: { limit: 2, offset: 0 },
  });

  assert.equal(result.rows.length, 2);
  assert.equal(result.pageInfo.limit, 2);
  assert.equal(result.pageInfo.offset, 0);
  assert.equal(result.pageInfo.hasMore, true);
  assert.equal(result.totals.impressions, 300);
  assert.ok(Math.abs(result.totals.ctr - 0.1) < 1e-6);
});

test('metrics query applies sort whitelist (asc/desc)', async () => {
  const rows = [{ date: '2026-01-01', spend: '50' }];
  const totals = { spend: '50' };
  const queries = [];

  const fakePrisma = {
    client: {
      findFirst: async () => ({ id: 'brand-1' }),
    },
    brandSourceConnection: {
      findMany: async () => [{ platform: 'META_ADS' }],
    },
    metricsCatalog: {
      findMany: async ({ where }) => buildCatalog(where.key.in),
    },
    $queryRawUnsafe: async (sql) => {
      queries.push(sql);
      if (sql.includes('GROUP BY')) return rows;
      return [totals];
    },
  };

  mockModule('../src/prisma', { prisma: fakePrisma });
  resetModule('../src/modules/metrics/metrics.service');
  const service = require('../src/modules/metrics/metrics.service');

  await service.queryMetrics('tenant-1', {
    brandId: 'brand-1',
    dateRange: { start: '2026-01-01', end: '2026-01-01' },
    dimensions: ['date'],
    metrics: ['spend'],
    filters: [],
    sort: { field: 'spend', direction: 'desc' },
  });

  assert.ok(queries[0].includes('ORDER BY "spend" DESC'));

  queries.length = 0;

  await service.queryMetrics('tenant-1', {
    brandId: 'brand-1',
    dateRange: { start: '2026-01-01', end: '2026-01-01' },
    dimensions: ['date'],
    metrics: ['spend'],
    filters: [],
    sort: { field: 'date', direction: 'asc' },
  });

  assert.ok(queries[0].includes('ORDER BY "date" ASC'));
});

test('compareTo previous_period paginates compare rows', async () => {
  const baseRows = [
    { date: '2026-01-02', spend: '10' },
    { date: '2026-01-03', spend: '20' },
  ];
  const compareRows = [
    { date: '2026-01-01', spend: '5' },
    { date: '2025-12-31', spend: '4' },
  ];
  const totals = { spend: '30' };
  const compareTotals = { spend: '9' };
  let call = 0;

  const fakePrisma = {
    client: {
      findFirst: async () => ({ id: 'brand-1' }),
    },
    brandSourceConnection: {
      findMany: async () => [{ platform: 'META_ADS' }],
    },
    metricsCatalog: {
      findMany: async ({ where }) => buildCatalog(where.key.in),
    },
    $queryRawUnsafe: async (sql) => {
      call += 1;
      if (sql.includes('GROUP BY')) {
        return call === 1 ? baseRows : compareRows;
      }
      return call === 2 ? [totals] : [compareTotals];
    },
  };

  mockModule('../src/prisma', { prisma: fakePrisma });
  resetModule('../src/modules/metrics/metrics.service');
  const service = require('../src/modules/metrics/metrics.service');

  const result = await service.queryMetrics('tenant-1', {
    brandId: 'brand-1',
    dateRange: { start: '2026-01-02', end: '2026-01-03' },
    dimensions: ['date'],
    metrics: ['spend'],
    filters: [],
    compareTo: { mode: 'previous_period' },
    pagination: { limit: 1, offset: 0 },
  });

  assert.equal(result.compare.rows.length, 1);
  assert.equal(result.compare.pageInfo.hasMore, true);
});

test('compare range previous_period matches length', () => {
  resetModule('../src/modules/metrics/metrics.service');
  const service = require('../src/modules/metrics/metrics.service');

  const range = service.buildCompareRange('2026-01-10', '2026-01-19', 'previous_period');
  assert.equal(range.start, '2025-12-31');
  assert.equal(range.end, '2026-01-09');
});

test('compare range previous_year shifts by one year', () => {
  resetModule('../src/modules/metrics/metrics.service');
  const service = require('../src/modules/metrics/metrics.service');

  const range = service.buildCompareRange('2026-02-01', '2026-02-28', 'previous_year');
  assert.equal(range.start, '2025-02-01');
  assert.equal(range.end, '2025-02-28');
});

test('metrics query rejects tenantId mismatch', async () => {
  const { app } = buildMetricsApp();
  const brandId = randomUUID();
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();

  const res = await request(app)
    .post('/metrics/query')
    .set('x-tenant-id', tenantId)
    .send({
      tenantId: otherTenantId,
      brandId,
      dateRange: { start: '2026-01-01', end: '2026-01-02' },
      dimensions: [],
      metrics: ['spend'],
      filters: [],
    });

  assert.equal(res.status, 403);
  assert.equal(res.body?.error?.code, 'TENANT_MISMATCH');
});

test('metrics query does not enforce brand connection checks', async () => {
  const { app } = buildMetricsApp({ connections: [] });
  const brandId = randomUUID();

  const res = await request(app)
    .post('/metrics/query')
    .set('x-tenant-id', 'tenant-1')
    .send({
      brandId,
      dateRange: { start: '2026-01-01', end: '2026-01-02' },
      dimensions: [],
      metrics: ['spend'],
      filters: [],
    });

  assert.equal(res.status, 200);
});

test('metrics query allows when GA4 connection exists', async () => {
  const { app } = buildMetricsApp({ connections: [{ platform: 'GA4' }] });
  const brandId = randomUUID();

  const res = await request(app)
    .post('/metrics/query')
    .set('x-tenant-id', 'tenant-1')
    .send({
      brandId,
      dateRange: { start: '2026-01-01', end: '2026-01-02' },
      dimensions: [],
      metrics: ['sessions'],
      filters: [],
    });

  assert.equal(res.status, 200);
});

test('metrics query rejects invalid sort field', async () => {
  const { app } = buildMetricsApp();
  const brandId = randomUUID();

  const res = await request(app)
    .post('/metrics/query')
    .send({
      brandId,
      dateRange: { start: '2026-01-01', end: '2026-01-02' },
      dimensions: ['date'],
      metrics: ['spend'],
      filters: [],
      sort: { field: 'invalid_field', direction: 'asc' },
    });

  assert.equal(res.status, 400);
  assert.equal(res.body?.error?.code, 'INVALID_SORT_FIELD');
});

test('metrics query accepts valid sort field', async () => {
  const { app, getLastGroupQuery } = buildMetricsApp();
  const brandId = randomUUID();

  const res = await request(app)
    .post('/metrics/query')
    .send({
      brandId,
      dateRange: { start: '2026-01-01', end: '2026-01-02' },
      dimensions: ['date'],
      metrics: ['spend'],
      filters: [],
      sort: { field: 'spend', direction: 'desc' },
    });

  assert.equal(res.status, 200);
  assert.ok(getLastGroupQuery().includes('ORDER BY "spend" DESC'));
});

test('metrics totals stay stable across pagination offsets', async () => {
  const { app } = buildMetricsApp();
  const brandId = randomUUID();

  const body = {
    brandId,
    dateRange: { start: '2026-01-01', end: '2026-03-01' },
    dimensions: ['date'],
    metrics: ['spend'],
    filters: [],
  };

  const first = await request(app)
    .post('/metrics/query')
    .send({ ...body, pagination: { limit: 25, offset: 0 } });

  const second = await request(app)
    .post('/metrics/query')
    .send({ ...body, pagination: { limit: 25, offset: 25 } });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.totals.spend, second.body.totals.spend);
  assert.notEqual(first.body.rows[0]?.date, second.body.rows[0]?.date);
});

test('metrics query honors row cap limit with pagination', async () => {
  const { app } = buildMetricsApp({ rows: buildRows(80, '2026-01-01') });
  const brandId = randomUUID();

  const res = await request(app)
    .post('/metrics/query')
    .send({
      brandId,
      dateRange: { start: '2026-01-01', end: '2026-03-31' },
      dimensions: ['date'],
      metrics: ['spend'],
      filters: [],
      limit: 40,
      pagination: { limit: 25, offset: 25 },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.rows.length, 15);
  assert.equal(res.body.pageInfo.limit, 25);
  assert.equal(res.body.pageInfo.offset, 25);
  assert.equal(res.body.pageInfo.hasMore, false);
});

test('metrics compare respects pagination and keeps totals', async () => {
  const { app } = buildMetricsApp({
    rows: buildRows(10, '2026-01-01'),
    compareRows: buildRows(10, '2025-12-20'),
  });
  const brandId = randomUUID();

  const res = await request(app)
    .post('/metrics/query')
    .send({
      brandId,
      dateRange: { start: '2026-01-01', end: '2026-01-10' },
      dimensions: ['date'],
      metrics: ['spend'],
      filters: [],
      compareTo: { mode: 'previous_period' },
      pagination: { limit: 2, offset: 0 },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.compare.rows.length, 2);
  assert.equal(typeof res.body.compare.totals.spend, 'number');
  assert.equal(res.body.compare.pageInfo.hasMore, true);
});
