const crypto = require('crypto');

const ga4DataService = require('../../services/ga4DataService');
const { resolveGa4IntegrationContext } = require('../../services/ga4IntegrationResolver');
const { ensureGa4FactMetrics } = require('../../services/ga4FactMetricsService');
const syncRunsService = require('../../services/syncRunsService');
const analyticsWarehouseService = require('../../services/analyticsWarehouseService');
const { ga4SyncQueue } = require('../../queues');
const { ensureConnectorContract } = require('../contract');

function normalizeDateRange(range = {}) {
  const start = String(range?.start || range?.startDate || '7daysAgo');
  const end = String(range?.end || range?.endDate || 'today');
  return { start, end };
}

function normalizeArray(value, fallback = []) {
  if (Array.isArray(value) && value.length) return value.map((item) => String(item));
  return fallback;
}

function normalizeRows(response = {}) {
  const dimensionHeaders = Array.isArray(response.dimensionHeaders)
    ? response.dimensionHeaders.map((item) => String(item?.name || item))
    : [];
  const metricHeaders = Array.isArray(response.metricHeaders)
    ? response.metricHeaders.map((item) => String(item?.name || item))
    : [];
  const rows = Array.isArray(response.rows) ? response.rows : [];

  return rows.map((row) => {
    const item = {};
    dimensionHeaders.forEach((dimension, index) => {
      item[dimension] = row?.dimensions?.[index] ?? null;
    });
    metricHeaders.forEach((metric, index) => {
      const parsed = Number(row?.metrics?.[index] || 0);
      item[metric] = Number.isFinite(parsed) ? parsed : 0;
    });
    return item;
  });
}

function normalizeFacts(rawBatch = {}) {
  const normalizedRows = normalizeRows(rawBatch);
  const metricHeaders = Array.isArray(rawBatch.metricHeaders)
    ? rawBatch.metricHeaders.map((item) => String(item?.name || item))
    : [];

  const facts = [];
  normalizedRows.forEach((row) => {
    const date = row.date || null;
    const dimensions = { ...row };
    metricHeaders.forEach((metricName) => {
      const value = Number(row[metricName] || 0);
      delete dimensions[metricName];
      facts.push({
        provider: 'GA4',
        date,
        metric: metricName,
        value: Number.isFinite(value) ? value : 0,
        dimensions,
      });
    });
  });

  return facts;
}

async function safeCreateRun(payload) {
  try {
    return await syncRunsService.createRun(payload);
  } catch (_) {
    return null;
  }
}

async function safeUpdateRun(runId, payload) {
  if (!runId) return null;
  try {
    return await syncRunsService.updateRun(runId, payload);
  } catch (_) {
    return null;
  }
}

async function safeRecordError(payload) {
  try {
    return await syncRunsService.recordSyncError(payload);
  } catch (_) {
    return null;
  }
}

async function preview(ctx = {}, request = {}) {
  const tenantId = String(ctx?.tenantId || request?.tenantId || '');
  if (!tenantId) throw new Error('tenantId is required');
  const run = await safeCreateRun({
    tenantId,
    brandId: ctx?.brandId || null,
    provider: 'GA4',
    connectionId: ctx?.integrationId || null,
    connectionKey: ctx?.propertyId || null,
    runType: 'PREVIEW',
    status: 'RUNNING',
    startedAt: new Date(),
    meta: {
      mode: 'preview',
    },
  });
  const startedAt = Date.now();

  try {
    const resolved = await resolveGa4IntegrationContext({
      tenantId,
      propertyId: request?.propertyId || ctx?.propertyId || null,
      integrationId: ctx?.integrationId || null,
      userId: ctx?.userId || null,
    });

    const dateRange = normalizeDateRange(request?.range);
    const metrics = normalizeArray(request?.metrics, ['activeUsers', 'sessions']);
    const dimensions = normalizeArray(request?.dimensions, ['date']);

    const report = await ga4DataService.runReport({
      tenantId,
      userId: resolved.userId,
      propertyId: resolved.propertyId,
      runId: run?.id || null,
      payload: {
        dateRanges: [
          {
            startDate: dateRange.start,
            endDate: dateRange.end,
          },
        ],
        metrics,
        dimensions,
      },
      rateKey: `connector:ga4:preview:${tenantId}:${resolved.propertyId}`,
    });

    const rows = normalizeRows(report);
    await safeUpdateRun(run?.id, {
      status: 'SUCCESS',
      rowsRead: rows.length,
      rowsWritten: rows.length,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
      meta: {
        mode: 'preview',
        propertyId: String(resolved.propertyId),
      },
    });

    return {
      ok: true,
      provider: 'GA4',
      mode: 'preview',
      propertyId: String(resolved.propertyId),
      dateRange,
      rows,
      runId: run?.id || null,
    };
  } catch (error) {
    await safeUpdateRun(run?.id, {
      status: 'FAILED',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
    });
    await safeRecordError({
      runId: run?.id || null,
      tenantId,
      brandId: ctx?.brandId || null,
      provider: 'GA4',
      connectionId: ctx?.integrationId || null,
      providerCode: error?.code || 'GA4_PREVIEW_FAILED',
      httpStatus: error?.status || null,
      retryable: false,
      message: error?.message || 'GA4 preview failed',
      details: { mode: 'preview' },
    });
    throw error;
  }
}

