const { prisma } = require('../../prisma');
const { ga4SyncQueue } = require('../../queues');
const { getConnector } = require('../../connectors');
const syncRunsService = require('../../services/syncRunsService');

const JOB_NAME_BY_MODE = Object.freeze({
  preview: 'sync-preview',
  backfill: 'sync-backfill',
  incremental: 'sync-incremental',
});

const MODE_BY_JOB_NAME = Object.freeze(
  Object.entries(JOB_NAME_BY_MODE).reduce((acc, [mode, jobName]) => {
    acc[jobName] = mode;
    return acc;
  }, {}),
);

function normalizeProvider(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'META_ADS') return 'META';
  return raw;
}

function resolveModeFromJobName(jobName) {
  return MODE_BY_JOB_NAME[String(jobName || '').trim()] || null;
}

async function assertBrand(tenantId, brandId) {
  if (!brandId) return;
  const brand = await prisma.client.findFirst({
    where: { id: String(brandId), tenantId: String(tenantId) },
    select: { id: true },
  });
  if (!brand) {
    const err = new Error('Marca não encontrada');
    err.code = 'BRAND_NOT_FOUND';
    err.status = 404;
    throw err;
  }
}

async function resolveMetaIntegration({
  tenantId,
  brandId,
  integrationId,
  externalAccountId,
}) {
  if (integrationId) {
    const integration = await prisma.integration.findFirst({
      where: {
        id: String(integrationId),
        tenantId: String(tenantId),
        ...(brandId ? { clientId: String(brandId) } : {}),
      },
    });
    if (integration) return integration;
  }

  const connection = await prisma.dataSourceConnection.findFirst({
    where: {
      tenantId: String(tenantId),
      brandId: String(brandId),
      source: 'META_ADS',
      status: 'CONNECTED',
      ...(externalAccountId
        ? { externalAccountId: String(externalAccountId) }
        : {}),
    },
    include: { integration: true },
    orderBy: { updatedAt: 'desc' },
  });

  return connection?.integration || null;
}

async function buildConnectorContext({
  tenantId,
  userId,
  provider,
  payload,
}) {
  const brandId = payload?.brandId ? String(payload.brandId) : null;
  await assertBrand(tenantId, brandId);

  const ctx = {
    tenantId: String(tenantId),
    userId: userId ? String(userId) : null,
    brandId,
    propertyId: payload?.propertyId ? String(payload.propertyId) : null,
    integrationId: payload?.integrationId ? String(payload.integrationId) : null,
    connectionId: payload?.connectionId ? String(payload.connectionId) : null,
    connectionKey: payload?.connectionKey ? String(payload.connectionKey) : null,
    externalAccountId: payload?.externalAccountId
      ? String(payload.externalAccountId)
      : null,
  };

  if (provider === 'META') {
    const integration = await resolveMetaIntegration({
      tenantId,
      brandId,
      integrationId: payload?.integrationId,
      externalAccountId: payload?.externalAccountId,
    });
    if (!integration) {
      const err = new Error('Integração Meta não encontrada para esta marca');
      err.code = 'META_INTEGRATION_REQUIRED';
      err.status = 409;
      throw err;
    }
    ctx.integration = integration;
    ctx.integrationId = ctx.integrationId || String(integration.id);
  }

  return ctx;
}

function countRowsFromResult(result) {
  if (!result || typeof result !== 'object') return 0;
  if (Array.isArray(result.rows)) return result.rows.length;
  if (Array.isArray(result.result?.rows)) return result.result.rows.length;

  const aggregatedFacts = Number(result.result?.counts?.aggregatedFacts || 0);
  const campaignFacts = Number(result.result?.counts?.campaignFacts || 0);
  if (Number.isFinite(aggregatedFacts) || Number.isFinite(campaignFacts)) {
    return Math.max(0, aggregatedFacts) + Math.max(0, campaignFacts);
  }

  return 0;
}

