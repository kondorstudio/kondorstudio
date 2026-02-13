const { prisma } = require('../prisma');

const LOG_DISABLED =
  process.env.GA4_API_CALL_LOG_DISABLED === 'true' ||
  process.env.NODE_ENV === 'test';

const MAX_RESPONSE_BYTES = Math.max(0, Number(process.env.GA4_API_CALL_LOG_MAX_BYTES || 750_000));
const MAX_RESPONSE_ROWS = Math.max(0, Number(process.env.GA4_API_CALL_LOG_MAX_ROWS || 2000));

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[ga4ApiCallLogService]', ...args);
}

function hasModel() {
  return Boolean(prisma && prisma.ga4ApiCall);
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

function bytesOfJson(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  } catch (_) {
    return null;
  }
}

function truncateResponse(response) {
  if (!response || typeof response !== 'object') return response;
  if (!MAX_RESPONSE_BYTES) return response;

  const size = bytesOfJson(response);
  if (size === null || size <= MAX_RESPONSE_BYTES) return response;

  // Try trimming rows first.
  if (Array.isArray(response.rows)) {
    const trimmed = {
      ...response,
      rows: MAX_RESPONSE_ROWS > 0 ? response.rows.slice(0, MAX_RESPONSE_ROWS) : [],
      meta: {
        ...(response.meta || {}),
        truncated: true,
        truncatedRows: true,
        originalRows: response.rows.length,
        originalBytes: size,
      },
    };

    const trimmedSize = bytesOfJson(trimmed);
    if (trimmedSize !== null && trimmedSize <= MAX_RESPONSE_BYTES) return trimmed;
  }

  // Fallback: drop rows entirely.
  const withoutRows = {
    ...response,
    rows: [],
    meta: {
      ...(response.meta || {}),
      truncated: true,
      truncatedRows: true,
      droppedRows: true,
      originalBytes: size,
    },
  };
  return withoutRows;
}

function normalizeHttpStatus(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function normalizeDurationMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function normalizeError(err) {
  if (!err) return null;
  const message = err && err.message ? String(err.message) : String(err);
  const stack = err && err.stack ? String(err.stack) : null;
  const raw = stack || message;
  return raw.length > 8000 ? raw.slice(0, 8000) : raw;
}

async function logCall({
  tenantId,
  propertyId,
  kind,
  requestHash,
  request,
  response,
  httpStatus,
  error,
  durationMs,
}) {
  if (LOG_DISABLED) return null;
  if (!tenantId || !propertyId || !requestHash) return null;
  if (!hasModel()) return null;

  const normalizedKind = normalizeKind(kind);
  if (!normalizedKind) return null;

  try {
    const record = await prisma.ga4ApiCall.create({
      data: {
        tenantId: String(tenantId),
        propertyId: String(propertyId),
        kind: normalizedKind,
        requestHash: String(requestHash),
        request: request || {},
        response: response ? truncateResponse(response) : null,
        httpStatus: normalizeHttpStatus(httpStatus),
        error: normalizeError(error),
        durationMs: normalizeDurationMs(durationMs),
      },
    });
    return record;
  } catch (err) {
    // Table/model might not exist if migrations were not applied yet.
    safeLog('logCall failed (ignored)', err?.code || err?.message || err);
    return null;
  }
}

module.exports = {
  logCall,
};

