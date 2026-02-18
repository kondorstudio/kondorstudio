process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

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

test('storeCredential cria registro com secretRef em formato vault://', async () => {
  let createdPayload = null;

  mockModule('../src/prisma', {
    prisma: {
      credentialVault: {
        create: async ({ data }) => {
          createdPayload = data;
          return {
            id: data.id,
            secretRef: data.secretRef,
            tenantId: data.tenantId,
            provider: data.provider,
            integrationId: data.integrationId,
            kind: data.kind,
            createdAt: new Date('2026-02-18T00:00:00.000Z'),
          };
        },
      },
    },
  });

  resetModule('../src/services/credentialsService');
  const credentialsService = require('../src/services/credentialsService');

  const saved = await credentialsService.storeCredential({
    tenantId: 'tenant-1',
    provider: 'meta',
    integrationId: 'integration-1',
    kind: 'access_token',
    secret: { token: 'abc123' },
  });

  assert.ok(saved.secretRef.startsWith('vault://credential/'));
  assert.equal(saved.provider, 'META');
  assert.ok(createdPayload.secretEnc);
  assert.notEqual(createdPayload.secretEnc, JSON.stringify({ token: 'abc123' }));
});

test('resolveCredential descriptografa segredo salvo', async () => {
  resetModule('../src/services/credentialsService');
  const credentialsService = require('../src/services/credentialsService');

  const seeded = await credentialsService.storeCredential(
    {
      tenantId: 'tenant-1',
      provider: 'ga4',
      integrationId: 'integration-2',
      kind: 'refresh_token',
      secret: 'refresh-plain',
    },
    {
      db: {
        credentialVault: {
          create: async ({ data }) => ({
            id: data.id,
            secretRef: data.secretRef,
            tenantId: data.tenantId,
            provider: data.provider,
            integrationId: data.integrationId,
            kind: data.kind,
            createdAt: new Date(),
          }),
        },
      },
    },
  );

  const encryptedDb = {
    credentialVault: {
      create: async () => {
        throw new Error('not used');
      },
      findFirst: async () => ({
        id: 'cred-1',
        secretRef: seeded.secretRef,
        tenantId: 'tenant-1',
        provider: 'GA4',
        integrationId: 'integration-2',
        kind: 'refresh_token',
        secretEnc: require('../src/lib/crypto').encrypt('refresh-plain'),
        meta: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        rotatedAt: null,
      }),
    },
  };

  const resolved = await credentialsService.resolveCredential(seeded.secretRef, {
    tenantId: 'tenant-1',
    db: encryptedDb,
  });

  assert.equal(resolved.secret, 'refresh-plain');
});
