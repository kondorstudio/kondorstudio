const { prisma } = require('../prisma');

function toDateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

async function createRun(payload = {}, options = {}) {
  const db = options.db || prisma;
  if (!payload.tenantId) throw new Error('tenantId is required');
  if (!payload.provider) throw new Error('provider is required');
  if (!payload.runType) throw new Error('runType is required');

  return db.syncRun.create({
    data: {
      tenantId: String(payload.tenantId),
      brandId: textOrNull(payload.brandId),
      provider: String(payload.provider).toUpperCase(),
      connectionId: textOrNull(payload.connectionId),
      connectionKey: textOrNull(payload.connectionKey),
      runType: String(payload.runType).toUpperCase(),
      status: String(payload.status || 'QUEUED').toUpperCase(),
      periodStart: toDateOrNull(payload.periodStart),
      periodEnd: toDateOrNull(payload.periodEnd),
      cursorStart: textOrNull(payload.cursorStart),
      cursorEnd: textOrNull(payload.cursorEnd),
      rowsRead: toInt(payload.rowsRead, 0),
      rowsWritten: toInt(payload.rowsWritten, 0),
      retryCount: toInt(payload.retryCount, 0),
      startedAt: toDateOrNull(payload.startedAt),
      finishedAt: toDateOrNull(payload.finishedAt),
      durationMs: payload.durationMs !== undefined ? toInt(payload.durationMs, 0) : null,
      meta: payload.meta || null,
    },
  });
}

async function updateRun(runId, payload = {}, options = {}) {
  const db = options.db || prisma;
  if (!runId) throw new Error('runId is required');

  const data = {};
  if (payload.status !== undefined) data.status = String(payload.status).toUpperCase();
  if (payload.startedAt !== undefined) data.startedAt = toDateOrNull(payload.startedAt);
  if (payload.finishedAt !== undefined) data.finishedAt = toDateOrNull(payload.finishedAt);
  if (payload.rowsRead !== undefined) data.rowsRead = toInt(payload.rowsRead, 0);
  if (payload.rowsWritten !== undefined) data.rowsWritten = toInt(payload.rowsWritten, 0);
  if (payload.retryCount !== undefined) data.retryCount = toInt(payload.retryCount, 0);
  if (payload.cursorStart !== undefined) data.cursorStart = textOrNull(payload.cursorStart);
  if (payload.cursorEnd !== undefined) data.cursorEnd = textOrNull(payload.cursorEnd);
  if (payload.periodStart !== undefined) data.periodStart = toDateOrNull(payload.periodStart);
  if (payload.periodEnd !== undefined) data.periodEnd = toDateOrNull(payload.periodEnd);
  if (payload.durationMs !== undefined) data.durationMs = toInt(payload.durationMs, 0);
  if (payload.meta !== undefined) data.meta = payload.meta || null;

  return db.syncRun.update({
    where: { id: String(runId) },
    data,
  });
}

async function createChunk(payload = {}, options = {}) {
  const db = options.db || prisma;
  if (!payload.runId) throw new Error('runId is required');

  return db.syncChunk.create({
    data: {
      runId: String(payload.runId),
      tenantId: textOrNull(payload.tenantId),
      brandId: textOrNull(payload.brandId),
      provider: textOrNull(payload.provider),
      status: String(payload.status || 'QUEUED').toUpperCase(),
      cursorStart: textOrNull(payload.cursorStart),
      cursorEnd: textOrNull(payload.cursorEnd),
      chunkKey: textOrNull(payload.chunkKey),
      attempt: toInt(payload.attempt, 0),
      rowsRead: toInt(payload.rowsRead, 0),
      rowsWritten: toInt(payload.rowsWritten, 0),
      durationMs: payload.durationMs !== undefined ? toInt(payload.durationMs, 0) : null,
      startedAt: toDateOrNull(payload.startedAt),
      finishedAt: toDateOrNull(payload.finishedAt),
      meta: payload.meta || null,
    },
  });
}

async function updateChunk(chunkId, payload = {}, options = {}) {
  const db = options.db || prisma;
  if (!chunkId) throw new Error('chunkId is required');

  const data = {};
  if (payload.status !== undefined) data.status = String(payload.status).toUpperCase();
  if (payload.startedAt !== undefined) data.startedAt = toDateOrNull(payload.startedAt);
  if (payload.finishedAt !== undefined) data.finishedAt = toDateOrNull(payload.finishedAt);
  if (payload.rowsRead !== undefined) data.rowsRead = toInt(payload.rowsRead, 0);
  if (payload.rowsWritten !== undefined) data.rowsWritten = toInt(payload.rowsWritten, 0);
  if (payload.attempt !== undefined) data.attempt = toInt(payload.attempt, 0);
  if (payload.durationMs !== undefined) data.durationMs = toInt(payload.durationMs, 0);
  if (payload.meta !== undefined) data.meta = payload.meta || null;

  return db.syncChunk.update({
    where: { id: String(chunkId) },
    data,
  });
}

async function recordSyncError(payload = {}, options = {}) {
  const db = options.db || prisma;
  if (!payload.message) throw new Error('message is required');

  return db.syncError.create({
    data: {
      runId: textOrNull(payload.runId),
      chunkId: textOrNull(payload.chunkId),
      tenantId: textOrNull(payload.tenantId),
      brandId: textOrNull(payload.brandId),
      provider: textOrNull(payload.provider),
      connectionId: textOrNull(payload.connectionId),
      httpStatus:
        payload.httpStatus !== undefined && payload.httpStatus !== null
          ? Number(payload.httpStatus) || null
          : null,
      providerCode: textOrNull(payload.providerCode),
      retryable: payload.retryable === true,
      message: String(payload.message),
      details: payload.details || null,
    },
  });
}

async function incrementRunRetryCount(runId, incrementBy = 1, options = {}) {
  const db = options.db || prisma;
  if (!runId) return null;
  const amount = toInt(incrementBy, 1);
  if (amount <= 0) return null;

  return db.syncRun.update({
    where: { id: String(runId) },
    data: {
      retryCount: { increment: amount },
    },
  });
}

module.exports = {
  createRun,
  updateRun,
  createChunk,
  updateChunk,
  recordSyncError,
  incrementRunRetryCount,
};
