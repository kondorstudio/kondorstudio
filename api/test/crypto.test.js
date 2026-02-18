process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
process.env.CRYPTO_KEY = 'kondor-crypto-key-for-tests';

const test = require('node:test');
const assert = require('node:assert/strict');

const { encrypt, decrypt } = require('../src/lib/crypto');
const legacyCrypto = require('../src/utils/crypto');

test('encrypt/decrypt roundtrip', () => {
  const value = 'hello-world';
  const encrypted = encrypt(value);
  const decrypted = decrypt(encrypted);
  assert.equal(decrypted, value);
});

test('utils crypto remains compatible after unification', () => {
  const value = 'legacy-token';
  const encrypted = legacyCrypto.encrypt(value);
  const decrypted = legacyCrypto.decrypt(encrypted);
  assert.equal(decrypted, value);
});
