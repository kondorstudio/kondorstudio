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

test.afterEach(() => {
  [
    '../src/prisma',
    '../src/services/factMetricsSyncService',
    '../src/services/ga4FactMetricsService',
    '../src/services/brandGa4SettingsService',
    '../src/modules/metrics/metrics.service',
  ].forEach((path) => {
    try {
      resetModule(path);
    } catch (_) {}
  });
});

test('metrics query scopes GA4 by accountId/propertyId and uses canonical fact column names', async () => {
  const queries = [];

  mockModule('../src/services/factMetricsSyncService', {
    ensureFactMetrics: async () => {},
  });
  mockModule('../src/services/ga4FactMetricsService', {
    ensureGa4FactMetrics: async () => {},
  });
  mockModule('../src/services/brandGa4SettingsService', {
    resolveBrandGa4ActivePropertyId: async () => '383124820',
  });

  mockModule('../src/prisma', {
    prisma: {
      client: {
        findFirst: async () => ({ id: 'brand-1' }),
      },
      brandSourceConnection: {
        findMany: async ({ where }) => {
          if (where?.status === 'ACTIVE') {
            return [{ platform: 'GA4', externalAccountId: '383124820' }];
          }
          return [{ platform: 'GA4' }];
        },
      },
      integrationGoogleGa4: {
        findFirst: async () => ({ id: 'ga4-1' }),
      },
      brandGa4Settings: {
        findFirst: async () => ({ timezone: 'UTC', propertyId: '383124820' }),
      },
      metricsCatalog: {
        findMany: async () => [{ key: 'sessions', kind: 'base' }],
      },
      $queryRawUnsafe: async (sql, ...params) => {
        queries.push({ sql, params });
        if (String(sql).includes('GROUP BY')) {
          return [{ date: '2026-01-01', sessions: '10' }];
        }
        return [{ sessions: '10' }];
      },
    },
  });

  const service = require('../src/modules/metrics/metrics.service');

  await service.queryMetrics('tenant-1', {
    brandId: 'brand-1',
    dateRange: { start: '2026-01-01', end: '2026-01-01' },
    dimensions: ['date'],
    metrics: ['sessions'],
    filters: [],
    requiredPlatforms: ['GA4'],
  });

  const groupQuery = queries.find((entry) => String(entry.sql).includes('GROUP BY'));
  assert.ok(groupQuery, 'expected grouped metrics query');
  assert.ok(String(groupQuery.sql).includes('"tenantId" = $1'));
  assert.ok(String(groupQuery.sql).includes('"brandId" = $2'));
  assert.ok(
    String(groupQuery.sql).includes('("platform" <> \'GA4\' OR "accountId" = $5)'),
  );
  assert.equal(String(groupQuery.params[4]), '383124820');
});
