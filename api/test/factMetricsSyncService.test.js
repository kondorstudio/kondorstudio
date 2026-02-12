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

function setupService({ hasFacts = true, metricsRows = [] } = {}) {
  const calls = {
    fetch: 0,
    count: 0,
    deleteMany: 0,
    createManyRows: 0,
  };

  const prisma = {
    brandSourceConnection: {
      findMany: async () => [
        {
          externalAccountId: 'act_123',
          platform: 'META_ADS',
          status: 'ACTIVE',
        },
      ],
    },
    dataSourceConnection: {
      findFirst: async () => ({
        integration: {
          id: 'integration-1',
          settings: {
            accountId: 'act_123',
          },
        },
        meta: {
          currency: 'BRL',
        },
      }),
    },
    factKondorMetricsDaily: {
      count: async () => {
        calls.count += 1;
        return hasFacts ? 1 : 0;
      },
      deleteMany: async () => {
        calls.deleteMany += 1;
      },
      createMany: async ({ data }) => {
        calls.createManyRows += Array.isArray(data) ? data.length : 0;
      },
    },
  };

  mockModule('../src/prisma', { prisma });
  mockModule('../src/services/metaMetricsService', {
    fetchAccountMetrics: async () => {
      calls.fetch += 1;
      return metricsRows;
    },
  });
  mockModule('../src/services/googleAdsMetricsService', {
    fetchAccountMetrics: async () => [],
  });
  mockModule('../src/services/tiktokMetricsService', {
    fetchAccountMetrics: async () => [],
  });
  mockModule('../src/services/linkedinAdsMetricsService', {
    fetchAccountMetrics: async () => [],
  });

  resetModule('../src/services/factMetricsSyncService');
  const service = require('../src/services/factMetricsSyncService');
  return { service, calls };
}

test('ensureFactMetrics skips provider fetch when historical range already has facts', async () => {
  const { service, calls } = setupService({
    hasFacts: true,
    metricsRows: [{ name: 'impressions', value: 10, collectedAt: '2026-01-01' }],
  });

  await service.ensureFactMetrics({
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    dateRange: { start: '2026-01-01', end: '2026-01-31' },
    metrics: ['impressions'],
    filters: [],
    requiredPlatforms: ['META_ADS'],
  });

  assert.equal(calls.count, 1);
  assert.equal(calls.fetch, 0);
  assert.equal(calls.deleteMany, 0);
  assert.equal(calls.createManyRows, 0);
});

test('ensureFactMetrics refreshes open range (today) even when facts already exist', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const { service, calls } = setupService({
    hasFacts: true,
    metricsRows: [{ name: 'impressions', value: 42, collectedAt: today }],
  });

  await service.ensureFactMetrics({
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    dateRange: { start: today, end: today },
    metrics: ['impressions'],
    filters: [],
    requiredPlatforms: ['META_ADS'],
  });

  assert.equal(calls.count, 1);
  assert.equal(calls.fetch, 1);
  assert.equal(calls.deleteMany, 1);
  assert.equal(calls.createManyRows, 1);
});
