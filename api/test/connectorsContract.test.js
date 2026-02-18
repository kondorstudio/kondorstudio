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

test('contract validator rejects missing methods', () => {
  resetModule('../src/connectors/contract');
  const { assertConnectorContract } = require('../src/connectors/contract');
  assert.throws(
    () => assertConnectorContract({ preview: async () => ({}) }, 'invalidConnector'),
    /missing required methods/i,
  );
});

test('ga4 connector implements contract and executes preview', async () => {
  mockModule('../src/services/ga4DataService', {
    runReport: async () => ({
      dimensionHeaders: [{ name: 'date' }],
      metricHeaders: [{ name: 'sessions' }],
      rows: [{ dimensions: ['2026-02-01'], metrics: ['10'] }],
    }),
  });
  mockModule('../src/services/ga4IntegrationResolver', {
    resolveGa4IntegrationContext: async () => ({
      userId: 'user-1',
      propertyId: '123456',
    }),
  });
  mockModule('../src/services/ga4FactMetricsService', {
    ensureGa4FactMetrics: async () => ({ ok: true }),
  });
  mockModule('../src/services/syncRunsService', {
    createRun: async () => ({ id: 'run-ga4-1' }),
    updateRun: async () => null,
    recordSyncError: async () => null,
  });
  mockModule('../src/queues', {
    ga4SyncQueue: {
      add: async () => ({ id: 'job-ga4-1' }),
    },
  });

  resetModule('../src/connectors/providers/ga4Connector');
  resetModule('../src/connectors/contract');

  const { assertConnectorContract } = require('../src/connectors/contract');
  const connector = require('../src/connectors/providers/ga4Connector');

  assertConnectorContract(connector, 'ga4Connector');

  const preview = await connector.preview(
    { tenantId: 'tenant-1' },
    { metrics: ['sessions'], dimensions: ['date'] },
  );
  assert.equal(preview.ok, true);
  assert.equal(preview.provider, 'GA4');
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].sessions, 10);

  const queued = await connector.enqueueBackfill(
    { tenantId: 'tenant-1', brandId: 'brand-1', userId: 'user-1' },
    { days: 45 },
  );
  assert.equal(queued.queued, true);
  assert.equal(queued.runId, 'run-ga4-1');
  assert.equal(queued.queueJobId, 'job-ga4-1');
});

test('meta connector implements contract and executes preview', async () => {
  mockModule('../src/services/metaMetricsService', {
    fetchAccountMetrics: async () => [
      { name: 'impressions', value: 12, collectedAt: '2026-02-01' },
      { name: 'clicks', value: 3, collectedAt: '2026-02-01' },
    ],
  });
  mockModule('../src/services/syncRunsService', {
    createRun: async () => ({ id: 'run-meta-1' }),
    updateRun: async () => null,
    recordSyncError: async () => null,
  });
  mockModule('../src/services/automationEngine', {
    enqueueJob: async () => ({ id: 'job-meta-1' }),
  });

  resetModule('../src/connectors/providers/metaConnector');
  resetModule('../src/connectors/contract');

  const { assertConnectorContract } = require('../src/connectors/contract');
  const connector = require('../src/connectors/providers/metaConnector');
  assertConnectorContract(connector, 'metaConnector');

  const preview = await connector.preview(
    { integration: { id: 'integration-1', settings: { accountId: 'act_1' } } },
    { metrics: ['impressions', 'clicks'] },
  );
  assert.equal(preview.ok, true);
  assert.equal(preview.provider, 'META');
  assert.equal(preview.rows.length, 2);

  const normalized = connector.normalize(preview.rows);
  assert.equal(Array.isArray(normalized), true);
  assert.equal(normalized.length, 2);

  const queued = await connector.enqueueBackfill(
    { tenantId: 'tenant-1', integrationId: 'integration-1' },
    { since: '2026-01-01', until: '2026-01-31' },
  );
  assert.equal(queued.queued, true);
  assert.equal(queued.runId, 'run-meta-1');
  assert.equal(queued.queueJobId, 'job-meta-1');
});
