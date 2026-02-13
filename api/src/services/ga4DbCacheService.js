const { prisma } = require('../prisma');

const DB_CACHE_DISABLED =
  process.env.GA4_DB_CACHE_DISABLED === 'true' ||
  process.env.NODE_ENV === 'test';

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[ga4DbCacheService]', ...args);
}

function hasModel() {
  return Boolean(prisma && prisma.ga4ApiCache);
}

function normalizeKind(kind) {
  const raw = String(kind || '').trim().toUpperCase();
  if (!raw) return null;
  // Keep in sync with enum Ga4ApiCacheKind in schema.prisma
  if (raw === 'REPORT') return 'REPORT';
  if (raw === 'REALTIME') return 'REALTIME';
  if (raw === 'METADATA') return 'METADATA';
  if (raw === 'COMPATIBILITY') return 'COMPATIBILITY';
  if (raw === 'BATCH_REPORT') return 'BATCH_REPORT';
  return null;
}

async function getCache({ tenantId, propertyId, kind, requestHash }) {
  if (DB_CACHE_DISABLED) return null;
  if (!tenantId || !propertyId || !requestHash) return null;
  if (!hasModel()) return null;
  const normalizedKind = normalizeKind(kind);
  if (!normalizedKind) return null;

  try {
    const row = await prisma.ga4ApiCache.findFirst({
      where: {
        tenantId: String(tenantId),
        propertyId: String(propertyId),
        kind: normalizedKind,
        requestHash: String(requestHash),
      },
      select: {
        response: true,
        expiresAt: true,
      },
    });

    if (!row) return null;
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    return row.response || null;
  } catch (err) {
    // Table/model might not exist if migrations were not applied yet.
    safeLog('getCache failed (ignored)', err?.code || err?.message || err);
    return null;
  }
}

async function setCache({ tenantId, propertyId, kind, requestHash, request, response, ttlMs }) {
  if (DB_CACHE_DISABLED) return null;
  if (!tenantId || !propertyId || !requestHash) return null;
  if (!hasModel()) return null;
  const normalizedKind = normalizeKind(kind);
  if (!normalizedKind) return null;

  const ttl = Number(ttlMs);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    // Respect per-call caching policy: ttl <= 0 means "don't persist cache".
    return null;
  }

  const expiresAt = new Date(Date.now() + ttl);

  try {
    await prisma.ga4ApiCache.upsert({
      where: {
        tenantId_propertyId_kind_requestHash: {
          tenantId: String(tenantId),
          propertyId: String(propertyId),
          kind: normalizedKind,
          requestHash: String(requestHash),
        },
      },
      create: {
        tenantId: String(tenantId),
        propertyId: String(propertyId),
        kind: normalizedKind,
        requestHash: String(requestHash),
        request: request || {},
        response: response || {},
        expiresAt,
      },
      update: {
        request: request || {},
        response: response || {},
        expiresAt,
      },
    });
  } catch (err) {
    safeLog('setCache failed (ignored)', err?.code || err?.message || err);
  }

  return response;
}

module.exports = {
  getCache,
  setCache,
};

