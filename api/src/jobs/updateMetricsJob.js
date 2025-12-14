const { prisma } = require('../prisma');

const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS) || 5;
const BACKOFF_MS = Number(process.env.METRICS_BACKOFF_MS) || 60000;

let metaProvider = null;
let googleProvider = null;
let tiktokProvider = null;

try {
  metaProvider = require('../services/metaMetricsService');
} catch (_) {}

try {
  googleProvider = require('../services/googleAdsMetricsService');
} catch (_) {}

try {
  tiktokProvider = require('../services/tiktokMetricsService');
} catch (_) {}

function safeLog(...args) {
  if (process.env.NODE_ENV !== 'test') {
    console.log('[updateMetricsJob]', ...args);
  }
}

function getReferenceTimestamp(range) {
  if (range && typeof range === 'object') {
    const { since, until } = range;
    if (until) return new Date(`${until}T00:00:00.000Z`);
    if (since) return new Date(`${since}T00:00:00.000Z`);
  }
  return new Date();
}

function getDayBounds(date) {
  const d = new Date(date);
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

async function claimNextMetricJob() {
  const now = new Date();

  const candidate = await prisma.jobQueue.findFirst({
    where: {
      type: 'update_metrics',
      status: 'queued',
      OR: [{ runAt: null }, { runAt: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!candidate) return null;

  const claimed = await prisma.jobQueue.updateMany({
    where: { id: candidate.id, status: 'queued' },
    data: {
      status: 'processing',
      attempts: { increment: 1 },
      updatedAt: now,
    },
  });

  if (!claimed.count) return null;

  return prisma.jobQueue.findUnique({ where: { id: candidate.id } });
}

async function finalizeJob(entry, status, result, options = {}) {
  const data = {
    status,
    result,
    updatedAt: new Date(),
  };

  if (status === 'queued' && options.runAt) {
    data.runAt = options.runAt;
  }

  await prisma.jobQueue.update({
    where: { id: entry.id },
    data,
  });
}

async function saveMetric(tenantId, metric, providerType, range) {
  const referenceTs = getReferenceTimestamp(range);
  const { start, end } = getDayBounds(referenceTs);

  const name = metric.name || metric.key || metric.type;
  if (!name) {
    safeLog('saveMetric ignorou entrada sem name', metric);
    return null;
  }

  const value = Number(metric.value || 0);
  const postId = metric.postId || metric.post_id || null;
  if (!postId) {
    safeLog('saveMetric ignorou métrica sem postId', metric);
    return null;
  }

  const existing = await prisma.metric.findFirst({
    where: {
      tenantId,
      name,
      postId,
      collectedAt: {
        gte: start,
        lt: end,
      },
    },
  });

  if (existing) {
    return prisma.metric.update({
      where: { id: existing.id },
      data: {
        value,
        collectedAt: referenceTs,
        meta: {
          ...(existing.meta || {}),
          lastRange: range || null,
          lastUpdatedAt: new Date().toISOString(),
          ...(metric.meta || {}),
        },
      },
    });
  }

  return prisma.metric.create({
    data: {
      tenantId,
      postId,
      name,
      value,
      collectedAt: referenceTs,
      meta:
        range || metric.meta
          ? { ...(metric.meta || {}), range: range || null, provider: providerType || null }
          : null,
    },
  });
}

async function processMetricJob(entry) {
  if (!entry) return null;

  const tenantId = entry.tenantId;
  if (!tenantId) {
    safeLog('Job sem tenantId — marcado como failed');
    await finalizeJob(entry, 'failed', { error: 'missing_tenant' });
    return null;
  }

  const payload = entry.payload || {};
  const integrationId = payload.integrationId || null;

  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });

  if (!integration) {
    safeLog('Integração não encontrada — done');
    await finalizeJob(entry, 'done', { ok: true, skipped: true });
    return null;
  }

  if (integration.active === false) {
    safeLog('Integração inativa — skipped', integration.id);
    await finalizeJob(entry, 'done', {
      ok: true,
      skipped: true,
      reason: 'integration_inactive',
    });
    return null;
  }

  let metrics = [];

  try {
    const providerTypeRaw = (integration.provider || integration.type || '').toLowerCase();
    let providerKey = null;

    if (['meta', 'facebook', 'instagram', 'facebook-ads', 'instagram-ads'].includes(providerTypeRaw)) {
      providerKey = 'meta';
      if (metaProvider?.fetchAccountMetrics) {
        metrics = await metaProvider.fetchAccountMetrics(integration, payload.range);
      }
    }

    if (['google', 'google-ads', 'google_ads'].includes(providerTypeRaw)) {
      providerKey = 'google_ads';
      if (googleProvider?.fetchAccountMetrics) {
        metrics = await googleProvider.fetchAccountMetrics(integration, payload.range);
      }
    }

    if (['tiktok', 'tiktok-ads'].includes(providerTypeRaw)) {
      providerKey = 'tiktok';
      if (tiktokProvider?.fetchAccountMetrics) {
        metrics = await tiktokProvider.fetchAccountMetrics(integration, payload.range);
      }
    }

    if (!providerKey) {
      safeLog('Provider de integração não suportado para métricas', providerTypeRaw);
      await finalizeJob(entry, 'done', {
        ok: true,
        skipped: true,
        reason: 'unsupported_provider',
        provider: providerTypeRaw,
      });
      return null;
    }

    if (!metrics || !metrics.length) {
      safeLog('Nenhuma métrica retornada do provider', providerKey);
    } else {
      for (const m of metrics) {
        await saveMetric(tenantId, m, providerKey, payload.range);
      }
    }

    await finalizeJob(entry, 'done', {
      ok: true,
      tenantId,
      metricsSaved: metrics.length,
      provider: providerKey,
    });

    return { ok: true, metricsSaved: metrics.length };
  } catch (err) {
    const attempts = (entry.attempts || 0) + 1;
    const msg = err?.message || String(err);

    if (attempts >= MAX_ATTEMPTS) {
      await finalizeJob(entry, 'failed', {
        ok: false,
        attempts,
        error: msg,
      });
      safeLog('Job falhou e atingiu MAX_ATTEMPTS', entry.id, msg);
    } else {
      const runAt = new Date(Date.now() + BACKOFF_MS);
      await finalizeJob(
        entry,
        'queued',
        {
          ok: false,
          attempts,
          retryAt: runAt,
          error: msg,
        },
        { runAt },
      );
      safeLog('Erro — job requeued', entry.id, msg);
    }

    return null;
  }
}

async function pollOnce() {
  const entry = await claimNextMetricJob();
  if (!entry) return null;
  return processMetricJob(entry);
}

module.exports = {
  pollOnce,
  _claimNextMetricJob: claimNextMetricJob,
  _processMetricJob: processMetricJob,
};
