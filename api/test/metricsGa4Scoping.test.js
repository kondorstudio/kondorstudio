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
    '../src/services/connectionStateService',
    '../src/services/factMetricsSyncService',
    '../src/services/ga4FactMetricsService',
    '../src/services/brandGa4SettingsService',
    '../src/modules/metrics/ga4LiveQuery.service',
    '../src/modules/metrics/metrics.service',
  ].forEach((path) => {
    try {
      resetModule(path);
    } catch (_) {}
  });
});

test('GA4 live success bypasses materialized SQL path', async () => {
  let queryRawCalls = 0;
  let ga4EnsureCalls = 0;

  mockModule('../src/services/factMetricsSyncService', {
    ensureFactMetrics: async () => {},
  });
  mockModule('../src/services/ga4FactMetricsService', {
    ensureGa4FactMetrics: async () => {
      ga4EnsureCalls += 1;
    },
  });
  mockModule('../src/services/brandGa4SettingsService', {
    resolveBrandGa4ActivePropertyId: async () => '383124820',
  });
  mockModule('../src/services/connectionStateService', {
    getConnectionState: async () => null,
  });
  mockModule('../src/modules/metrics/ga4LiveQuery.service', {
    isGa4LiveEligible: () => true,
    queryGa4LiveMetrics: async () => ({
      rows: [{ date: '2026-01-01', sessions: 10 }],
      totals: { sessions: 10 },
      compare: null,
    }),
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
      $queryRawUnsafe: async () => {
        queryRawCalls += 1;
        return [{ sessions: '10' }];
      },
    },
  });

  const service = require('../src/modules/metrics/metrics.service');

  const result = await service.queryMetrics('tenant-1', {
    brandId: 'brand-1',
    dateRange: { start: '2026-01-01', end: '2026-01-01' },
    dimensions: ['date'],
    metrics: ['sessions'],
    filters: [],
    requiredPlatforms: ['GA4'],
  });

  assert.equal(result?.meta?.dataSource, 'ga4_live');
  assert.equal(result?.rows?.[0]?.sessions, 10);
  assert.equal(queryRawCalls, 0);
  assert.equal(ga4EnsureCalls, 0);
});

test('GA4 disconnected + existing facts returns degraded meta instead of 409', async () => {
  let ga4EnsureCalls = 0;

  mockModule('../src/services/factMetricsSyncService', {
    ensureFactMetrics: async () => {},
  });
  mockModule('../src/services/ga4FactMetricsService', {
    ensureGa4FactMetrics: async () => {
      ga4EnsureCalls += 1;
    },
  });
  mockModule('../src/services/brandGa4SettingsService', {
    resolveBrandGa4ActivePropertyId: async () => '383714125',
  });
  mockModule('../src/services/connectionStateService', {
    getConnectionState: async () => ({ status: 'REAUTH_REQUIRED' }),
  });
  mockModule('../src/modules/metrics/ga4LiveQuery.service', {
    isGa4LiveEligible: () => true,
    queryGa4LiveMetrics: async () => {
      throw new Error('live should be skipped when degraded');
    },
  });

  mockModule('../src/prisma', {
    prisma: {
      client: {
        findFirst: async () => ({ id: 'brand-1' }),
      },
      brandSourceConnection: {
        findMany: async ({ where }) => {
          if (where?.status === 'ACTIVE') {
            return [{ platform: 'GA4', externalAccountId: '383714125' }];
          }
          return [{ platform: 'GA4' }];
        },
      },
      integrationGoogleGa4: {
        findFirst: async ({ where }) => {
          if (where?.status === 'CONNECTED') return null;
          return { status: 'NEEDS_RECONNECT', lastError: 'token invalid' };
        },
      },
      brandGa4Settings: {
        findFirst: async () => ({ timezone: 'UTC', propertyId: '383714125' }),
      },
      factKondorMetricsDaily: {
        findFirst: async () => ({ date: new Date('2026-02-12T00:00:00.000Z') }),
      },
      metricsCatalog: {
        findMany: async () => [{ key: 'sessions', kind: 'base' }],
      },
      $queryRawUnsafe: async (sql) => {
        if (String(sql).includes('GROUP BY')) {
          return [{ date: '2026-02-12', sessions: '7' }];
        }
        return [{ sessions: '7' }];
      },
    },
  });

  const service = require('../src/modules/metrics/metrics.service');
  const result = await service.queryMetrics('tenant-1', {
    brandId: 'brand-1',
    dateRange: { start: '2026-02-01', end: '2026-02-20' },
    dimensions: ['date'],
    metrics: ['sessions'],
    filters: [],
    requiredPlatforms: ['GA4'],
  });

  assert.equal(result?.meta?.connectionDegraded, true);
  assert.deepEqual(result?.meta?.stalePlatforms, ['GA4']);
  assert.equal(result?.meta?.staleReason, 'REAUTH_REQUIRED');
  assert.equal(result?.meta?.dataFreshUntil, '2026-02-12');
  assert.equal(result?.meta?.dataSource, 'materialized_fallback');
  assert.equal(ga4EnsureCalls, 0);
});

