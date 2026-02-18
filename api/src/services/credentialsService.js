const crypto = require('crypto');
const { prisma } = require('../prisma');
const { encrypt, decrypt } = require('../lib/crypto');
const { SECRET_REF_PREFIX, isSecretRef } = require('../lib/credentialGuard');

function hasVaultModel(db = prisma) {
  return Boolean(db && db.credentialVault && typeof db.credentialVault.create === 'function');
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function sanitizeJson(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => sanitizeJson(entry));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = sanitizeJson(entry);
    }
    return out;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

function encodeSecret(secret) {
  if (typeof secret === 'string') return secret;
  return JSON.stringify(sanitizeJson(secret));
}

function decodeSecret(text) {
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch (_err) {
    return text;
  }
}

function buildSecretRef(id) {
  return `${SECRET_REF_PREFIX}credential/${id}`;
}

function isUsableSecret(secret) {
  if (secret === null || secret === undefined) return false;
  if (typeof secret === 'string') return Boolean(secret.trim());
  if (typeof secret === 'object') return Object.keys(secret).length > 0;
  return true;
}

async function storeCredential(payload = {}, options = {}) {
  const db = options.db || prisma;
  if (!hasVaultModel(db)) {
    const err = new Error('CredentialVault model unavailable');
    err.code = 'CREDENTIAL_VAULT_UNAVAILABLE';
    err.status = 503;
    throw err;
  }

  const tenantId = toText(payload.tenantId);
  const provider = toText(payload.provider);
  if (!tenantId || !provider) {
    const err = new Error('tenantId and provider are required');
    err.code = 'CREDENTIAL_VAULT_BAD_INPUT';
    err.status = 400;
    throw err;
  }

  const secret = payload.secret;
  if (!isUsableSecret(secret)) {
    const err = new Error('secret is required');
    err.code = 'CREDENTIAL_SECRET_REQUIRED';
    err.status = 400;
    throw err;
  }

  const id = crypto.randomUUID();
  const secretRef = buildSecretRef(id);
  const secretEnc = encrypt(encodeSecret(secret));

  const created = await db.credentialVault.create({
    data: {
      id,
      secretRef,
      tenantId,
      provider: provider.toUpperCase(),
      integrationId: toText(payload.integrationId),
      kind: toText(payload.kind) || 'GENERIC',
      secretEnc,
      meta: sanitizeJson(payload.meta || null),
      rotatedAt: payload.rotatedAt ? new Date(payload.rotatedAt) : null,
    },
    select: {
      id: true,
      secretRef: true,
      tenantId: true,
      provider: true,
      integrationId: true,
      kind: true,
      createdAt: true,
    },
  });

  return created;
}

async function resolveCredential(secretRef, options = {}) {
  const db = options.db || prisma;
  if (!hasVaultModel(db)) return null;
  if (!isSecretRef(secretRef)) return null;

  const where = {
    secretRef: String(secretRef).trim(),
  };

  const tenantId = toText(options.tenantId);
  if (tenantId) where.tenantId = tenantId;

  const record = await db.credentialVault.findFirst({
    where,
    select: {
      id: true,
      secretRef: true,
      tenantId: true,
      provider: true,
      integrationId: true,
      kind: true,
      secretEnc: true,
      meta: true,
      createdAt: true,
      updatedAt: true,
      rotatedAt: true,
    },
  });
  if (!record) return null;

  const decrypted = decrypt(record.secretEnc);
  return {
    ...record,
    secret: decodeSecret(decrypted),
  };
}

module.exports = {
  buildSecretRef,
  storeCredential,
  resolveCredential,
};
