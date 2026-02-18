process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const BRAND_ID = '11111111-1111-4111-8111-111111111111';

function mockModule(path, exports) {
  const resolved = require.resolve(path);
  require.cache[resolved] = { exports };
}

function resetModule(path) {
  const resolved = require.resolve(path);
  delete require.cache[resolved];
}

test('enqueueSync enfileira job de preview com provider normalizado', async () => {
  const queueCalls = [];

  mockModule('../src/prisma', {
    prisma: {
      client: {
        findFirst: async () => ({ id: BRAND_ID }),
      },
    },
  });

  mockModule('../src/queues', {
    ga4SyncQueue: {
      add: async (name, data) => {
        queueCalls.push({ name, data });
        return { id: 'job-preview-1' };
      },
    },
  });

  mockModule('../src/connectors', {
    getConnector: () => ({
      preview: async () => ({}),
      enqueueBackfill: async () => ({}),
      incremental: async () => ({}),
      normalize: () => [],
      upsertFacts: async () => ({}),
    }),
  });

  resetModule('../src/modules/sync/sync.service');
  const syncService = require('../src/modules/sync/sync.service');

  const result = await syncService.enqueueSync('preview', 'tenant-1', 'user-1', {
    provider: 'META_ADS',
    brandId: BRAND_ID,
  });

  assert.equal(result.queued, true);
  assert.equal(result.mode, 'preview');
  assert.equal(result.provider, 'META');
  assert.equal(result.queueJobId, 'job-preview-1');
  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].name, 'sync-preview');
  assert.equal(queueCalls[0].data.provider, 'META');
});

test('processSyncQueueJob grava chunk de sucesso no incremental', async () => {
  const chunkCalls = [];

  mockModule('../src/prisma', {
    prisma: {
      client: {
        findFirst: async () => ({ id: BRAND_ID }),
      },
      integration: {
        findFirst: async () => null,
      },
      dataSourceConnection: {
        findFirst: async () => null,
      },
    },
  });

  mockModule('../src/queues', {
    ga4SyncQueue: {
      add: async () => ({ id: 'unused' }),
    },
  });

  mockModule('../src/connectors', {
    getConnector: () => ({
      preview: async () => ({ runId: 'run-1', rows: [] }),
      enqueueBackfill: async () => ({ runId: 'run-1', queued: true }),
      incremental: async () => ({
        runId: 'run-1',
        result: { counts: { aggregatedFacts: 2, campaignFacts: 1 } },
      }),
      normalize: () => [],
      upsertFacts: async () => ({}),
    }),
  });

  mockModule('../src/services/syncRunsService', {
    createChunk: async (payload) => {
      chunkCalls.push(payload);
      return { id: 'chunk-1' };
    },
    recordSyncError: async () => null,
  });

  resetModule('../src/modules/sync/sync.service');
  const syncService = require('../src/modules/sync/sync.service');

  const result = await syncService.processSyncQueueJob({
    id: 'job-123',
    name: 'sync-incremental',
    data: {
      mode: 'incremental',
      provider: 'GA4',
      tenantId: 'tenant-1',
      userId: 'user-1',
      request: {
        provider: 'GA4',
        brandId: BRAND_ID,
        cursor: { start: '2026-01-01', end: '2026-01-03' },
      },
    },
  });

  assert.equal(result.runId, 'run-1');
  assert.equal(result.chunkId, 'chunk-1');
  assert.equal(chunkCalls.length, 1);
  assert.equal(chunkCalls[0].runId, 'run-1');
  assert.equal(chunkCalls[0].status, 'SUCCESS');
  assert.equal(chunkCalls[0].rowsRead, 3);
});

test('processSyncQueueJob registra erro de orquestração quando conector falha', async () => {
  const chunkCalls = [];
  const errorCalls = [];

  mockModule('../src/prisma', {
    prisma: {
      client: {
        findFirst: async () => ({ id: BRAND_ID }),
      },
      integration: {
        findFirst: async () => null,
      },
      dataSourceConnection: {
        findFirst: async () => null,
      },
    },
  });

  mockModule('../src/queues', {
    ga4SyncQueue: {
      add: async () => ({ id: 'unused' }),
    },
  });

  mockModule('../src/connectors', {
    getConnector: () => ({
      preview: async () => {
        const err = new Error('preview broke');
        err.runId = 'run-error-1';
        err.code = 'PREVIEW_BROKE';
        throw err;
      },
      enqueueBackfill: async () => ({ runId: 'run-error-1' }),
      incremental: async () => ({ runId: 'run-error-1' }),
      normalize: () => [],
      upsertFacts: async () => ({}),
    }),
  });

  mockModule('../src/services/syncRunsService', {
    createChunk: async (payload) => {
      chunkCalls.push(payload);
      return { id: 'chunk-error-1' };
    },
    recordSyncError: async (payload) => {
      errorCalls.push(payload);
      return { id: 'sync-error-1' };
    },
  });

  resetModule('../src/modules/sync/sync.service');
  const syncService = require('../src/modules/sync/sync.service');

  await assert.rejects(
    () =>
      syncService.processSyncQueueJob({
        id: 'job-fail-1',
        name: 'sync-preview',
        data: {
          mode: 'preview',
          provider: 'GA4',
          tenantId: 'tenant-1',
          request: {
            provider: 'GA4',
            brandId: BRAND_ID,
          },
        },
      }),
    (err) => {
      assert.equal(err.code, 'PREVIEW_BROKE');
      return true;
    },
  );

  assert.equal(chunkCalls.length, 1);
  assert.equal(chunkCalls[0].status, 'FAILED');
  assert.equal(errorCalls.length, 1);
  assert.equal(errorCalls[0].runId, 'run-error-1');
  assert.equal(errorCalls[0].providerCode, 'PREVIEW_BROKE');
});
