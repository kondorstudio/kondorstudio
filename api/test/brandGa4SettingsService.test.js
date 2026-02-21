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
    '../src/lib/pgAdvisoryLock',
    '../src/services/brandGa4SettingsService',
  ].forEach((path) => {
    try {
      resetModule(path);
    } catch (_) {}
  });
});

test('setBrandGa4ActiveProperty updates canonical settings and legacy selected property', async () => {
  const calls = {
    legacyUpdateMany: [],
    legacyUpdate: [],
    brandSettingsUpsert: [],
  };

  mockModule('../src/lib/pgAdvisoryLock', {
    acquireTenantBrandLock: async () => {},
  });

  const tx = {
    integrationGoogleGa4Property: {
      findFirst: async ({ select }) => {
        // First lookup resolves property record. Second lookup resolves compatibility sync target.
        if (select?.integration) {
          return {
            integrationId: 'ga4-int-1',
            displayName: 'Property 383714125',
            integration: { userId: 'user-1' },
          };
        }
        return {
          id: 'prop-row-1',
          integrationId: 'ga4-int-1',
          isSelected: false,
        };
      },
      updateMany: async (payload) => {
        calls.legacyUpdateMany.push(payload);
        return { count: 1 };
      },
      update: async (payload) => {
        calls.legacyUpdate.push(payload);
        return { id: 'prop-row-1', isSelected: true };
      },
    },
    brandSourceConnection: {
      findMany: async () => [
        {
          id: 'conn-1',
          externalAccountId: '383714125',
          externalAccountName: 'Property 383714125',
          status: 'ACTIVE',
          updatedAt: new Date(),
          createdAt: new Date(),
        },
      ],
      update: async () => ({ id: 'conn-1' }),
      updateMany: async () => ({ count: 0 }),
      create: async () => ({ id: 'conn-1' }),
    },
    brandGa4Settings: {
      findFirst: async () => null,
      upsert: async (payload) => {
        calls.brandSettingsUpsert.push(payload);
        return {
          id: 'brand-ga4-1',
          brandId: 'brand-1',
          tenantId: 'tenant-1',
          propertyId: '383714125',
        };
      },
    },
  };

  mockModule('../src/prisma', {
    prisma: {
      $transaction: async (fn) => fn(tx),
      ...tx,
    },
  });

  resetModule('../src/services/brandGa4SettingsService');
  const { setBrandGa4ActiveProperty } = require('../src/services/brandGa4SettingsService');

  const propertyId = await setBrandGa4ActiveProperty({
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    propertyId: '383714125',
  });

  assert.equal(propertyId, '383714125');
  assert.equal(calls.brandSettingsUpsert.length, 1);
  assert.equal(calls.brandSettingsUpsert[0]?.update?.propertyId, '383714125');
  assert.equal(calls.legacyUpdateMany.length, 1);
  assert.equal(calls.legacyUpdateMany[0]?.where?.integrationId, 'ga4-int-1');
  assert.equal(calls.legacyUpdate.length, 1);
  assert.equal(calls.legacyUpdate[0]?.where?.id, 'prop-row-1');
  assert.equal(calls.legacyUpdate[0]?.data?.isSelected, true);
});
