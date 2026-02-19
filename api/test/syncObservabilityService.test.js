process.env.NODE_ENV = 'test';

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

test('buildRunWhere normaliza filtros de run', () => {
  resetModule('../src/modules/observability/syncObservability.service');
  const service = require('../src/modules/observability/syncObservability.service');

  const where = service.buildRunWhere({
    tenantId: 'tenant-1',
    provider: 'ga4',
    status: 'failed',
    runType: 'backfill',
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-31T23:59:59.000Z',
  });

  assert.equal(where.tenantId, 'tenant-1');
  assert.equal(where.provider, 'GA4');
  assert.equal(where.status, 'FAILED');
  assert.equal(where.runType, 'BACKFILL');
  assert.ok(where.createdAt.gte instanceof Date);
  assert.ok(where.createdAt.lte instanceof Date);
});

test('getSyncSummary agrega métricas de runs/chunks/errors', async () => {
  mockModule('../src/prisma', {
    prisma: {
      syncRun: {
        count: async () => 7,
        groupBy: async ({ by }) => {
          if (Array.isArray(by) && by.length === 1 && by[0] === 'status') {
            return [
              { status: 'FAILED', _count: { _all: 2 } },
              { status: 'SUCCESS', _count: { _all: 5 } },
            ];
          }
          return [
            { provider: 'GA4', status: 'FAILED', _count: { _all: 1 } },
            { provider: 'GA4', status: 'SUCCESS', _count: { _all: 4 } },
            { provider: 'META', status: 'FAILED', _count: { _all: 1 } },
            { provider: 'META', status: 'SUCCESS', _count: { _all: 1 } },
          ];
        },
        findMany: async () => [
          {
            id: 'run-1',
            tenantId: 'tenant-1',
            brandId: 'brand-1',
            provider: 'GA4',
            runType: 'BACKFILL',
            status: 'FAILED',
            createdAt: new Date(),
            meta: null,
          },
        ],
      },
      syncChunk: {
        count: async ({ where }) => (where.status === 'FAILED' ? 3 : 12),
      },
      syncError: {
        count: async () => 4,
      },
    },
  });

  resetModule('../src/modules/observability/syncObservability.service');
  const service = require('../src/modules/observability/syncObservability.service');

  const result = await service.getSyncSummary({ sinceHours: 24, provider: 'ga4' });

  assert.equal(result.totals.runs, 7);
  assert.equal(result.totals.chunks, 12);
  assert.equal(result.totals.chunksFailed, 3);
  assert.equal(result.totals.errors, 4);
  assert.equal(result.totals.byStatus.FAILED, 2);
  assert.equal(result.totals.byProvider.GA4.SUCCESS, 4);
  assert.equal(result.latestFailures.length, 1);
});
