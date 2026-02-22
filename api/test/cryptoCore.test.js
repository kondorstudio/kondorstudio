const test = require('node:test');
const assert = require('node:assert/strict');

const { assertCryptoKeyConfiguration } = require('../src/lib/cryptoCore');

const KEY_A = '1111111111111111111111111111111111111111111111111111111111111111';
const KEY_B = '2222222222222222222222222222222222222222222222222222222222222222';

function withEnv(env, fn) {
  const original = {
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    CRYPTO_KEY: process.env.CRYPTO_KEY,
    ALLOW_CRYPTO_KEY_MISMATCH: process.env.ALLOW_CRYPTO_KEY_MISMATCH,
  };

  process.env.ENCRYPTION_KEY = env.ENCRYPTION_KEY;
  process.env.CRYPTO_KEY = env.CRYPTO_KEY;
  process.env.ALLOW_CRYPTO_KEY_MISMATCH = env.ALLOW_CRYPTO_KEY_MISMATCH;

  try {
    return fn();
  } finally {
    if (original.ENCRYPTION_KEY === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = original.ENCRYPTION_KEY;

    if (original.CRYPTO_KEY === undefined) delete process.env.CRYPTO_KEY;
    else process.env.CRYPTO_KEY = original.CRYPTO_KEY;

    if (original.ALLOW_CRYPTO_KEY_MISMATCH === undefined) {
      delete process.env.ALLOW_CRYPTO_KEY_MISMATCH;
    } else {
      process.env.ALLOW_CRYPTO_KEY_MISMATCH = original.ALLOW_CRYPTO_KEY_MISMATCH;
    }
  }
}

test('assertCryptoKeyConfiguration throws on mismatch by default', () => {
  withEnv(
    {
      ENCRYPTION_KEY: KEY_A,
      CRYPTO_KEY: KEY_B,
      ALLOW_CRYPTO_KEY_MISMATCH: '',
    },
    () => {
      assert.throws(
        () => assertCryptoKeyConfiguration(),
        (err) => err && err.code === 'CRYPTO_KEY_MISMATCH'
      );
    }
  );
});

test('assertCryptoKeyConfiguration allows mismatch when opt-in flag is true', () => {
  withEnv(
    {
      ENCRYPTION_KEY: KEY_A,
      CRYPTO_KEY: KEY_B,
      ALLOW_CRYPTO_KEY_MISMATCH: 'true',
    },
    () => {
      assert.doesNotThrow(() => assertCryptoKeyConfiguration());
    }
  );
});