async function enqueueBackfill(ctx = {}, range = {}) {
  if (!ga4SyncQueue) {
    const err = new Error('ga4 queue unavailable');
    err.code = 'GA4_QUEUE_UNAVAILABLE';
    throw err;
  }

  const tenantId = String(ctx?.tenantId || '');
  const brandId = String(ctx?.brandId || '');
  if (!tenantId || !brandId) {
    throw new Error('tenantId and brandId are required');
  }
  const run = await safeCreateRun({
    tenantId,
    brandId,
    provider: 'GA4',
    connectionId: ctx?.integrationId || null,
    connectionKey: ctx?.propertyId || null,
    runType: 'BACKFILL',
    status: 'QUEUED',
    meta: {
      mode: 'backfill',
    },
  });

  const days = Number(range?.days || ctx?.days || 30);
  const includeCampaigns = range?.includeCampaigns === true;

  try {
    const job = await ga4SyncQueue.add(
      'ga4-brand-facts-sync',
      {
        tenantId,
        brandId,
        days: Number.isFinite(days) ? Math.max(1, Math.min(365, Math.floor(days))) : 30,
        includeCampaigns,
        requestedBy: ctx?.userId ? String(ctx.userId) : null,
        runId: run?.id || null,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    );

    await safeUpdateRun(run?.id, {
      status: 'QUEUED',
      meta: {
        mode: 'backfill',
        queueJobId: String(job?.id || ''),
      },
    });

    return {
      runId: run?.id || String(job?.id || crypto.randomUUID()),
      queued: true,
      queueJobId: String(job?.id || ''),
    };
  } catch (error) {
    await safeUpdateRun(run?.id, {
      status: 'FAILED',
      finishedAt: new Date(),
    });
    await safeRecordError({
      runId: run?.id || null,
      tenantId,
      brandId,
      provider: 'GA4',
      connectionId: ctx?.integrationId || null,
      providerCode: error?.code || 'GA4_BACKFILL_QUEUE_FAILED',
      httpStatus: error?.status || null,
      retryable: false,
      message: error?.message || 'GA4 backfill queue failed',
      details: { mode: 'backfill' },
    });
    throw error;
  }
}

async function incremental(ctx = {}, cursor = {}) {
  const tenantId = String(ctx?.tenantId || '');
  const brandId = String(ctx?.brandId || '');
  if (!tenantId || !brandId) {
    throw new Error('tenantId and brandId are required');
  }
  const run = await safeCreateRun({
    tenantId,
    brandId,
    provider: 'GA4',
    connectionId: ctx?.integrationId || null,
    connectionKey: ctx?.propertyId || null,
    runType: 'INCREMENTAL',
    status: 'RUNNING',
    startedAt: new Date(),
  });
  const startedAt = Date.now();

  const start = String(cursor?.start || cursor?.dateFrom || '3daysAgo');
  const end = String(cursor?.end || cursor?.dateTo || 'today');
  const metrics = normalizeArray(cursor?.metrics, [
    'sessions',
    'leads',
    'conversions',
    'revenue',
  ]);

  try {
    const result = await ensureGa4FactMetrics({
      tenantId,
      brandId,
      dateRange: { start, end },
      metrics,
      dimensions: [],
      filters: [],
      requiredPlatforms: ['GA4'],
    });

    await safeUpdateRun(run?.id, {
      status: 'SUCCESS',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
      meta: {
        mode: 'incremental',
        cursor: { start, end },
      },
    });

    return {
      ok: true,
      provider: 'GA4',
      cursor: { start, end },
      result,
      runId: run?.id || null,
    };
  } catch (error) {
    await safeUpdateRun(run?.id, {
      status: 'FAILED',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
    });
    await safeRecordError({
      runId: run?.id || null,
      tenantId,
      brandId,
      provider: 'GA4',
      connectionId: ctx?.integrationId || null,
      providerCode: error?.code || 'GA4_INCREMENTAL_FAILED',
      httpStatus: error?.status || null,
      retryable: false,
      message: error?.message || 'GA4 incremental failed',
      details: { mode: 'incremental', cursor: { start, end } },
    });
    throw error;
  }
}

async function upsertFacts(ctx = {}, facts = []) {
  if (typeof ctx?.upsertFacts === 'function') {
    return ctx.upsertFacts(facts);
  }
  return analyticsWarehouseService.upsertConnectorFacts({
    tenantId: ctx?.tenantId || null,
    brandId: ctx?.brandId || null,
    provider: 'GA4',
    facts: Array.isArray(facts) ? facts : [],
    sourceSystem: 'GA4',
  });
}

const ga4Connector = ensureConnectorContract(
  {
    preview,
    enqueueBackfill,
    incremental,
    normalize: normalizeFacts,
    upsertFacts,
  },
  'ga4Connector',
);

module.exports = ga4Connector;
