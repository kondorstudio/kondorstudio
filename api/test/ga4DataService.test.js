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

function loadGa4DataService(prismaMock = {}) {
  mockModule('../src/prisma', {
    prisma: prismaMock,
    useTenant: () => ({}),
  });
  resetModule('../src/services/ga4DataService');
  return require('../src/services/ga4DataService');
}

test.afterEach(() => {
  ['../src/prisma', '../src/services/ga4DataService'].forEach((path) => {
    try {
      resetModule(path);
    } catch (_) {}
  });
});

test('normalizeRunReportPayload enforces metrics limit', () => {
  const service = loadGa4DataService({});
  const metrics = Array.from({ length: 11 }, (_, idx) => `m${idx}`);
  assert.throws(() => service.normalizeRunReportPayload({ metrics, dimensions: [] }));
});

test('normalizeRunReportPayload enforces dimensions limit', () => {
  const service = loadGa4DataService({});
  const dimensions = Array.from({ length: 11 }, (_, idx) => `d${idx}`);
  assert.throws(() =>
    service.normalizeRunReportPayload({ metrics: ['sessions'], dimensions })
  );
});

test('normalizeRunReportPayload enforces limit max', () => {
  const service = loadGa4DataService({});
  assert.throws(() =>
    service.normalizeRunReportPayload({
      metrics: ['sessions'],
      dimensions: [],
      limit: 999999,
    })
  );
});

test('assertPropertyAvailableForTenant accepts property even when not globally selected', async () => {
  const service = loadGa4DataService({
    integrationGoogleGa4Property: {
      findFirst: async ({ where }) => {
        if (String(where?.propertyId || '') !== '383714125') return null;
        return {
          id: 'prop-1',
          propertyId: '383714125',
          isSelected: false,
        };
      },
    },
  });

  await assert.doesNotReject(() =>
    service.__internal.assertPropertyAvailableForTenant({
      tenantId: 'tenant-1',
      propertyId: '383714125',
    })
  );

  await assert.rejects(
    () =>
      service.__internal.assertPropertyAvailableForTenant({
        tenantId: 'tenant-1',
        propertyId: '999999999',
      }),
    (error) => error?.code === 'GA4_PROPERTY_NOT_AVAILABLE',
  );
});
