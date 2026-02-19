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

test('getCredentialsComplianceReport calcula exposições e vault', async () => {
  mockModule('../src/prisma', {
    prisma: {
      integration: {
        findMany: async () => [
          {
            id: 'i-1',
            tenantId: 'tenant-1',
            provider: 'META',
            status: 'CONNECTED',
            updatedAt: new Date('2026-02-19T10:00:00.000Z'),
            accessToken: 'raw-token',
            refreshToken: null,
            accessTokenEncrypted: null,
            settings: null,
            config: { credentialRef: 'vault://credential/1' },
          },
          {
            id: 'i-2',
            tenantId: 'tenant-1',
            provider: 'GA4',
            status: 'CONNECTED',
            updatedAt: new Date('2026-02-19T10:05:00.000Z'),
            accessToken: null,
            refreshToken: null,
            accessTokenEncrypted: null,
            settings: null,
            config: {
              credentialsRefs: {
                refreshToken: 'vault://credential/2',
              },
            },
          },
          {
            id: 'i-3',
            tenantId: 'tenant-1',
            provider: 'WHATSAPP',
            status: 'CONNECTED',
            updatedAt: new Date('2026-02-19T10:06:00.000Z'),
            accessToken: null,
            refreshToken: null,
            accessTokenEncrypted: null,
            settings: {
              verifyToken: 'raw-verify-token',
            },
            config: null,
          },
        ],
      },
      credentialVault: {
        count: async () => 5,
        groupBy: async () => [
          { provider: 'META', _count: { _all: 2 } },
          { provider: 'GA4', _count: { _all: 3 } },
        ],
      },
    },
  });

  resetModule('../src/modules/compliance/credentialsCompliance.service');
  const service = require('../src/modules/compliance/credentialsCompliance.service');

  const report = await service.getCredentialsComplianceReport({ tenantId: 'tenant-1' });

  assert.equal(report.totals.integrations, 3);
  assert.equal(report.totals.integrationsExposed, 2);
  assert.equal(report.totals.integrationsWithCredentialRef, 2);
  assert.equal(report.totals.rawColumns, 1);
  assert.equal(report.totals.rawSettings, 1);
  assert.equal(report.totals.rawConfig, 0);
  assert.equal(report.totals.vaultEntries, 5);
  assert.equal(report.byProvider.META.exposed, 1);
  assert.equal(report.vaultByProvider.GA4, 3);
});
