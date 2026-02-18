const { prisma } = require('../prisma');

const STATUS = Object.freeze({
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
  REAUTH_REQUIRED: 'REAUTH_REQUIRED',
});

function normalizeProvider(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) throw new Error('provider is required');
  return raw;
}

function hasConnectionStateModel(db) {
  return Boolean(
    db &&
      db.connectionState &&
      typeof db.connectionState.upsert === 'function' &&
      typeof db.connectionState.findUnique === 'function',
  );
}

function normalizeConnectionStatus(value, fallback = STATUS.ERROR) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return fallback;

  if (raw === 'ACTIVE' || raw === 'CONNECTED') return STATUS.CONNECTED;
  if (raw === 'INACTIVE' || raw === 'DISCONNECTED') return STATUS.DISCONNECTED;
  if (raw === 'NEEDS_RECONNECT' || raw === 'REAUTH_REQUIRED') {
    return STATUS.REAUTH_REQUIRED;
  }
  if (raw === 'ERROR' || raw === 'FAILED') return STATUS.ERROR;

  if (raw in STATUS) return raw;
  return fallback;
}

function normalizeTenantId(value) {
  const tenantId = String(value || '').trim();
  if (!tenantId) throw new Error('tenantId is required');
  return tenantId;
}

function normalizeBrandId(value) {
  const brandId = String(value || '').trim();
  return brandId || null;
}

function normalizeConnectionKey(value) {
  const key = String(value || '').trim();
  return key || 'default';
}

function buildStateKey({ tenantId, provider, brandId, connectionKey }) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const normalizedProvider = normalizeProvider(provider);
  const normalizedBrandId = normalizeBrandId(brandId);
  const normalizedConnectionKey = normalizeConnectionKey(connectionKey);
  const scope = normalizedBrandId ? `brand:${normalizedBrandId}` : 'tenant';
  return [
    normalizedTenantId,
    normalizedProvider,
    scope,
    normalizedConnectionKey,
  ].join(':');
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function sanitizeText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text || null;
}

async function upsertConnectionState(payload = {}, options = {}) {
  const db = options.db || prisma;
  if (!hasConnectionStateModel(db)) return null;
  const tenantId = normalizeTenantId(payload.tenantId);
  const provider = normalizeProvider(payload.provider);
  const brandId = normalizeBrandId(payload.brandId);
  const connectionKey = normalizeConnectionKey(payload.connectionKey);
  const stateKey = buildStateKey({ tenantId, provider, brandId, connectionKey });
  const status = normalizeConnectionStatus(payload.status, STATUS.ERROR);

  const data = {
    tenantId,
    brandId,
    provider,
    connectionKey,
    connectionId: sanitizeText(payload.connectionId),
    status,
    metadata:
      payload.metadata !== undefined
        ? payload.metadata
        : payload.meta !== undefined
          ? payload.meta
          : undefined,
    nextRetryAt: payload.nextRetryAt !== undefined ? toDateOrNull(payload.nextRetryAt) : undefined,
    lastSuccessAt: payload.lastSuccessAt !== undefined ? toDateOrNull(payload.lastSuccessAt) : undefined,
    lastErrorAt: payload.lastErrorAt !== undefined ? toDateOrNull(payload.lastErrorAt) : undefined,
  };

  const shouldResetReason =
    status === STATUS.CONNECTED || status === STATUS.DISCONNECTED;

  if (payload.reasonCode !== undefined || shouldResetReason) {
    data.reasonCode = sanitizeText(payload.reasonCode);
  }
  if (payload.reasonMessage !== undefined || shouldResetReason) {
    data.reasonMessage = sanitizeText(payload.reasonMessage);
  }
  if (payload.nextAction !== undefined || shouldResetReason) {
    data.nextAction = sanitizeText(payload.nextAction);
  }

  if (status === STATUS.CONNECTED && data.lastSuccessAt === undefined) {
    data.lastSuccessAt = new Date();
  }
  if (
    (status === STATUS.ERROR || status === STATUS.REAUTH_REQUIRED) &&
    data.lastErrorAt === undefined
  ) {
    data.lastErrorAt = new Date();
  }

  return db.connectionState.upsert({
    where: { stateKey },
    update: data,
    create: {
      stateKey,
      ...data,
    },
  });
}

async function getConnectionState(
  { tenantId, provider, brandId, connectionKey = 'default' },
  options = {},
) {
  const db = options.db || prisma;
  if (!hasConnectionStateModel(db)) return null;
  const stateKey = buildStateKey({ tenantId, provider, brandId, connectionKey });
  return db.connectionState.findUnique({ where: { stateKey } });
}

async function markConnected(payload = {}, options = {}) {
  return upsertConnectionState(
    {
      ...payload,
      status: STATUS.CONNECTED,
      lastSuccessAt: payload.lastSuccessAt || new Date(),
      reasonCode: payload.reasonCode !== undefined ? payload.reasonCode : null,
      reasonMessage: payload.reasonMessage !== undefined ? payload.reasonMessage : null,
      nextAction: payload.nextAction !== undefined ? payload.nextAction : null,
    },
    options,
  );
}

async function markDisconnected(payload = {}, options = {}) {
  return upsertConnectionState(
    {
      ...payload,
      status: STATUS.DISCONNECTED,
      nextRetryAt: null,
    },
    options,
  );
}

async function markError(payload = {}, options = {}) {
  return upsertConnectionState(
    {
      ...payload,
      status: STATUS.ERROR,
      lastErrorAt: payload.lastErrorAt || new Date(),
    },
    options,
  );
}

async function markReauthRequired(payload = {}, options = {}) {
  return upsertConnectionState(
    {
      ...payload,
      status: STATUS.REAUTH_REQUIRED,
      lastErrorAt: payload.lastErrorAt || new Date(),
      nextAction: payload.nextAction || 'Reconnect account',
    },
    options,
  );
}

module.exports = {
  STATUS,
  normalizeConnectionStatus,
  buildStateKey,
  upsertConnectionState,
  getConnectionState,
  markConnected,
  markDisconnected,
  markError,
  markReauthRequired,
};
