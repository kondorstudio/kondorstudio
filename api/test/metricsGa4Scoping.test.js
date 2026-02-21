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
  assert.equal(ga4EnsureCalls, 0);
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
