const { prisma } = require('../../prisma');

const RUN_STATUSES = new Set([
  'QUEUED',
  'RUNNING',
  'SUCCESS',
  'PARTIAL_SUCCESS',
  'FAILED',
  'CANCELLED',
]);

const RUN_TYPES = new Set(['PREVIEW', 'BACKFILL', 'INCREMENTAL']);

function toUpperOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim().toUpperCase();
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

function clampInt(value, min, max, fallback) {
  const parsed = toInt(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseSinceHours(value, fallback = 24) {
  return clampInt(value, 1, 24 * 30, fallback);
}

function buildRunWhere(filters = {}) {
  const where = {};

  if (filters.tenantId) where.tenantId = String(filters.tenantId);
  if (filters.brandId) where.brandId = String(filters.brandId);

  const provider = toUpperOrNull(filters.provider);
  if (provider) where.provider = provider;

  const status = toUpperOrNull(filters.status);
  if (status && RUN_STATUSES.has(status)) {
    where.status = status;
  }

  const runType = toUpperOrNull(filters.runType);
  if (runType && RUN_TYPES.has(runType)) {
    where.runType = runType;
  }

  const from = toDateOrNull(filters.from || filters.since);
  const to = toDateOrNull(filters.to || filters.until);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }

  return where;
}

function serializeRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    tenantId: run.tenantId,
    brandId: run.brandId,
    provider: run.provider,
    connectionId: run.connectionId,
    connectionKey: run.connectionKey,
    runType: run.runType,
    status: run.status,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    cursorStart: run.cursorStart,
    cursorEnd: run.cursorEnd,
    rowsRead: run.rowsRead,
    rowsWritten: run.rowsWritten,
    retryCount: run.retryCount,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    meta: run.meta || null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    chunksCount: run._count?.chunks || 0,
    errorsCount: run._count?.errors || 0,
  };
}

function normalizePagination(params = {}) {
  const page = clampInt(params.page, 1, 100000, 1);
  const pageSize = clampInt(params.pageSize, 1, 100, 20);
  return { page, pageSize };
}

async function getSyncSummary(params = {}) {
  const sinceHours = parseSinceHours(params.sinceHours, 24);
  const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const baseWhere = buildRunWhere(params);
  const whereRuns = {
    ...baseWhere,
    createdAt: {
      ...(baseWhere.createdAt || {}),
      gte: sinceDate,
    },
  };

  const whereChunks = {
    createdAt: { gte: sinceDate },
  };
  if (whereRuns.tenantId) whereChunks.tenantId = whereRuns.tenantId;
  if (whereRuns.brandId) whereChunks.brandId = whereRuns.brandId;
  if (whereRuns.provider) whereChunks.provider = whereRuns.provider;

  const whereErrors = {
    createdAt: { gte: sinceDate },
  };
  if (whereRuns.tenantId) whereErrors.tenantId = whereRuns.tenantId;
  if (whereRuns.brandId) whereErrors.brandId = whereRuns.brandId;
  if (whereRuns.provider) whereErrors.provider = whereRuns.provider;

  const [
    totalRuns,
    runsByStatus,
    runsByProviderStatus,
    failedChunks,
    totalChunks,
    totalErrors,
    latestFailures,
  ] = await Promise.all([
    prisma.syncRun.count({ where: whereRuns }),
    prisma.syncRun.groupBy({
      by: ['status'],
      where: whereRuns,
      _count: { _all: true },
    }),
    prisma.syncRun.groupBy({
      by: ['provider', 'status'],
      where: whereRuns,
      _count: { _all: true },
    }),
    prisma.syncChunk.count({ where: { ...whereChunks, status: 'FAILED' } }),
    prisma.syncChunk.count({ where: whereChunks }),
    prisma.syncError.count({ where: whereErrors }),
    prisma.syncRun.findMany({
      where: { ...whereRuns, status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        tenantId: true,
        brandId: true,
        provider: true,
        runType: true,
        status: true,
        createdAt: true,
        meta: true,
      },
    }),
  ]);

  const statusTotals = runsByStatus.reduce((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});

  const providerMatrix = runsByProviderStatus.reduce((acc, item) => {
    const provider = item.provider || 'UNKNOWN';
    if (!acc[provider]) acc[provider] = {};
    acc[provider][item.status] = item._count._all;
    return acc;
  }, {});

  return {
    window: {
      sinceHours,
      since: sinceDate.toISOString(),
      until: new Date().toISOString(),
    },
    totals: {
      runs: totalRuns,
      chunks: totalChunks,
      chunksFailed: failedChunks,
      errors: totalErrors,
      byStatus: statusTotals,
      byProvider: providerMatrix,
    },
    latestFailures,
  };
}

async function listSyncRuns(params = {}) {
  const { page, pageSize } = normalizePagination(params);
  const where = buildRunWhere(params);

  const [total, rows] = await Promise.all([
    prisma.syncRun.count({ where }),
    prisma.syncRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: {
            chunks: true,
            errors: true,
          },
        },
      },
    }),
  ]);

  return {
    runs: rows.map(serializeRun),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: pageSize ? Math.ceil(total / pageSize) : 0,
    },
  };
}

async function getSyncRunDetail(runId) {
  if (!runId) return null;

  const run = await prisma.syncRun.findUnique({
    where: { id: String(runId) },
    include: {
      _count: {
        select: {
          chunks: true,
          errors: true,
        },
      },
    },
  });

  if (!run) return null;

  const [chunks, errors] = await Promise.all([
    prisma.syncChunk.findMany({
      where: { runId: run.id },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
    prisma.syncError.findMany({
      where: { runId: run.id },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);

  return {
    run: serializeRun(run),
    chunks,
    errors,
  };
}

module.exports = {
  buildRunWhere,
  getSyncSummary,
  listSyncRuns,
  getSyncRunDetail,
};
