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
    '../src/services/ga4OAuthService',
    '../src/services/ga4AdminService',
  ].forEach((path) => {
    try {
      resetModule(path);
    } catch (_) {}
  });
});

function loadService({
  integrationStatus = 'CONNECTED',
  property = {
    id: 'prop-row-1',
    tenantId: 'tenant-1',
    integrationId: 'integration-1',
    propertyId: '392522714',
    isSelected: false,
  },
  useTenantFactory,
} = {}) {
  const calls = {
    txFindFirst: [],
    txUpdateMany: [],
    txUpdate: [],
    integrationFindFirst: [],
    useTenantCalls: 0,
    useTenantTransactionCalls: 0,
  };

  const tx = {
    integrationGoogleGa4Property: {
      findFirst: async (args) => {
        calls.txFindFirst.push(args);
        return property ? { ...property } : null;
      },
      updateMany: async (args) => {
        calls.txUpdateMany.push(args);
        return { count: 1 };
      },
      update: async (args) => {
        calls.txUpdate.push(args);
        return {
          id: args?.where?.id || property?.id || 'prop-row-1',
          isSelected: true,
          propertyId: property?.propertyId || '392522714',
        };
      },
    },
  };

  const prisma = {
    integrationGoogleGa4: {
      findFirst: async (args) => {
        calls.integrationFindFirst.push(args);
        return {
          id: 'integration-1',
          tenantId: 'tenant-1',
          status: integrationStatus,
        };
      },
    },
    $transaction: async (handler) => handler(tx),
  };

  const useTenant =
    useTenantFactory ||
    (() => {
      calls.useTenantCalls += 1;
      return {
        $transaction: async () => {
          calls.useTenantTransactionCalls += 1;
          throw new Error('useTenant.$transaction should not be called');
        },
      };
    });

  mockModule('../src/prisma', {
    prisma,
    useTenant,
  });

  mockModule('../src/services/ga4OAuthService', {
    isMockMode: () => false,
    ensureMockIntegration: async () => {
      throw new Error('ensureMockIntegration should not be called');
    },
  });

  resetModule('../src/services/ga4AdminService');
  const service = require('../src/services/ga4AdminService');
  return { service, calls };
}

test('selectProperty updates selection inside prisma transaction callback', async () => {
  const { service, calls } = loadService();

  const result = await service.selectProperty({
    tenantId: 'tenant-1',
    userId: 'user-1',
    propertyId: '392522714',
  });

  assert.equal(result?.isSelected, true);
  assert.equal(calls.txFindFirst.length, 1);
  assert.equal(calls.txUpdateMany.length, 1);
  assert.equal(calls.txUpdate.length, 1);

  assert.deepEqual(calls.txFindFirst[0]?.where, {
    tenantId: 'tenant-1',
    integrationId: 'integration-1',
    propertyId: '392522714',
  });

  assert.deepEqual(calls.txUpdateMany[0]?.where, {
    tenantId: 'tenant-1',
    integrationId: 'integration-1',
  });

  assert.deepEqual(calls.txUpdateMany[0]?.data, {
    isSelected: false,
  });
});

test('selectProperty returns 404 when property does not exist', async () => {
  const { service, calls } = loadService({ property: null });

  await assert.rejects(
    () =>
      service.selectProperty({
        tenantId: 'tenant-1',
        userId: 'user-1',
        propertyId: '392522714',
      }),
    (error) => {
      assert.equal(error?.status, 404);
      assert.equal(error?.message, 'GA4 property not found');
      return true;
    },
  );

  assert.equal(calls.txUpdateMany.length, 0);
  assert.equal(calls.txUpdate.length, 0);
});

test('selectProperty does not rely on useTenant.$transaction', async () => {
  const calls = { useTenantCalls: 0, useTenantTransactionCalls: 0 };

  const useTenantFactory = () => {
    calls.useTenantCalls += 1;
    return {
      $transaction: async () => {
        calls.useTenantTransactionCalls += 1;
        throw new Error('unexpected useTenant transaction usage');
      },
    };
  };

  const { service } = loadService({ useTenantFactory });

  await assert.doesNotReject(() =>
    service.selectProperty({
      tenantId: 'tenant-1',
      userId: 'user-1',
      propertyId: '392522714',
    }),
  );

  assert.equal(calls.useTenantCalls, 0);
  assert.equal(calls.useTenantTransactionCalls, 0);
});
