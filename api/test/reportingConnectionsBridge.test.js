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

function createFixture({ bridgeShouldFail = false } = {}) {
  const state = {
    brands: [{ id: 'brand-1', tenantId: 'tenant-1', name: 'Brand 1' }],
    dataSourceConnections: [],
  };

  const calls = {
    transactions: 0,
    bridge: [],
    invalidate: [],
    propertyLookupWhere: null,
    txRef: null,
  };

  const tx = {
    dataSourceConnection: {
      findFirst: async ({ where }) =>
        state.dataSourceConnections.find(
          (item) =>
            item.tenantId === where.tenantId &&
            item.brandId === where.brandId &&
            item.source === where.source &&
            item.externalAccountId === where.externalAccountId,
        ) || null,
      update: async ({ where, data }) => {
        const idx = state.dataSourceConnections.findIndex((item) => item.id === where.id);
        if (idx < 0) throw new Error('connection not found');
        const next = { ...state.dataSourceConnections[idx], ...data };
        state.dataSourceConnections[idx] = next;
        return { ...next };
      },
      create: async ({ data }) => {
        const created = {
          id: `dsc-${state.dataSourceConnections.length + 1}`,
          ...data,
        };
        state.dataSourceConnections.push(created);
        return { ...created };
      },
    },
  };
  calls.txRef = tx;

  const prisma = {
    client: {
      findFirst: async ({ where }) =>
        state.brands.find(
          (item) => item.id === where.id && item.tenantId === where.tenantId,
        ) || null,
    },
    integrationGoogleGa4Property: {
      findFirst: async ({ where }) => {
        calls.propertyLookupWhere = where;
        if (String(where.propertyId) !== '123456') return null;
        return {
          id: 'prop-1',
          tenantId: 'tenant-1',
          integrationId: 'ga4-int-1',
          propertyId: '123456',
          displayName: 'Property 123456',
          integration: {
            id: 'ga4-int-1',
            status: 'CONNECTED',
            userId: 'ga4-user-1',
          },
        };
      },
    },
    $transaction: async (executor) => {
      calls.transactions += 1;
      const snapshot = state.dataSourceConnections.map((item) => ({ ...item }));
      try {
        return await executor(tx);
      } catch (err) {
        state.dataSourceConnections = snapshot;
        throw err;
      }
    },
  };

  mockModule('../src/prisma', { prisma });
  mockModule('../src/services/brandGa4SettingsService', {
    normalizeGa4PropertyId(value) {
      return String(value || '').trim().replace(/^properties\//, '');
    },
    setBrandGa4ActiveProperty: async (args, opts) => {
      calls.bridge.push({ args, opts });
      if (bridgeShouldFail) {
        const err = new Error('bridge failed');
        err.code = 'BRIDGE_FAILED';
        throw err;
      }
      return String(args.propertyId);
    },
  });
  mockModule('../src/modules/metrics/metrics.service', {
    invalidateMetricsCacheForBrand: (tenantId, brandId) => {
      calls.invalidate.push({ tenantId, brandId });
    },
  });

  resetModule('../src/modules/reporting/connections.service');
  const service = require('../src/modules/reporting/connections.service');

  return { service, state, calls };
}

test('reporting linkConnection bridges GA4 with normalized propertyId inside transaction', async () => {
  const { service, state, calls } = createFixture();

  const result = await service.linkConnection(
    'tenant-1',
    'brand-1',
    {
      source: 'GA4',
      externalAccountId: 'properties/123456',
      displayName: 'GA4 Main Property',
    },
    'user-1',
    null,
  );

  assert.equal(calls.transactions, 1);
  assert.deepEqual(calls.propertyLookupWhere, {
    tenantId: 'tenant-1',
    propertyId: '123456',
  });
  assert.equal(calls.bridge.length, 1);
  assert.equal(calls.bridge[0].args.tenantId, 'tenant-1');
  assert.equal(calls.bridge[0].args.brandId, 'brand-1');
  assert.equal(calls.bridge[0].args.propertyId, '123456');
  assert.equal(calls.bridge[0].args.externalAccountName, 'GA4 Main Property');
  assert.equal(calls.bridge[0].opts.db, calls.txRef);
  assert.equal(calls.invalidate.length, 1);
  assert.equal(state.dataSourceConnections.length, 1);
  assert.equal(state.dataSourceConnections[0].externalAccountId, '123456');
  assert.equal(state.dataSourceConnections[0].status, 'CONNECTED');
  assert.equal(result.externalAccountId, '123456');
});

test('reporting linkConnection keeps atomicity when GA4 bridge fails', async () => {
  const { service, state, calls } = createFixture({ bridgeShouldFail: true });

  await assert.rejects(
    () =>
      service.linkConnection(
        'tenant-1',
        'brand-1',
        {
          source: 'GA4',
          externalAccountId: 'properties/123456',
          displayName: 'GA4 Main Property',
        },
        'user-1',
        null,
      ),
    (err) => {
      assert.equal(err.code, 'BRIDGE_FAILED');
      return true;
    },
  );

  assert.equal(calls.transactions, 1);
  assert.equal(state.dataSourceConnections.length, 0);
});
