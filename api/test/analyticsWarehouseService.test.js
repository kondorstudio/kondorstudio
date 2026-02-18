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

function buildInMemoryDb() {
  const providers = new Map();
  const metrics = new Map();
  const dimensions = new Map();
  const facts = [];

  return {
    dimProvider: {
      findMany: async ({ where }) => {
        const keys = where?.providerKey?.in || [];
        return keys
          .filter((key) => providers.has(key))
          .map((key) => ({ id: providers.get(key).id, providerKey: key }));
      },
      createMany: async ({ data }) => {
        (data || []).forEach((item) => {
          if (!providers.has(item.providerKey)) {
            providers.set(item.providerKey, {
              id: `prov_${providers.size + 1}`,
              providerKey: item.providerKey,
            });
          }
        });
        return { count: data.length };
      },
    },
    dimMetric: {
      findMany: async ({ where }) => {
        const keys = where?.metricKey?.in || [];
        return keys
          .filter((key) => metrics.has(key))
          .map((key) => ({ id: metrics.get(key).id, metricKey: key }));
      },
      createMany: async ({ data }) => {
        (data || []).forEach((item) => {
          if (!metrics.has(item.metricKey)) {
            metrics.set(item.metricKey, {
              id: `met_${metrics.size + 1}`,
              metricKey: item.metricKey,
            });
          }
        });
        return { count: data.length };
      },
    },
    dimDimensionValue: {
      findMany: async ({ where }) => {
        const keys = where?.dimensionKey?.in || [];
        return keys
          .filter((key) => dimensions.has(key))
          .map((key) => ({ id: dimensions.get(key).id, dimensionKey: key }));
      },
      createMany: async ({ data }) => {
        (data || []).forEach((item) => {
          if (!dimensions.has(item.dimensionKey)) {
            dimensions.set(item.dimensionKey, {
              id: `dim_${dimensions.size + 1}`,
              dimensionKey: item.dimensionKey,
            });
          }
        });
        return { count: data.length };
      },
    },
    factDailyMetric: {
      upsert: async ({ where, create, update }) => {
        facts.push({ where, create, update });
        return { id: `fact_${facts.length}` };
      },
    },
    __facts: facts,
  };
}

test('buildDimensionKey is deterministic and uses default key for empty payload', () => {
  process.env.NODE_ENV = 'development';
  mockModule('../src/prisma', { prisma: {} });
  resetModule('../src/services/analyticsWarehouseService');
  const service = require('../src/services/analyticsWarehouseService');

  const a = service.buildDimensionKey({ campaignId: '1', accountId: '2' });
  const b = service.buildDimensionKey({ accountId: '2', campaignId: '1' });
  assert.equal(a, b);
  assert.equal(service.buildDimensionKey({}), service.DEFAULT_DIMENSION_KEY);
});

test('upsertConnectorFacts creates dimensions and upserts fact rows', async () => {
  process.env.NODE_ENV = 'development';
  const db = buildInMemoryDb();

  mockModule('../src/prisma', { prisma: db });
  resetModule('../src/services/analyticsWarehouseService');
  const service = require('../src/services/analyticsWarehouseService');

  const result = await service.upsertConnectorFacts({
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    provider: 'GA4',
    facts: [
      {
        date: '2026-02-18',
        metric: 'sessions',
        value: 12,
        dimensions: { accountId: 'prop_1' },
      },
      {
        date: '2026-02-18',
        metric: 'leads',
        value: 3,
        dimensions: { accountId: 'prop_1' },
      },
    ],
  }, { db });

  assert.equal(result.ok, true);
  assert.equal(result.written, 2);
  assert.equal(db.__facts.length, 2);
});

test('mapLegacyFactRowsToConnectorFacts expands each legacy row by metric columns', () => {
  process.env.NODE_ENV = 'development';
  mockModule('../src/prisma', { prisma: {} });
  resetModule('../src/services/analyticsWarehouseService');
  const service = require('../src/services/analyticsWarehouseService');

  const facts = service.mapLegacyFactRowsToConnectorFacts([
    {
      id: 'legacy-1',
      tenantId: 'tenant-1',
      brandId: 'brand-1',
      platform: 'GA4',
      date: '2026-02-18',
      accountId: '123',
      sessions: 10,
      leads: 2,
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      currency: 'BRL',
    },
  ]);

  assert.ok(Array.isArray(facts));
  assert.equal(facts.length, service.LEGACY_METRIC_KEYS.length);
  assert.equal(facts[0].sourceFactId, 'legacy-1');
});
