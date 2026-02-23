process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

function resetModule(path) {
  const resolved = require.resolve(path);
  delete require.cache[resolved];
}

function loadCryptoCore() {
  resetModule('../src/lib/cryptoCore');
  // eslint-disable-next-line global-require
  return require('../src/lib/cryptoCore');
}

const ORIGINAL_ENV = {
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  CRYPTO_KEY: process.env.CRYPTO_KEY,
  ENCRYPTION_KEY_PREVIOUS: process.env.ENCRYPTION_KEY_PREVIOUS,
  CRYPTO_KEY_PREVIOUS: process.env.CRYPTO_KEY_PREVIOUS,
  ALLOW_CRYPTO_KEY_MISMATCH: process.env.ALLOW_CRYPTO_KEY_MISMATCH,
};

function restoreEnvValue(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

test.afterEach(() => {
  restoreEnvValue('ENCRYPTION_KEY', ORIGINAL_ENV.ENCRYPTION_KEY);
  restoreEnvValue('CRYPTO_KEY', ORIGINAL_ENV.CRYPTO_KEY);
  restoreEnvValue('ENCRYPTION_KEY_PREVIOUS', ORIGINAL_ENV.ENCRYPTION_KEY_PREVIOUS);
  restoreEnvValue('CRYPTO_KEY_PREVIOUS', ORIGINAL_ENV.CRYPTO_KEY_PREVIOUS);
  restoreEnvValue('ALLOW_CRYPTO_KEY_MISMATCH', ORIGINAL_ENV.ALLOW_CRYPTO_KEY_MISMATCH);
  resetModule('../src/lib/cryptoCore');
});

test('decrypt supports ENCRYPTION_KEY_PREVIOUS fallback', () => {
  const currentKey = Buffer.alloc(32, 7).toString('base64');
  const previousKey = Buffer.alloc(32, 9).toString('base64');
  process.env.ENCRYPTION_KEY = currentKey;
  process.env.ENCRYPTION_KEY_PREVIOUS = previousKey;
  delete process.env.CRYPTO_KEY;
  delete process.env.CRYPTO_KEY_PREVIOUS;

  const { createCryptoAdapter, assertCryptoKeyConfiguration } = loadCryptoCore();
  const validation = assertCryptoKeyConfiguration();
  assert.equal(validation?.effectiveSource, 'ENCRYPTION_KEY');
  assert.equal(Number(validation?.fallbackKeyCount || 0), 1);

  const previousOnlyAdapter = createCryptoAdapter(['ENCRYPTION_KEY_PREVIOUS']);
  const payloadFromPrevious = previousOnlyAdapter.encrypt('legacy-token');

  const defaultAdapter = createCryptoAdapter(['ENCRYPTION_KEY', 'CRYPTO_KEY']);
  assert.equal(defaultAdapter.decrypt(payloadFromPrevious), 'legacy-token');
});

test('encrypt still uses primary key, not previous fallback', () => {
  const currentKey = Buffer.alloc(32, 21).toString('base64');
  const previousKey = Buffer.alloc(32, 3).toString('base64');
  process.env.ENCRYPTION_KEY = currentKey;
  process.env.ENCRYPTION_KEY_PREVIOUS = previousKey;
  delete process.env.CRYPTO_KEY;
  delete process.env.CRYPTO_KEY_PREVIOUS;

  const { createCryptoAdapter } = loadCryptoCore();
  const defaultAdapter = createCryptoAdapter(['ENCRYPTION_KEY', 'CRYPTO_KEY']);
  const encrypted = defaultAdapter.encrypt('new-token');

  const primaryOnlyAdapter = createCryptoAdapter(['ENCRYPTION_KEY']);
  assert.equal(primaryOnlyAdapter.decrypt(encrypted), 'new-token');

  delete process.env.ENCRYPTION_KEY;
  const { createCryptoAdapter: createFallbackOnlyAdapter } = loadCryptoCore();
  const previousOnlyAdapter = createFallbackOnlyAdapter([
    'ENCRYPTION_KEY_PREVIOUS',
    'CRYPTO_KEY_PREVIOUS',
  ]);
  assert.throws(() => previousOnlyAdapter.decrypt(encrypted));
});

test('assertCryptoKeyConfiguration fails when no primary key configured', () => {
  delete process.env.ENCRYPTION_KEY;
  delete process.env.CRYPTO_KEY;
  delete process.env.ENCRYPTION_KEY_PREVIOUS;
  delete process.env.CRYPTO_KEY_PREVIOUS;

  const { assertCryptoKeyConfiguration } = loadCryptoCore();
  assert.throws(
    () => assertCryptoKeyConfiguration(),
    (error) => error?.code === 'CRYPTO_KEY_MISSING',
  );
});
