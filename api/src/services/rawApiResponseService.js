const crypto = require('crypto');
const { prisma } = require('../prisma');

const RAW_API_DISABLED =
  process.env.RAW_API_DISABLED === 'true' || process.env.NODE_ENV === 'test';
const RAW_API_RETENTION_DAYS = Math.max(0, Number(process.env.RAW_API_RETENTION_DAYS || 30));
const RAW_API_MAX_PAYLOAD_BYTES = Math.max(
  0,
  Number(process.env.RAW_API_MAX_PAYLOAD_BYTES || 1_000_000),
);
const RAW_API_MAX_ROWS = Math.max(0, Number(process.env.RAW_API_MAX_ROWS || 2000));

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[rawApiResponseService]', ...args);
}

function hasModel(db = prisma) {
  return Boolean(db && db.rawApiResponse && typeof db.rawApiResponse.create === 'function');
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function sanitizeForJson(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJson(item));
  }

  if (typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([key, entry]) => {
      const normalized = sanitizeForJson(entry);
      if (normalized !== undefined) out[key] = normalized;
    });
    return out;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }

  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

function stableStringify(value) {
  const normalized = sanitizeForJson(value);

  const encode = (entry) => {
    if (entry === null) return 'null';
    if (Array.isArray(entry)) {
      return `[${entry.map((item) => encode(item)).join(',')}]`;
    }
    if (typeof entry === 'object') {
      const keys = Object.keys(entry).sort();
      const body = keys
        .map((key) => `${JSON.stringify(key)}:${encode(entry[key])}`)
        .join(',');
      return `{${body}}`;
    }
    return JSON.stringify(entry);
  };

  return encode(normalized);
}

function hashParams(params) {
  const serialized = stableStringify(params || {});
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function jsonByteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  } catch (_err) {
    return null;
  }
}

function truncatePayload(payload) {
  const normalized = sanitizeForJson(payload);
  if (!RAW_API_MAX_PAYLOAD_BYTES) {
    return {
      payload: normalized,
      compressed: false,
    };
  }

  const currentSize = jsonByteLength(normalized);
  if (currentSize === null || currentSize <= RAW_API_MAX_PAYLOAD_BYTES) {
    return {
      payload: normalized,
      compressed: false,
    };
  }

  if (Array.isArray(normalized?.rows)) {
    const trimmedRows = RAW_API_MAX_ROWS > 0 ? normalized.rows.slice(0, RAW_API_MAX_ROWS) : [];
    const trimmed = {
      ...normalized,
      rows: trimmedRows,
      _rawTruncated: {
        by: 'rows',
        originalBytes: currentSize,
        originalRows: normalized.rows.length,
        keptRows: trimmedRows.length,
      },
    };
    const trimmedSize = jsonByteLength(trimmed);
    if (trimmedSize !== null && trimmedSize <= RAW_API_MAX_PAYLOAD_BYTES) {
      return {
        payload: trimmed,
        compressed: false,
      };
    }
  }

  return {
    payload: {
      _rawTruncated: {
        by: 'payload',
        originalBytes: currentSize,
      },
      preview: stableStringify(normalized).slice(0, 8_192),
    },
    compressed: false,
  };
}

function resolveRetentionUntil({ retentionUntil, retentionDays } = {}) {
  const explicit = toDateOrNull(retentionUntil);
  if (explicit) return explicit;

  const daysCandidate = retentionDays !== undefined ? Number(retentionDays) : RAW_API_RETENTION_DAYS;
  if (!Number.isFinite(daysCandidate) || daysCandidate <= 0) return null;
  return new Date(Date.now() + Math.floor(daysCandidate) * 24 * 60 * 60 * 1000);
}

async function appendRawApiResponse(payload = {}, options = {}) {
  const db = options.db || prisma;
  if (RAW_API_DISABLED) {
    return { ok: false, skipped: true, reason: 'raw_api_disabled' };
  }
  if (!hasModel(db)) {
    return { ok: false, skipped: true, reason: 'raw_api_model_unavailable' };
  }

  const provider = toText(payload.provider);
  const endpoint = toText(payload.endpoint);
  if (!provider || !endpoint) {
    return { ok: false, skipped: true, reason: 'provider_or_endpoint_missing' };
  }

  const params = sanitizeForJson(payload.params || {});
  const truncated = truncatePayload(payload.payload);

  try {
    const created = await db.rawApiResponse.create({
      data: {
        tenantId: toText(payload.tenantId),
        brandId: toText(payload.brandId),
        provider: provider.toUpperCase(),
        connectionId: toText(payload.connectionId),
        runId: toText(payload.runId),
        chunkId: toText(payload.chunkId),
        endpoint,
        paramsHash: hashParams(params),
        params,
        payload: truncated.payload,
        cursor: toText(payload.cursor),
        httpStatus:
          payload.httpStatus !== undefined && payload.httpStatus !== null
            ? Number(payload.httpStatus) || null
            : null,
        compressed: truncated.compressed === true,
        fetchedAt: toDateOrNull(payload.fetchedAt) || new Date(),
        retentionUntil: resolveRetentionUntil({
          retentionUntil: payload.retentionUntil,
          retentionDays: payload.retentionDays,
        }),
      },
    });
    return { ok: true, id: created.id };
  } catch (err) {
    safeLog('appendRawApiResponse failed (ignored)', err?.code || err?.message || err);
    return { ok: false, skipped: true, reason: 'raw_api_write_failed' };
  }
}

async function appendRawApiResponses(items = [], options = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return { ok: true, rows: 0, inserted: 0 };
  }

  let inserted = 0;
  for (const item of list) {
    // eslint-disable-next-line no-await-in-loop
    const result = await appendRawApiResponse(item, options);
    if (result?.ok) inserted += 1;
  }

  return {
    ok: true,
    rows: list.length,
    inserted,
  };
}

async function purgeExpiredRawApiResponses(options = {}) {
  const db = options.db || prisma;
  if (!hasModel(db)) {
    return { ok: false, skipped: true, reason: 'raw_api_model_unavailable', deleted: 0 };
  }

  const now = options.now ? toDateOrNull(options.now) || new Date() : new Date();

  try {
    const result = await db.rawApiResponse.deleteMany({
      where: {
        retentionUntil: {
          not: null,
          lt: now,
        },
      },
    });
    return {
      ok: true,
      deleted: result?.count || 0,
    };
  } catch (err) {
    safeLog('purgeExpiredRawApiResponses failed (ignored)', err?.code || err?.message || err);
    return { ok: false, skipped: true, reason: 'raw_api_purge_failed', deleted: 0 };
  }
}

module.exports = {
  hashParams,
  stableStringify,
  sanitizeForJson,
  appendRawApiResponse,
  appendRawApiResponses,
  purgeExpiredRawApiResponses,
};
