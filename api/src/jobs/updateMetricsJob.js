const { prisma } = require('../prisma');

const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS) || 5;
const BACKOFF_MS = Number(process.env.METRICS_BACKOFF_MS) || 60000;

let metaProvider = null;
let googleProvider = null;
let googleAnalyticsProvider = null;
let tiktokProvider = null;

try {
  metaProvider = require('../services/metaMetricsService');
} catch (_) {}

try {
  googleProvider = require('../services/googleAdsMetricsService');
} catch (_) {}

try {
  googleAnalyticsProvider = require('../services/googleAnalyticsMetricsService');
} catch (_) {}

try {
  tiktokProvider = require('../services/tiktokMetricsService');
} catch (_) {}

function safeLog(...args) {
  if (process.env.NODE_ENV !== 'test') {
    console.log('[updateMetricsJob]', ...args);
  }
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDateOnly(date) {
  const d = parseDate(date);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function buildRangeInfo(payload = {}) {
  const rawRange = payload.range && typeof payload.range === 'object' ? payload.range : {};
  let from = parseDate(payload.rangeFrom || payload.range_from || rawRange.since);
  let to = parseDate(payload.rangeTo || payload.range_to || rawRange.until);

  if (!from && !to && payload.rangeDays) {
    const days = Number(payload.rangeDays);
    if (days > 0) {
      to = new Date();
      from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    }
  }

  const range = {};
  if (from) range.since = formatDateOnly(from);
  if (to) range.until = formatDateOnly(to);

  return {
    range: Object.keys(range).length ? range : null,
    rangeFrom: from || null,
    rangeTo: to || null,
  };
}

function resolveCollectedAt(metric, rangeInfo) {
  const candidates = [
    metric.collectedAt,
    metric.collected_at,
    metric.date,
    metric.date_start,
    metric.dateStart,
    metric.day,
    metric.timestamp,
  ];

  for (const candidate of candidates) {
    const d = parseDate(candidate);
    if (d) return d;
  }

  if (rangeInfo?.rangeTo) return rangeInfo.rangeTo;
  if (rangeInfo?.rangeFrom) return rangeInfo.rangeFrom;
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

function normalizeIntegrationKind(integration) {
  if (!integration) return '';
  const raw = integration.settings?.kind || integration.config?.kind || '';
  return String(raw).trim().toLowerCase();
}

function resolveProviderKey(integration) {
  const kind = normalizeIntegrationKind(integration);
  if (kind) {
    if (['meta_ads', 'meta-ads'].includes(kind)) return 'meta';
    if (['google_ads', 'google-ads'].includes(kind)) return 'google_ads';
    if (['google_analytics', 'ga4'].includes(kind)) return 'google_analytics';
    if (['tiktok_ads', 'tiktok'].includes(kind)) return 'tiktok';
    return null;
  }

  const providerRaw = (integration.provider || integration.type || integration.providerName || '')
    .toString()
    .toLowerCase();

  if (['meta', 'facebook', 'instagram', 'facebook-ads', 'instagram-ads'].includes(providerRaw)) {
    return 'meta';
  }

  if (['google', 'google-ads', 'google_ads'].includes(providerRaw)) {
    return 'google_ads';
  }

  if (['google_analytics', 'ga4'].includes(providerRaw)) {
    return 'google_analytics';
  }

  if (['tiktok', 'tiktok-ads'].includes(providerRaw)) {
    return 'tiktok';
  }

  return null;
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

async function saveMetric({ tenantId, metric, providerType, rangeInfo, integrationId, clientId }) {
  const name = metric.name || metric.key || metric.type;
  if (!name) {
    safeLog('saveMetric ignorou entrada sem name', metric);
    return null;
  }

  const value = Number(metric.value ?? metric.total ?? 0);
  if (Number.isNaN(value)) {
    safeLog('saveMetric ignorou métrica com valor inválido', metric);
    return null;
  }

  const postId = metric.postId || metric.post_id || null;
  if (!postId && !integrationId) {
    safeLog('saveMetric ignorou métrica sem postId ou integrationId', metric);
    return null;
  }

  const collectedAt = resolveCollectedAt(metric, rangeInfo);
  const { start, end } = getDayBounds(collectedAt);

  const where = {
    tenantId,
    name,
    collectedAt: {
      gte: start,
      lt: end,
    },
  };

  if (postId) where.postId = postId;
  if (integrationId) where.integrationId = integrationId;
  if (clientId) where.clientId = clientId;

  const existing = await prisma.metric.findFirst({ where });

  const rangeMeta = rangeInfo?.range ? { range: rangeInfo.range } : null;
  const meta = metric.meta || metric.metadata || null;

  if (existing) {
    return prisma.metric.update({
      where: { id: existing.id },
      data: {
        value,
        collectedAt,
        provider: providerType || metric.provider || existing.provider || null,
        rangeFrom: rangeInfo?.rangeFrom || existing.rangeFrom || null,
        rangeTo: rangeInfo?.rangeTo || existing.rangeTo || null,
        clientId: clientId || existing.clientId || null,
        integrationId: integrationId || existing.integrationId || null,
        postId: postId || existing.postId || null,
        meta: {
          ...(existing.meta || {}),
          ...(meta || {}),
          ...(rangeMeta || {}),
          lastUpdatedAt: new Date().toISOString(),
        },
      },
    });
  }

  return prisma.metric.create({
    data: {
      tenantId,
      postId,
      integrationId: integrationId || null,
      clientId: clientId || null,
      name,
      value,
      provider: providerType || metric.provider || null,
      collectedAt,
      rangeFrom: rangeInfo?.rangeFrom || null,
      rangeTo: rangeInfo?.rangeTo || null,
      meta:
        meta || rangeMeta || providerType
          ? {
              ...(meta || {}),
              ...(rangeMeta || {}),
              ...(providerType ? { provider: providerType } : {}),
            }
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
  const rangeInfo = buildRangeInfo(payload);

  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });

  if (!integration) {
    safeLog('Integração não encontrada — done');
    await finalizeJob(entry, 'done', { ok: true, skipped: true });
    return null;
  }

  const status = String(integration.status || '').toUpperCase();
  if (['INACTIVE', 'DISCONNECTED'].includes(status)) {
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
    const providerKey = resolveProviderKey(integration);

    if (!providerKey) {
      safeLog('Provider de integração não suportado para métricas', {
        provider: integration.provider,
        kind: integration.settings?.kind,
      });
      await finalizeJob(entry, 'done', {
        ok: true,
        skipped: true,
        reason: 'unsupported_provider',
        provider: integration.provider || null,
      });
      return null;
    }

    const providerOptions = {
      range: rangeInfo.range,
      metricTypes: Array.isArray(payload.metricTypes) ? payload.metricTypes : undefined,
      granularity: payload.granularity || 'day',
      runId: String(entry.id),
    };

    if (providerKey === 'meta' && metaProvider?.fetchAccountMetrics) {
      metrics = await metaProvider.fetchAccountMetrics(integration, providerOptions);
    }

    if (providerKey === 'google_ads' && googleProvider?.fetchAccountMetrics) {
      metrics = await googleProvider.fetchAccountMetrics(integration, providerOptions);
    }

    if (providerKey === 'google_analytics' && googleAnalyticsProvider?.fetchAccountMetrics) {
      metrics = await googleAnalyticsProvider.fetchAccountMetrics(integration, providerOptions);
    }

    if (providerKey === 'tiktok' && tiktokProvider?.fetchAccountMetrics) {
      metrics = await tiktokProvider.fetchAccountMetrics(integration, providerOptions);
    }

    if (!metrics || !metrics.length) {
      safeLog('Nenhuma métrica retornada do provider', providerKey);
    } else {
      const clientId = payload.clientId || integration.clientId || null;
      for (const m of metrics) {
        await saveMetric({
          tenantId,
          metric: m,
          providerType: providerKey,
          rangeInfo,
          integrationId: integration.id,
          clientId,
        });
      }
    }

    try {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { lastSyncedAt: new Date() },
      });
    } catch (err) {
      safeLog('Falha ao atualizar lastSyncedAt', err?.message || err);
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
