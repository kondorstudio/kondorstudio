const crypto = require('crypto');

const metaMetricsService = require('../../services/metaMetricsService');
const automationEngine = require('../../services/automationEngine');
const syncRunsService = require('../../services/syncRunsService');
const analyticsWarehouseService = require('../../services/analyticsWarehouseService');
const { ensureConnectorContract } = require('../contract');

function normalizeRange(range = {}) {
  const since = String(range?.since || range?.start || '7daysAgo');
  const until = String(range?.until || range?.end || 'today');
  return { since, until };
}

function normalizeMetricsList(value, fallback = []) {
  if (!Array.isArray(value) || !value.length) return fallback;
  return value.map((item) => String(item));
}

function normalizeFacts(rawBatch = []) {
  const rows = Array.isArray(rawBatch) ? rawBatch : [];
  return rows
    .map((row) => {
      const metric = row?.name ? String(row.name) : null;
      if (!metric) return null;
      const value = Number(row?.value || 0);
      const collectedAt = row?.collectedAt || row?.date || null;
      return {
        provider: 'META',
        date: collectedAt,
        metric,
        value: Number.isFinite(value) ? value : 0,
        dimensions: row?.meta && typeof row.meta === 'object' ? row.meta : {},
      };
    })
    .filter(Boolean);
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
  const integration = ctx?.integration || request?.integration;
  if (!integration) throw new Error('integration is required');
  const tenantId = String(ctx?.tenantId || integration?.tenantId || '');
  const run = tenantId
    ? await safeCreateRun({
        tenantId,
        brandId: ctx?.brandId || integration?.clientId || null,
        provider: 'META',
        connectionId: ctx?.integrationId || integration?.id || null,
        connectionKey: integration?.ownerKey || integration?.id || null,
        runType: 'PREVIEW',
        status: 'RUNNING',
        startedAt: new Date(),
      })
    : null;
  const startedAt = Date.now();

  const range = normalizeRange(request?.range || {});
  const metricTypes = normalizeMetricsList(request?.metrics, [
    'impressions',
    'clicks',
    'spend',
  ]);

  try {
    const rows = await metaMetricsService.fetchAccountMetrics(integration, {
      range,
      metricTypes,
      granularity: 'day',
      runId: run?.id || null,
    });

    await safeUpdateRun(run?.id, {
      status: 'SUCCESS',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
      rowsRead: Array.isArray(rows) ? rows.length : 0,
      rowsWritten: Array.isArray(rows) ? rows.length : 0,
      meta: { mode: 'preview', range },
    });

    return {
      ok: true,
      provider: 'META',
      mode: 'preview',
      range,
      rows: Array.isArray(rows) ? rows : [],
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
      tenantId: tenantId || null,
      brandId: ctx?.brandId || integration?.clientId || null,
      provider: 'META',
      connectionId: ctx?.integrationId || integration?.id || null,
      providerCode: error?.code || 'META_PREVIEW_FAILED',
      httpStatus: error?.status || null,
      retryable: false,
      message: error?.message || 'Meta preview failed',
      details: { mode: 'preview', range },
    });
    if (run?.id && error && typeof error === 'object') {
      error.runId = run.id;
    }
    throw error;
  }
}

async function enqueueBackfill(ctx = {}, range = {}) {
  const tenantId = String(ctx?.tenantId || '');
  if (!tenantId) throw new Error('tenantId is required');

  const run = await safeCreateRun({
    tenantId,
    brandId: ctx?.brandId || null,
    provider: 'META',
    connectionId: ctx?.integrationId || null,
    connectionKey: ctx?.connectionKey || ctx?.integrationId || null,
    runType: 'BACKFILL',
    status: 'QUEUED',
  });
  const runId = run?.id || crypto.randomUUID();
  const payload = {
    runId,
    provider: 'META',
    integrationId: ctx?.integrationId ? String(ctx.integrationId) : null,
    brandId: ctx?.brandId ? String(ctx.brandId) : null,
    range: normalizeRange(range || {}),
  };

  try {
    const job = await automationEngine.enqueueJob(tenantId, {
      jobType: 'connector_meta_backfill',
      name: 'connector-meta-backfill',
      referenceId: runId,
      payload,
    });

    await safeUpdateRun(run?.id, {
      status: 'QUEUED',
      meta: { mode: 'backfill', queueJobId: String(job?.id || '') },
    });

    return {
      runId: runId,
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
      brandId: ctx?.brandId || null,
      provider: 'META',
      connectionId: ctx?.integrationId || null,
      providerCode: error?.code || 'META_BACKFILL_QUEUE_FAILED',
      httpStatus: error?.status || null,
      retryable: false,
      message: error?.message || 'Meta backfill queue failed',
      details: { mode: 'backfill' },
    });
    if (run?.id && error && typeof error === 'object') {
      error.runId = run.id;
    }
    throw error;
  }
}

async function incremental(ctx = {}, cursor = {}) {
  const integration = ctx?.integration || cursor?.integration;
  if (!integration) throw new Error('integration is required');
  const tenantId = String(ctx?.tenantId || integration?.tenantId || '');
  const run = tenantId
    ? await safeCreateRun({
        tenantId,
        brandId: ctx?.brandId || integration?.clientId || null,
        provider: 'META',
        connectionId: ctx?.integrationId || integration?.id || null,
        connectionKey: integration?.ownerKey || integration?.id || null,
        runType: 'INCREMENTAL',
        status: 'RUNNING',
        startedAt: new Date(),
      })
    : null;
  const startedAt = Date.now();

  const range = normalizeRange({
    since: cursor?.since || cursor?.start || '3daysAgo',
    until: cursor?.until || cursor?.end || 'today',
  });

  const metricTypes = normalizeMetricsList(cursor?.metrics, [
    'impressions',
    'clicks',
    'spend',
    'conversions',
  ]);

  try {
    const rows = await metaMetricsService.fetchAccountMetrics(integration, {
      range,
      metricTypes,
      granularity: 'day',
      runId: run?.id || null,
    });

    await safeUpdateRun(run?.id, {
      status: 'SUCCESS',
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
      rowsRead: Array.isArray(rows) ? rows.length : 0,
      rowsWritten: Array.isArray(rows) ? rows.length : 0,
      meta: { mode: 'incremental', cursor: range },
    });

    return {
      ok: true,
      provider: 'META',
      cursor: range,
      rows: Array.isArray(rows) ? rows : [],
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
      tenantId: tenantId || null,
      brandId: ctx?.brandId || integration?.clientId || null,
      provider: 'META',
      connectionId: ctx?.integrationId || integration?.id || null,
      providerCode: error?.code || 'META_INCREMENTAL_FAILED',
      httpStatus: error?.status || null,
      retryable: false,
      message: error?.message || 'Meta incremental failed',
      details: { mode: 'incremental', cursor: range },
    });
    if (run?.id && error && typeof error === 'object') {
      error.runId = run.id;
    }
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
    provider: 'META',
    facts: Array.isArray(facts) ? facts : [],
    sourceSystem: 'META',
  });
}

const metaConnector = ensureConnectorContract(
  {
    preview,
    enqueueBackfill,
    incremental,
    normalize: normalizeFacts,
    upsertFacts,
  },
  'metaConnector',
);

module.exports = metaConnector;
