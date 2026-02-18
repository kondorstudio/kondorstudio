const test = require('node:test');
const assert = require('node:assert/strict');

function mockModule(path, exports) {
  const resolved = require.resolve(path);
  require.cache[resolved] = { exports };
}

function resetModule(path) {
  const resolved = require.resolve(path);
  delete require.cache[resolved];
}

test('hashParams is stable regardless of key order', () => {
  process.env.NODE_ENV = 'development';
  mockModule('../src/prisma', { prisma: {} });
  resetModule('../src/services/rawApiResponseService');
  const service = require('../src/services/rawApiResponseService');

  const a = service.hashParams({ b: 2, a: 1, nested: { y: 2, x: 1 } });
  const b = service.hashParams({ nested: { x: 1, y: 2 }, a: 1, b: 2 });
  assert.equal(a, b);
});

test('appendRawApiResponse persists normalized payload and retention', async () => {
  process.env.NODE_ENV = 'development';

  let createdData = null;
  mockModule('../src/prisma', {
    prisma: {
      rawApiResponse: {
        create: async ({ data }) => {
          createdData = data;
          return { id: 'raw-1' };
        },
      },
    },
  });

  resetModule('../src/services/rawApiResponseService');
  const service = require('../src/services/rawApiResponseService');

  const result = await service.appendRawApiResponse({
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    provider: 'ga4',
    endpoint: '/runReport',
    params: { propertyId: '123', q: { b: 2, a: 1 } },
    payload: { rows: [{ metric: 10n }] },
    httpStatus: 200,
    retentionDays: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.id, 'raw-1');
  assert.equal(createdData.provider, 'GA4');
  assert.equal(createdData.endpoint, '/runReport');
  assert.equal(createdData.httpStatus, 200);
  assert.equal(typeof createdData.paramsHash, 'string');
  assert.equal(createdData.paramsHash.length, 64);
  assert.ok(createdData.retentionUntil instanceof Date);
  assert.equal(createdData.payload.rows[0].metric, '10');
});

test('purgeExpiredRawApiResponses delegates deleteMany filter by retentionUntil', async () => {
  process.env.NODE_ENV = 'development';

  let whereArg = null;
  mockModule('../src/prisma', {
    prisma: {
      rawApiResponse: {
        create: async () => ({ id: 'unused' }),
        deleteMany: async ({ where }) => {
          whereArg = where;
          return { count: 7 };
        },
      },
    },
  });

  resetModule('../src/services/rawApiResponseService');
  const service = require('../src/services/rawApiResponseService');

  const result = await service.purgeExpiredRawApiResponses({ now: '2026-02-18T00:00:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 7);
  assert.ok(whereArg);
  assert.ok(whereArg.retentionUntil);
  assert.equal(whereArg.retentionUntil.not, null);
});
