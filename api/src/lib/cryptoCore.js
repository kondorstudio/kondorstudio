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

function hasKeyValue(raw) {
  return Boolean(raw && String(raw).trim());
}

function keyEquals(a, b) {
  if (!a || !b) return false;
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function resolveKeyConfiguration() {
  const encryptionRaw = process.env.ENCRYPTION_KEY;
  const cryptoRaw = process.env.CRYPTO_KEY;
  const encryptionPreviousRaw = process.env.ENCRYPTION_KEY_PREVIOUS;
  const cryptoPreviousRaw = process.env.CRYPTO_KEY_PREVIOUS;

  const hasEncryptionKey = hasKeyValue(encryptionRaw);
  const hasCryptoKey = hasKeyValue(cryptoRaw);
  const hasEncryptionKeyPrevious = hasKeyValue(encryptionPreviousRaw);
  const hasCryptoKeyPrevious = hasKeyValue(cryptoPreviousRaw);
  const encryptionKey = parseEncryptionKey(encryptionRaw);
  const cryptoKeyDerived = deriveCryptoKey(cryptoRaw);
  const cryptoKeyRaw = parseEncryptionKey(cryptoRaw);
  const encryptionKeyPrevious = parseEncryptionKey(encryptionPreviousRaw);
  const cryptoKeyPreviousDerived = deriveCryptoKey(cryptoPreviousRaw);
  const cryptoKeyPreviousRaw = parseEncryptionKey(cryptoPreviousRaw);

  return {
    hasEncryptionKey,
    hasCryptoKey,
    hasEncryptionKeyPrevious,
    hasCryptoKeyPrevious,
    encryptionKey,
    cryptoKeyDerived,
    cryptoKeyRaw,
    encryptionKeyPrevious,
    cryptoKeyPreviousDerived,
    cryptoKeyPreviousRaw,
  };
}

function assertCryptoKeyConfiguration() {
  const cfg = resolveKeyConfiguration();
  const allowMismatch =
    String(process.env.ALLOW_CRYPTO_KEY_MISMATCH || '')
      .trim()
      .toLowerCase() === 'true';

  if (!cfg.hasEncryptionKey && !cfg.hasCryptoKey) {
    const err = new Error(
      'Missing encryption key configuration (set CRYPTO_KEY or ENCRYPTION_KEY)'
    );
    err.code = 'CRYPTO_KEY_MISSING';
    throw err;
  }

  if (cfg.hasEncryptionKey && !cfg.encryptionKey) {
    const err = new Error(
      'Invalid ENCRYPTION_KEY (expected 32-byte base64 or 64-char hex)'
    );
    err.code = 'CRYPTO_ENCRYPTION_KEY_INVALID';
    throw err;
  }

  if (cfg.hasEncryptionKeyPrevious && !cfg.encryptionKeyPrevious) {
    const err = new Error(
      'Invalid ENCRYPTION_KEY_PREVIOUS (expected 32-byte base64 or 64-char hex)'
    );
    err.code = 'CRYPTO_ENCRYPTION_KEY_PREVIOUS_INVALID';
    throw err;
  }

  if (cfg.hasEncryptionKey && cfg.hasCryptoKey) {
    const matchesDerived = keyEquals(cfg.encryptionKey, cfg.cryptoKeyDerived);
    const matchesRaw = keyEquals(cfg.encryptionKey, cfg.cryptoKeyRaw);
    if (!matchesDerived && !matchesRaw) {
      const err = new Error(
        'CRYPTO_KEY and ENCRYPTION_KEY resolve to different keys. Use a single key source or align both values identically across API and worker.'
      );
      err.code = 'CRYPTO_KEY_MISMATCH';
      if (!allowMismatch) {
        throw err;
      }
      console.warn(
        '[crypto] CRYPTO_KEY_MISMATCH tolerated by ALLOW_CRYPTO_KEY_MISMATCH=true. Keep only for legacy transition.'
      );
    }
  }

  if (cfg.hasEncryptionKeyPrevious && cfg.hasCryptoKeyPrevious) {
    const matchesDerived = keyEquals(
      cfg.encryptionKeyPrevious,
      cfg.cryptoKeyPreviousDerived,
    );
    const matchesRaw = keyEquals(
      cfg.encryptionKeyPrevious,
      cfg.cryptoKeyPreviousRaw,
    );
    if (!matchesDerived && !matchesRaw) {
      const err = new Error(
        'CRYPTO_KEY_PREVIOUS and ENCRYPTION_KEY_PREVIOUS resolve to different keys.'
      );
      err.code = 'CRYPTO_KEY_PREVIOUS_MISMATCH';
      if (!allowMismatch) {
        throw err;
      }
      console.warn(
        '[crypto] CRYPTO_KEY_PREVIOUS_MISMATCH tolerated by ALLOW_CRYPTO_KEY_MISMATCH=true.'
      );
    }
  }

  const candidates = buildCandidateKeys(['ENCRYPTION_KEY', 'CRYPTO_KEY']);
  const fallbackSources = candidates
    .map((entry) => entry.source)
    .filter(
      (source) => source !== 'ENCRYPTION_KEY' && source !== 'CRYPTO_KEY',
    );

  return {
    hasEncryptionKey: cfg.hasEncryptionKey,
    hasCryptoKey: cfg.hasCryptoKey,
    effectiveSource: cfg.hasEncryptionKey ? 'ENCRYPTION_KEY' : 'CRYPTO_KEY',
    fallbackKeyCount: fallbackSources.length,
    fallbackSources,
  };
}

function buildCandidateKeys(preferred = []) {
  const encryptionKey = parseEncryptionKey(process.env.ENCRYPTION_KEY);
  const cryptoKey = deriveCryptoKey(process.env.CRYPTO_KEY);
  const encryptionKeyPrevious = parseEncryptionKey(
    process.env.ENCRYPTION_KEY_PREVIOUS,
  );
  const cryptoKeyPrevious = deriveCryptoKey(process.env.CRYPTO_KEY_PREVIOUS);

  const map = {
    ENCRYPTION_KEY: encryptionKey,
    CRYPTO_KEY: cryptoKey,
    ENCRYPTION_KEY_PREVIOUS: encryptionKeyPrevious,
    CRYPTO_KEY_PREVIOUS: cryptoKeyPrevious,
  };

  const seen = [];
  const ordered = [];
  const pushIfUnique = (source, key) => {
    if (!key) return;
    if (seen.some((existing) => keyEquals(existing, key))) return;
    seen.push(key);
    ordered.push({ source, key });
  };
  for (const source of preferred) {
    pushIfUnique(source, map[source]);
  }
  for (const [source, key] of Object.entries(map)) {
    if (ordered.some((entry) => entry.source === source)) continue;
    pushIfUnique(source, key);
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
  assertCryptoKeyConfiguration,
};
