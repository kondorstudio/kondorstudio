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

const MODULES_TO_RESET = [
  '../src/prisma',
  '../src/services/factMetricsSyncService',
  '../src/services/ga4FactMetricsService',
  '../src/services/brandGa4SettingsService',
  '../src/services/connectionStateService',
  '../src/modules/metrics/ga4LiveQuery.service',
  '../src/modules/metrics/metrics.service',
];

test.afterEach(() => {
  MODULES_TO_RESET.forEach((path) => {
    try {
      resetModule(path);
    } catch (_) {}
  });
  delete process.env.METRICS_GA4_LIVE_ENABLED;
});

test('buildWhereClause casts platform eq to BrandSourcePlatform enum', () => {
  const service = require('../src/modules/metrics/metrics.service');

  const { sql, params } = service.buildWhereClause({
    filters: [{ field: 'platform', op: 'eq', value: 'GA4' }],
  });

  assert.ok(sql.includes('"platform" = $1::"BrandSourcePlatform"'));
  assert.deepEqual(params, ['GA4']);
});

test('buildWhereClause casts platform in to BrandSourcePlatform[] enum', () => {
  const service = require('../src/modules/metrics/metrics.service');

  const { sql, params } = service.buildWhereClause({
    filters: [{ field: 'platform', op: 'in', value: ['GA4', 'META_ADS'] }],
  });

  assert.ok(sql.includes('"platform" = ANY($1::"BrandSourcePlatform"[])'));
  assert.deepEqual(params, [['GA4', 'META_ADS']]);
});

test('queryMetrics succeeds with platform filter and returns materialized data', async () => {
  process.env.METRICS_GA4_LIVE_ENABLED = 'false';

  mockModule('../src/services/factMetricsSyncService', {
    ensureFactMetrics: async () => {},
  });
  mockModule('../src/services/ga4FactMetricsService', {
    ensureGa4FactMetrics: async () => {},
  });
  mockModule('../src/services/brandGa4SettingsService', {
    resolveBrandGa4ActivePropertyId: async () => '383714125',
  });
  mockModule('../src/services/connectionStateService', {
    getConnectionState: async () => null,
  });
  mockModule('../src/modules/metrics/ga4LiveQuery.service', {
    isGa4LiveEligible: () => true,
    queryGa4LiveMetrics: async () => {
      throw new Error('live mode should not execute when disabled');
    },
  });

  mockModule('../src/prisma', {
    prisma: {
      client: {
        findFirst: async () => ({ id: 'brand-1' }),
      },
      brandSourceConnection: {
        findMany: async () => [{ platform: 'GA4' }],
      },
      integrationGoogleGa4: {
        findFirst: async ({ where } = {}) => {
          if (where?.status === 'CONNECTED') {
            return { id: 'ga4-1', status: 'CONNECTED' };
          }
          return { status: 'CONNECTED', lastError: null };
        },
      },
      brandGa4Settings: {
        findFirst: async () => ({
          timezone: 'America/Sao_Paulo',
          leadEvents: [],
          conversionEvents: [],
        }),
      },
      metricsCatalog: {
        findMany: async () => [{ key: 'sessions', kind: 'base' }],
      },
      $queryRawUnsafe: async (sql) => {
        if (String(sql).includes('GROUP BY')) {
          return [{ date: '2026-02-22', sessions: '12' }];
        }
        return [{ sessions: '12' }];
      },
    },
  });

  const service = require('../src/modules/metrics/metrics.service');
  const result = await service.queryMetrics('tenant-1', {
    brandId: 'brand-1',
    dateRange: { start: '2026-02-01', end: '2026-02-22' },
    dimensions: ['date'],
    metrics: ['sessions'],
    filters: [
      { field: 'platform', op: 'eq', value: 'GA4' },
      { field: 'account_id', op: 'eq', value: '383714125' },
    ],
    compareTo: null,
  });

  assert.equal(result?.meta?.dataSource, 'materialized');
  assert.equal(result?.meta?.ga4PropertyId, '383714125');
  assert.equal(result?.rows?.[0]?.sessions, 12);
  assert.equal(result?.totals?.sessions, 12);
});