test('GA4 live failure with existing facts falls back to materialized data', async () => {
  let queryRawCalls = 0;

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
      const err = new Error('ga4 down');
      err.status = 503;
      err.code = 'GA4_DATA_ERROR';
      throw err;
    },
  });

  mockModule('../src/prisma', {
    prisma: {
      client: {
        findFirst: async () => ({ id: 'brand-1' }),
      },
      brandSourceConnection: {
        findMany: async ({ where }) => {
          if (where?.status === 'ACTIVE') {
            return [{ platform: 'GA4', externalAccountId: '383714125' }];
          }
          return [{ platform: 'GA4' }];
        },
      },
      integrationGoogleGa4: {
        findFirst: async ({ where }) => {
          if (where?.status === 'CONNECTED') return { id: 'ga4-1', status: 'CONNECTED' };
          return { status: 'CONNECTED' };
        },
      },
      brandGa4Settings: {
        findFirst: async () => ({ timezone: 'UTC', propertyId: '383714125' }),
      },
      factKondorMetricsDaily: {
        findFirst: async () => ({ date: new Date('2026-02-20T00:00:00.000Z') }),
      },
      metricsCatalog: {
        findMany: async () => [{ key: 'sessions', kind: 'base' }],
      },
      $queryRawUnsafe: async (sql) => {
        queryRawCalls += 1;
        if (String(sql).includes('GROUP BY')) {
          return [{ date: '2026-02-20', sessions: '9' }];
        }
        return [{ sessions: '9' }];
      },
    },
  });

  const service = require('../src/modules/metrics/metrics.service');
  const result = await service.queryMetrics('tenant-1', {
    brandId: 'brand-1',
    dateRange: { start: '2026-02-01', end: '2026-02-21' },
    dimensions: ['date'],
    metrics: ['sessions'],
    filters: [],
    requiredPlatforms: ['GA4'],
  });

  assert.equal(result?.meta?.connectionDegraded, true);
  assert.equal(result?.meta?.staleReason, 'GA4_LIVE_FAILED');
  assert.equal(result?.meta?.dataSource, 'materialized_fallback');
  assert.equal(result?.meta?.liveErrorCode, 'GA4_DATA_ERROR');
  assert.ok(queryRawCalls >= 1);
});

test('GA4 live failure without facts propagates original error', async () => {
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
      const err = new Error('ga4 timeout');
      err.status = 504;
      err.code = 'GA4_DATA_ERROR';
      throw err;
    },
  });

  mockModule('../src/prisma', {
    prisma: {
      client: {
        findFirst: async () => ({ id: 'brand-1' }),
      },
      brandSourceConnection: {
        findMany: async ({ where }) => {
          if (where?.status === 'ACTIVE') {
            return [{ platform: 'GA4', externalAccountId: '383714125' }];
          }
          return [{ platform: 'GA4' }];
        },
      },
      integrationGoogleGa4: {
        findFirst: async ({ where }) => {
          if (where?.status === 'CONNECTED') return { id: 'ga4-1', status: 'CONNECTED' };
          return { status: 'CONNECTED' };
        },
      },
      brandGa4Settings: {
        findFirst: async () => ({ timezone: 'UTC', propertyId: '383714125' }),
      },
      factKondorMetricsDaily: {
        findFirst: async () => null,
      },
      metricsCatalog: {
        findMany: async () => [{ key: 'sessions', kind: 'base' }],
      },
      $queryRawUnsafe: async () => [{ sessions: '0' }],
    },
  });

  const service = require('../src/modules/metrics/metrics.service');
  await assert.rejects(
    () =>
      service.queryMetrics('tenant-1', {
        brandId: 'brand-1',
        dateRange: { start: '2026-02-01', end: '2026-02-21' },
        dimensions: ['date'],
        metrics: ['sessions'],
        filters: [],
        requiredPlatforms: ['GA4'],
      }),
    (error) => error?.code === 'GA4_DATA_ERROR',
  );
});

test('GA4 disconnected + no facts keeps MISSING_CONNECTIONS', async () => {
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
    getConnectionState: async () => ({ status: 'REAUTH_REQUIRED' }),
  });
  mockModule('../src/modules/metrics/ga4LiveQuery.service', {
    isGa4LiveEligible: () => true,
    queryGa4LiveMetrics: async () => {
      throw new Error('live should not run when disconnected');
    },
  });

  mockModule('../src/prisma', {
    prisma: {
      client: {
        findFirst: async () => ({ id: 'brand-1' }),
      },
      brandSourceConnection: {
        findMany: async ({ where }) => {
          if (where?.status === 'ACTIVE') {
            return [{ platform: 'GA4', externalAccountId: '383714125' }];
          }
          return [{ platform: 'GA4' }];
        },
      },
      integrationGoogleGa4: {
        findFirst: async ({ where }) => {
          if (where?.status === 'CONNECTED') return null;
          return { status: 'NEEDS_RECONNECT', lastError: 'token invalid' };
        },
      },
      brandGa4Settings: {
        findFirst: async () => ({ timezone: 'UTC', propertyId: '383714125' }),
      },
      factKondorMetricsDaily: {
        findFirst: async () => null,
      },
      metricsCatalog: {
        findMany: async () => [{ key: 'sessions', kind: 'base' }],
      },
      $queryRawUnsafe: async () => [{ sessions: '0' }],
    },
  });

  const service = require('../src/modules/metrics/metrics.service');
  await assert.rejects(
    () =>
      service.queryMetrics('tenant-1', {
        brandId: 'brand-1',
        dateRange: { start: '2026-02-01', end: '2026-02-20' },
        dimensions: ['date'],
        metrics: ['sessions'],
        filters: [],
        requiredPlatforms: ['GA4'],
      }),
    (error) => error?.code === 'MISSING_CONNECTIONS',
  );
});
