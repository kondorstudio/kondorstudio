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
    '../src/services/ga4DataService',
    '../src/services/ga4IntegrationResolver',
    '../src/modules/metrics/ga4LiveQuery.service',
  ].forEach((path) => {
    try {
      resetModule(path);
    } catch (_) {}
  });
});

test('isGa4LiveEligible requires explicit GA4 scope', () => {
  const service = require('../src/modules/metrics/ga4LiveQuery.service');

  assert.equal(
    service.isGa4LiveEligible(
      {
        requiredPlatforms: ['GA4'],
        filters: [],
      },
      ['GA4'],
    ),
    true,
  );

  assert.equal(
    service.isGa4LiveEligible(
      {
        requiredPlatforms: ['GA4', 'META_ADS'],
        filters: [],
      },
      ['GA4', 'META_ADS'],
    ),
    false,
  );

  assert.equal(
    service.isGa4LiveEligible(
      {
        filters: [{ field: 'platform', op: 'eq', value: 'GA4' }],
      },
      [],
    ),
    true,
  );

  assert.equal(
    service.isGa4LiveEligible(
      {
        filters: [{ field: 'platform', op: 'in', value: ['GA4', 'META_ADS'] }],
      },
      [],
    ),
    false,
  );
});

test('queryGa4LiveMetrics maps GA4 metrics/dimensions and keeps synthetic fields', async () => {
  const calls = [];

  mockModule('../src/services/ga4IntegrationResolver', {
    resolveGa4IntegrationContext: async () => ({ userId: 'ga4-user-1' }),
  });
  mockModule('../src/services/ga4DataService', {
    runReport: async ({ payload }) => {
      calls.push(payload);
      if (payload.metrics.includes('eventCount')) {
        return {
          dimensionHeaders: ['date', 'campaignId'],
          metricHeaders: ['eventCount'],
          rows: [
            { dimensions: ['2026-02-01', 'cmp-1'], metrics: ['3'] },
            { dimensions: ['2026-02-01', 'cmp-2'], metrics: ['4'] },
          ],
        };
      }
      return {
        dimensionHeaders: ['date', 'campaignId'],
        metricHeaders: ['sessions', 'totalRevenue', 'keyEvents'],
        rows: [
          { dimensions: ['2026-02-01', 'cmp-1'], metrics: ['10', '100', '2'] },
          { dimensions: ['2026-02-01', 'cmp-2'], metrics: ['5', '50', '1'] },
        ],
      };
    },
  });

  const service = require('../src/modules/metrics/ga4LiveQuery.service');
  const result = await service.queryGa4LiveMetrics({
    tenantId: 'tenant-1',
    propertyId: '383714125',
    dateRange: { start: '2026-02-01', end: '2026-02-07' },
    metrics: ['sessions', 'revenue', 'conversions', 'leads'],
    dimensions: ['date', 'campaign_id', 'platform', 'account_id'],
    filters: [],
    sort: { field: 'sessions', direction: 'desc' },
    pagination: { limit: 1, offset: 1 },
    leadEvents: ['generate_lead'],
  });

  assert.equal(calls.length, 2);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].campaign_id, 'cmp-2');
  assert.equal(result.rows[0].platform, 'GA4');
  assert.equal(result.rows[0].account_id, '383714125');
  assert.equal(result.totals.sessions, 15);
  assert.equal(result.totals.revenue, 150);
  assert.equal(result.totals.conversions, 3);
  assert.equal(result.totals.leads, 7);
});

test('queryGa4LiveMetrics falls back from campaignId to campaignName', async () => {
  const calls = [];

  mockModule('../src/services/ga4IntegrationResolver', {
    resolveGa4IntegrationContext: async () => ({ userId: 'ga4-user-1' }),
  });
  mockModule('../src/services/ga4DataService', {
    runReport: async ({ payload }) => {
      calls.push(payload);
      if (calls.length === 1) {
        const err = new Error('invalid dimension');
        err.status = 400;
        err.details = { invalidDimensions: ['campaignId'] };
        throw err;
      }
      return {
        dimensionHeaders: ['campaignName'],
        metricHeaders: ['sessions'],
        rows: [{ dimensions: ['Campanha A'], metrics: ['7'] }],
      };
    },
  });

  const service = require('../src/modules/metrics/ga4LiveQuery.service');
  const result = await service.queryGa4LiveMetrics({
    tenantId: 'tenant-1',
    propertyId: '383714125',
    dateRange: { start: '2026-02-01', end: '2026-02-07' },
    metrics: ['sessions'],
    dimensions: ['campaign_id'],
    filters: [],
  });

  assert.equal(calls.length, 2);
  assert.ok(calls[0].dimensions.includes('campaignId'));
  assert.ok(calls[1].dimensions.includes('campaignName'));
  assert.equal(result.rows[0].campaign_id, 'Campanha A');
});

test('queryGa4LiveMetrics rejects unsupported metrics with functional error', async () => {
  mockModule('../src/services/ga4IntegrationResolver', {
    resolveGa4IntegrationContext: async () => ({ userId: 'ga4-user-1' }),
  });
  mockModule('../src/services/ga4DataService', {
    runReport: async () => ({ dimensionHeaders: [], metricHeaders: [], rows: [] }),
  });

  const service = require('../src/modules/metrics/ga4LiveQuery.service');
  await assert.rejects(
    () =>
      service.queryGa4LiveMetrics({
        tenantId: 'tenant-1',
        propertyId: '383714125',
        dateRange: { start: '2026-02-01', end: '2026-02-07' },
        metrics: ['spend'],
        dimensions: [],
        filters: [],
      }),
    (error) => error?.code === 'GA4_UNSUPPORTED_METRICS' && error?.status === 400,
  );
});
