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

function matchesWhere(row, where = {}) {
  return Object.entries(where || {}).every(([key, condition]) => {
    const value = row[key];
    if (
      condition &&
      typeof condition === 'object' &&
      !Array.isArray(condition)
    ) {
      if (Object.prototype.hasOwnProperty.call(condition, 'not')) {
        return value !== condition.not;
      }
      if (Object.prototype.hasOwnProperty.call(condition, 'in')) {
        return Array.isArray(condition.in) && condition.in.includes(value);
      }
      return value === condition;
    }
    return value === condition;
  });
}

function createFixture() {
  const state = {
    clients: [{ id: 'brand-1', tenantId: 'tenant-1', name: 'Brand 1' }],
    integrations: [],
    dataSourceConnections: [],
    brandSourceConnections: [],
    integrationSeq: 1,
    dataSourceSeq: 1,
    brandSourceSeq: 1,
  };

  const prisma = {
    client: {
      findFirst: async ({ where }) =>
        state.clients.find(
          (item) =>
            item.id === String(where.id) &&
            item.tenantId === String(where.tenantId),
        ) || null,
    },
    integration: {
      create: async ({ data }) => {
        const created = {
          id: `int-${state.integrationSeq++}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
          config: data.config || null,
          settings: data.settings || null,
        };
        state.integrations.push(created);
        return { ...created };
      },
      findFirst: async ({ where }) =>
        state.integrations.find((item) => matchesWhere(item, where)) || null,
      update: async ({ where, data }) => {
        const idx = state.integrations.findIndex((item) => item.id === where.id);
        if (idx < 0) throw new Error('integration not found');
        const next = {
          ...state.integrations[idx],
          ...data,
          updatedAt: new Date(),
        };
        state.integrations[idx] = next;
        return { ...next };
      },
      delete: async ({ where }) => {
        const idx = state.integrations.findIndex((item) => item.id === where.id);
        if (idx >= 0) state.integrations.splice(idx, 1);
        return { id: where.id };
      },
      findMany: async () => state.integrations.map((item) => ({ ...item })),
      count: async () => state.integrations.length,
    },
    dataSourceConnection: {
      findFirst: async ({ where }) =>
        state.dataSourceConnections.find((item) => matchesWhere(item, where)) ||
        null,
      create: async ({ data }) => {
        const created = {
          id: `dsc-${state.dataSourceSeq++}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.dataSourceConnections.push(created);
        return { ...created };
      },
      update: async ({ where, data }) => {
        const idx = state.dataSourceConnections.findIndex(
          (item) => item.id === where.id,
        );
        if (idx < 0) throw new Error('dataSourceConnection not found');
        const next = {
          ...state.dataSourceConnections[idx],
          ...data,
          updatedAt: new Date(),
        };
        state.dataSourceConnections[idx] = next;
        return { ...next };
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        state.dataSourceConnections = state.dataSourceConnections.map((item) => {
          if (!matchesWhere(item, where)) return item;
          count += 1;
          return { ...item, ...data, updatedAt: new Date() };
        });
        return { count };
      },
    },
    brandSourceConnection: {
      upsert: async ({ where, update, create }) => {
        const key = where.brandId_platform_externalAccountId;
        const idx = state.brandSourceConnections.findIndex(
          (item) =>
            item.brandId === key.brandId &&
            item.platform === key.platform &&
            item.externalAccountId === key.externalAccountId,
        );
        if (idx >= 0) {
          const next = {
            ...state.brandSourceConnections[idx],
            ...update,
            updatedAt: new Date(),
          };
          state.brandSourceConnections[idx] = next;
          return { ...next };
        }
        const created = {
          id: `bsc-${state.brandSourceSeq++}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        };
        state.brandSourceConnections.push(created);
        return { ...created };
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        state.brandSourceConnections = state.brandSourceConnections.map((item) => {
          if (!matchesWhere(item, where)) return item;
          count += 1;
          return { ...item, ...data, updatedAt: new Date() };
        });
        return { count };
      },
    },
    $transaction: async (executor) => executor(prisma),
  };

  mockModule('../src/prisma', { prisma });
  mockModule('../src/services/connectionStateService', {
    STATUS: {
      CONNECTED: 'CONNECTED',
      DISCONNECTED: 'DISCONNECTED',
      ERROR: 'ERROR',
      REAUTH_REQUIRED: 'REAUTH_REQUIRED',
    },
    normalizeConnectionStatus(status, fallback) {
      const normalized = String(status || '').toUpperCase();
      if (normalized === 'CONNECTED' || normalized === 'ACTIVE') return 'CONNECTED';
      if (normalized === 'DISCONNECTED' || normalized === 'INACTIVE') return 'DISCONNECTED';
      if (normalized === 'REAUTH_REQUIRED') return 'REAUTH_REQUIRED';
      if (normalized === 'ERROR') return 'ERROR';
      return fallback || 'DISCONNECTED';
    },
    upsertConnectionState: async () => null,
    buildStateKey: () => null,
  });
  mockModule('../src/services/credentialsService', {
    storeCredential: async ({ kind }) => ({
      secretRef: `sec_ref_${String(kind || 'default')}`,
    }),
  });

  resetModule('../src/services/integrationsService');
  const integrationsService = require('../src/services/integrationsService');

  return { integrationsService, state };
}

test('connectClientIntegration cria bridge para DataSourceConnection e BrandSourceConnection', async () => {
  const { integrationsService, state } = createFixture();

  const integration = await integrationsService.connectClientIntegration(
    'tenant-1',
    'brand-1',
    'META',
    {
      status: 'CONNECTED',
      settings: {
        kind: 'meta_ads',
        adAccountId: 'act_123',
        adAccountName: 'Conta Meta 123',
      },
    },
  );

  assert.ok(integration?.id);
  assert.equal(state.dataSourceConnections.length, 1);
  assert.equal(state.brandSourceConnections.length, 1);

  assert.equal(state.dataSourceConnections[0].source, 'META_ADS');
  assert.equal(state.dataSourceConnections[0].externalAccountId, 'act_123');
  assert.equal(state.dataSourceConnections[0].status, 'CONNECTED');

  assert.equal(state.brandSourceConnections[0].platform, 'META_ADS');
  assert.equal(state.brandSourceConnections[0].externalAccountId, 'act_123');
  assert.equal(state.brandSourceConnections[0].status, 'ACTIVE');
});

test('update troca conta ativa e desativa conexões anteriores da mesma fonte', async () => {
  const { integrationsService, state } = createFixture();

  const integration = await integrationsService.connectClientIntegration(
    'tenant-1',
    'brand-1',
    'META',
    {
      status: 'CONNECTED',
      settings: {
        kind: 'meta_ads',
        adAccountId: 'act_123',
        adAccountName: 'Conta Meta 123',
      },
    },
  );

  await integrationsService.update('tenant-1', integration.id, {
    status: 'CONNECTED',
    settings: {
      kind: 'meta_ads',
      adAccountId: 'act_999',
      adAccountName: 'Conta Meta 999',
    },
  });

  const oldDataSource = state.dataSourceConnections.find(
    (item) => item.externalAccountId === 'act_123',
  );
  const newDataSource = state.dataSourceConnections.find(
    (item) => item.externalAccountId === 'act_999',
  );
  assert.equal(oldDataSource?.status, 'DISCONNECTED');
  assert.equal(newDataSource?.status, 'CONNECTED');

  const oldBrandSource = state.brandSourceConnections.find(
    (item) => item.externalAccountId === 'act_123',
  );
  const newBrandSource = state.brandSourceConnections.find(
    (item) => item.externalAccountId === 'act_999',
  );
  assert.equal(oldBrandSource?.status, 'DISCONNECTED');
  assert.equal(newBrandSource?.status, 'ACTIVE');
});

test('disconnect desativa bridges de conexão para o relatório', async () => {
  const { integrationsService, state } = createFixture();

  const integration = await integrationsService.connectClientIntegration(
    'tenant-1',
    'brand-1',
    'META',
    {
      status: 'CONNECTED',
      settings: {
        kind: 'meta_ads',
        adAccountId: 'act_123',
        adAccountName: 'Conta Meta 123',
      },
    },
  );

  await integrationsService.disconnect('tenant-1', integration.id);

  assert.equal(
    state.dataSourceConnections.every((item) => item.status === 'DISCONNECTED'),
    true,
  );
  assert.equal(
    state.brandSourceConnections.every((item) => item.status === 'DISCONNECTED'),
    true,
  );
});
