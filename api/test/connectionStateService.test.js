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

test('normalizeConnectionStatus maps legacy values to unified statuses', () => {
  resetModule('../src/services/connectionStateService');
  const service = require('../src/services/connectionStateService');

  assert.equal(service.normalizeConnectionStatus('ACTIVE'), 'CONNECTED');
  assert.equal(service.normalizeConnectionStatus('connected'), 'CONNECTED');
  assert.equal(service.normalizeConnectionStatus('INACTIVE'), 'DISCONNECTED');
  assert.equal(service.normalizeConnectionStatus('needs_reconnect'), 'REAUTH_REQUIRED');
  assert.equal(service.normalizeConnectionStatus('error'), 'ERROR');
});

test('upsertConnectionState is no-op when prisma model is unavailable', async () => {
  mockModule('../src/prisma', {
    prisma: {},
  });
  resetModule('../src/services/connectionStateService');
  const service = require('../src/services/connectionStateService');

  const result = await service.upsertConnectionState({
    tenantId: 'tenant-1',
    provider: 'GA4',
    status: 'CONNECTED',
  });

  assert.equal(result, null);
});
