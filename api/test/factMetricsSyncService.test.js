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

function delay(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setupService({ hasFacts = true, metricsRows = [], fetchDelayMs = 0 } = {}) {
  const calls = {
    fetch: 0,
    count: 0,
    upsertCalls: 0,
    upsertRows: 0,
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
    },
  };

  mockModule('../src/prisma', { prisma });
  mockModule('../src/services/metaMetricsService', {
    fetchAccountMetrics: async () => {
      calls.fetch += 1;
      await delay(fetchDelayMs);
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
  mockModule('../src/services/factMetricsRepository', {
    upsertFactMetricsDailyRows: async (rows) => {
      calls.upsertCalls += 1;
      calls.upsertRows += Array.isArray(rows) ? rows.length : 0;
      return { ok: true, rows: Array.isArray(rows) ? rows.length : 0 };
    },
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
  assert.equal(calls.upsertCalls, 0);
  assert.equal(calls.upsertRows, 0);
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
  assert.equal(calls.upsertCalls, 1);
  assert.equal(calls.upsertRows, 1);
});

test('ensureFactMetrics deduplicates concurrent sync for same connection/range', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const { service, calls } = setupService({
    hasFacts: false,
    fetchDelayMs: 50,
    metricsRows: [{ name: 'impressions', value: 42, collectedAt: today }],
  });

  const payload = {
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    dateRange: { start: today, end: today },
    metrics: ['impressions'],
    filters: [],
    requiredPlatforms: ['META_ADS'],
  };

  await Promise.all([
    service.ensureFactMetrics(payload),
    service.ensureFactMetrics(payload),
    service.ensureFactMetrics(payload),
  ]);

  assert.equal(calls.count, 1);
  assert.equal(calls.fetch, 1);
  assert.equal(calls.upsertCalls, 1);
  assert.equal(calls.upsertRows, 1);
});
