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

test('ga4RealtimeSyncJob skips when there are no active GA4 targets', async () => {
  mockModule('../src/prisma', {
    prisma: {
      brandSourceConnection: {
        findMany: async () => [],
      },
    },
  });
  mockModule('../src/services/ga4DataService', {
    runRealtimeReport: async () => ({ rows: [] }),
  });
  mockModule('../src/services/ga4IntegrationResolver', {
    resolveGa4IntegrationContext: async () => ({ userId: 'user-1' }),
  });

  resetModule('../src/jobs/ga4RealtimeSyncJob');
  const job = require('../src/jobs/ga4RealtimeSyncJob');

  const result = await job.pollOnce();
  assert.equal(result.ok, true);
  assert.equal(result.processed, 0);
  assert.equal(result.errors, 0);
  assert.equal(result.skipped, true);
});

test('ga4RealtimeSyncJob treats disconnected integration as skipped (not error)', async () => {
  const runRealtimeCalls = [];

  mockModule('../src/prisma', {
    prisma: {
      brandSourceConnection: {
        findMany: async () => [
          { tenantId: 'tenant-a', externalAccountId: 'properties/123' },
          { tenantId: 'tenant-b', externalAccountId: '456' },
        ],
      },
    },
  });

  mockModule('../src/services/ga4IntegrationResolver', {
    resolveGa4IntegrationContext: async ({ tenantId }) => {
      if (tenantId === 'tenant-a') {
        const err = new Error('Nenhuma integração GA4 conectada para esta propriedade');
        err.code = 'GA4_INTEGRATION_NOT_CONNECTED';
        throw err;
      }
      return { userId: 'user-b' };
    },
  });

  mockModule('../src/services/ga4DataService', {
    runRealtimeReport: async (payload) => {
      runRealtimeCalls.push(payload);
      return { rows: [] };
    },
  });

  resetModule('../src/jobs/ga4RealtimeSyncJob');
  const job = require('../src/jobs/ga4RealtimeSyncJob');

  const result = await job.pollOnce();
  assert.equal(result.ok, true);
  assert.equal(result.processed, 1);
  assert.equal(result.errors, 0);
  assert.equal(result.skippedNoIntegration, 1);
  assert.equal(runRealtimeCalls.length, 1);
  assert.equal(runRealtimeCalls[0].tenantId, 'tenant-b');
  assert.equal(runRealtimeCalls[0].propertyId, '456');
});

test('ga4RealtimeSyncJob keeps non-connection failures as errors', async () => {
  mockModule('../src/prisma', {
    prisma: {
      brandSourceConnection: {
        findMany: async () => [{ tenantId: 'tenant-1', externalAccountId: '789' }],
      },
    },
  });

  mockModule('../src/services/ga4IntegrationResolver', {
    resolveGa4IntegrationContext: async () => ({ userId: 'user-1' }),
  });

  mockModule('../src/services/ga4DataService', {
    runRealtimeReport: async () => {
      const err = new Error('GA4 API temporary failure');
      err.code = 'GA4_DATA_ERROR';
      throw err;
    },
  });

  resetModule('../src/jobs/ga4RealtimeSyncJob');
  const job = require('../src/jobs/ga4RealtimeSyncJob');

  const result = await job.pollOnce();
  assert.equal(result.ok, true);
  assert.equal(result.processed, 0);
  assert.equal(result.errors, 1);
  assert.equal(result.skippedNoIntegration, 0);
});