async function safeCreateChunk(payload) {
  try {
    return await syncRunsService.createChunk(payload);
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

async function enqueueSync(mode, tenantId, userId, payload = {}) {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  const jobName = JOB_NAME_BY_MODE[normalizedMode];
  if (!jobName) {
    const err = new Error('Modo de sync inválido');
    err.code = 'INVALID_SYNC_MODE';
    err.status = 400;
    throw err;
  }

  if (!ga4SyncQueue) {
    const err = new Error('Fila de sync indisponível (Redis desativado)');
    err.code = 'SYNC_QUEUE_UNAVAILABLE';
    err.status = 503;
    throw err;
  }

  const provider = normalizeProvider(payload?.provider);
  if (!provider) {
    const err = new Error('provider é obrigatório');
    err.code = 'PROVIDER_REQUIRED';
    err.status = 400;
    throw err;
  }

  const connector = getConnector(provider);
  if (!connector) {
    const err = new Error(`Provider ${provider} ainda não suportado no orquestrador`);
    err.code = 'PROVIDER_NOT_SUPPORTED';
    err.status = 400;
    throw err;
  }

  await assertBrand(tenantId, payload?.brandId);

  const attempts = Math.max(1, Number(process.env.SYNC_QUEUE_ATTEMPTS || 3));
  const backoffDelay = Math.max(250, Number(process.env.SYNC_QUEUE_BACKOFF_MS || 2000));

  const job = await ga4SyncQueue.add(
    jobName,
    {
      mode: normalizedMode,
      provider,
      tenantId: String(tenantId),
      userId: userId ? String(userId) : null,
      request: payload,
      queuedAt: new Date().toISOString(),
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      attempts,
      backoff: { type: 'exponential', delay: backoffDelay },
    },
  );

  return {
    ok: true,
    queued: true,
    provider,
    mode: normalizedMode,
    queueJobId: String(job?.id || ''),
  };
}

async function processSyncQueueJob(job) {
  const mode =
    resolveModeFromJobName(job?.name) || String(job?.data?.mode || '').trim().toLowerCase();
  const payload = job?.data?.request || {};
  const provider = normalizeProvider(job?.data?.provider || payload?.provider);
  const tenantId = String(job?.data?.tenantId || payload?.tenantId || '').trim();
  const userId = job?.data?.userId ? String(job.data.userId) : null;

  if (!tenantId) {
    const err = new Error('tenantId é obrigatório para processar sync');
    err.code = 'TENANT_REQUIRED';
    throw err;
  }

  const connector = getConnector(provider);
  if (!connector) {
    const err = new Error(`Provider ${provider || 'unknown'} não suportado`);
    err.code = 'PROVIDER_NOT_SUPPORTED';
    throw err;
  }

  const startedAt = Date.now();

  try {
    const ctx = await buildConnectorContext({
      tenantId,
      userId,
      provider,
      payload,
    });

    let result;
    if (mode === 'preview') {
      result = await connector.preview(ctx, payload);
    } else if (mode === 'backfill') {
      result = await connector.enqueueBackfill(ctx, payload);
    } else if (mode === 'incremental') {
      result = await connector.incremental(ctx, payload?.cursor || payload);
    } else {
      const err = new Error('Modo de sync inválido');
      err.code = 'INVALID_SYNC_MODE';
      throw err;
    }

    const runId = result?.runId ? String(result.runId) : null;
    let chunkId = null;

    if (runId) {
      const rowCount = countRowsFromResult(result);
      const chunk = await safeCreateChunk({
        runId,
        tenantId: String(tenantId),
        brandId: payload?.brandId ? String(payload.brandId) : null,
        provider,
        status: mode === 'backfill' ? 'QUEUED' : 'SUCCESS',
        chunkKey: `${mode}:${String(job?.id || 'manual')}`,
        rowsRead: mode === 'backfill' ? 0 : rowCount,
        rowsWritten: mode === 'backfill' ? 0 : rowCount,
        startedAt: mode === 'backfill' ? null : new Date(startedAt),
        finishedAt: mode === 'backfill' ? null : new Date(),
        durationMs: mode === 'backfill' ? null : Date.now() - startedAt,
        meta: {
          mode,
          orchestratedBy: 'sync.service',
          queueJobId: String(job?.id || ''),
        },
      });
      chunkId = chunk?.id || null;
    }

    return {
      ...(result || {}),
      provider,
      mode,
      runId: runId || null,
      chunkId,
    };
  } catch (error) {
    const runId = error?.runId ? String(error.runId) : null;
    const chunk = runId
      ? await safeCreateChunk({
          runId,
          tenantId: String(tenantId),
          brandId: payload?.brandId ? String(payload.brandId) : null,
          provider,
          status: 'FAILED',
          chunkKey: `${mode}:${String(job?.id || 'manual')}:failed`,
          startedAt: new Date(startedAt),
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          meta: {
            mode,
            orchestratedBy: 'sync.service',
            queueJobId: String(job?.id || ''),
          },
        })
      : null;

    await safeRecordError({
      runId,
      chunkId: chunk?.id || null,
      tenantId: String(tenantId),
      brandId: payload?.brandId ? String(payload.brandId) : null,
      provider,
      connectionId:
        payload?.connectionId || payload?.integrationId || payload?.externalAccountId || null,
      providerCode: error?.code || 'SYNC_ORCHESTRATION_FAILED',
      httpStatus: error?.status || null,
      retryable: error?.retryable === true,
      message: error?.message || 'Sync orchestration failed',
      details: {
        mode,
        queueJobId: String(job?.id || ''),
        source: 'sync.service',
      },
    });

    throw error;
  }
}

module.exports = {
  enqueueSync,
  processSyncQueueJob,
  resolveModeFromJobName,
  normalizeProvider,
};
