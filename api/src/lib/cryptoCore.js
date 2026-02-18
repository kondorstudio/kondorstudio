const crypto = require('crypto');

function parseEncryptionKey(raw) {
  if (!raw || !String(raw).trim()) return null;
  const trimmed = String(raw).trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  try {
    const key = Buffer.from(trimmed, 'base64');
    if (key.length === 32) return key;
    return null;
  } catch (_err) {
    return null;
  }
}

function deriveCryptoKey(raw) {
  if (!raw || !String(raw).trim()) return null;
  return crypto
    .createHash('sha256')
    .update(Buffer.from(String(raw), 'utf8'))
    .digest();
}

function buildCandidateKeys(preferred = []) {
  const encryptionKey = parseEncryptionKey(process.env.ENCRYPTION_KEY);
  const cryptoKey = deriveCryptoKey(process.env.CRYPTO_KEY);

  const map = {
    ENCRYPTION_KEY: encryptionKey,
    CRYPTO_KEY: cryptoKey,
  };

  const ordered = [];
  for (const source of preferred) {
    if (map[source]) ordered.push({ source, key: map[source] });
  }
  for (const [source, key] of Object.entries(map)) {
    if (!key) continue;
    if (ordered.some((entry) => entry.source === source)) continue;
    ordered.push({ source, key });
  }
  return ordered;
}

function assertString(value, label) {
  if (value === null || value === undefined || typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
}

function encryptWithKey(text, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptWithKey(payload, key) {
  const raw = Buffer.from(payload, 'base64');
  if (raw.length < 28) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function createCryptoAdapter(preferredKeyOrder = []) {
  function getKeys() {
    const keys = buildCandidateKeys(preferredKeyOrder);
    if (!keys.length) {
      throw new Error('Missing encryption key (set CRYPTO_KEY or ENCRYPTION_KEY)');
    }
    return keys;
  }

  return {
    encrypt(text) {
      assertString(text, 'text');
      const [{ key }] = getKeys();
      return encryptWithKey(text, key);
    },
    decrypt(payload) {
      assertString(payload, 'payload');
      const keys = getKeys();
      let lastError = null;
      for (const { key } of keys) {
        try {
          return decryptWithKey(payload, key);
        } catch (err) {
          lastError = err;
        }
      }
      if (lastError) throw lastError;
      throw new Error('Unable to decrypt payload');
    },
  };
}

module.exports = {
  createCryptoAdapter,
};
