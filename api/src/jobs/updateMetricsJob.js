// api/src/jobs/updateMetricsJob.js
// Job/Worker de sincronização de métricas (Meta, Google, TikTok).
// - Consome JobQueue com type='update_metrics'
// - Busca integrações ativas
// - Chama serviços de métricas (Meta/Google/TikTok) caso configurados
// - Salva resultados na tabela Metric
// - Suporta retry/backoff
//
// OBS IMPORTANTE:
// - Este módulo expõe apenas pollOnce(), para ser chamado pelo worker BullMQ.
// - O agendamento periódico é responsabilidade do src/worker.js (repeatable jobs).
//
// Schema Metric (exemplo conceitual; veja schema.prisma para a versão atual).
//
// ------------------------------------------------------

const { prisma } = require('../prisma');

const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS) || 5;
const BACKOFF_MS = Number(process.env.METRICS_BACKOFF_MS) || 60000;

// IMPORTAÇÃO OPCIONAL DOS PROVIDERS
// Eles só vão existir quando você implementar a integração real.
// Do jeito que este job foi escrito, NÃO quebra caso o provider não exista.

let metaProvider = null;
let googleProvider = null;
let tiktokProvider = null;

try {
  // eslint-disable-next-line global-require
  metaProvider = require('../services/metaMetricsService');
} catch (_) {}

try {
  // eslint-disable-next-line global-require
  googleProvider = require('../services/googleAdsMetricsService');
} catch (_) {}

try {
  // eslint-disable-next-line global-require
  tiktokProvider = require('../services/tiktokMetricsService');
} catch (_) {}

// ------------------------------------------------------

function safeLog(...args) {
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log('[updateMetricsJob]', ...args);
  }
}

// ------------------------------------------------------
// Helpers de data (para upsert diário / por período simples)

function getReferenceTimestamp(range) {
  // Se o job recebeu um range, usamos:
  // - until, se existir
  // - senão since
  if (range && typeof range === 'object') {
    const { since, until } = range;
    if (until) return new Date(`${until}T00:00:00.000Z`);
    if (since) return new Date(`${since}T00:00:00.000Z`);
  }
  // Fallback: agora
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

// ------------------------------------------------------
// Claim de job da JobQueue

async function claimNextMetricJob() {
  const now = new Date();

  const candidate = await prisma.jobQueue.findFirst({
    where: {
      type: 'update_metrics',
      status: 'queued',
      OR: [
        { runAt: null },
        { runAt: { lte: now } },
      ],
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

// ------------------------------------------------------

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

// ------------------------------------------------------
// SAVE METRIC
//
// Preferência: evitar duplicatas diárias usando um "upsert" lógico
// baseado em (tenantId, type, source, dia).

async function saveMetric(tenantId, metric, providerType, range) {
  const timestamp = getReferenceTimestamp(range);
  const { start, end } = getDayBounds(timestamp);

  const type = metric.name; // ex.: "meta.impressions", "google_ads.cost"
  const value = Number(metric.value || 0);
  const source = providerType || 'integration';

  // Tenta encontrar uma métrica existente no mesmo dia / tipo / source
  const existing = await prisma.metric.findFirst({
    where: {
      tenantId,
      type,
      source,
      timestamp: {
        gte: start,
        lt: end,
      },
    },
  });

  if (existing) {
    // Atualiza valor e meta (sem perder o histórico anterior)
    return prisma.metric.update({
      where: { id: existing.id },
      data: {
        value,
        timestamp,
        meta: {
          ...(existing.meta || {}),
          lastRange: range || null,
          lastUpdatedAt: new Date().toISOString(),
        },
      },
    });
  }

  // Cria nova métrica
  return prisma.metric.create({
    data: {
      tenantId,
      type,
      value,
      timestamp,
      source,
      meta: range ? { range } : null,
    },
  });
}

// ------------------------------------------------------
// PROCESSAMENTO PRINCIPAL

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

  // BUSCAR INTEGRAÇÃO
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });

  if (!integration) {
    safeLog('Integração não encontrada — done');
    await finalizeJob(entry, 'done', { ok: true, skipped: true });
    return null;
  }

  // Se a integração estiver desativada, pulamos
  // (ajuste aqui se o schema usar outro campo para status/ativo)
  // eslint-disable-next-line eqeqeq
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
    // provider/type pode ser salvo como "provider" no schema atual,
    // mas mantemos fallback para "type" por retrocompatibilidade.
    const providerTypeRaw = (integration.provider || integration.type || '').toLowerCase();

    let providerKey = null;

    // META (Facebook/Instagram Ads)
    if (['meta', 'facebook', 'instagram', 'facebook-ads', 'instagram-ads'].includes(providerTypeRaw)) {
      providerKey = 'meta';
      if (metaProvider?.fetchAccountMetrics) {
        metrics = await metaProvider.fetchAccountMetrics(integration, payload.range);
      }
    }

    // GOOGLE ADS
    if (['google', 'google-ads', 'google_ads'].includes(providerTypeRaw)) {
      providerKey = 'google_ads';
      if (googleProvider?.fetchAccountMetrics) {
        metrics = await googleProvider.fetchAccountMetrics(integration, payload.range);
      }
    }

    // TIKTOK (placeholder)
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
      // eslint-disable-next-line no-restricted-syntax
      for (const m of metrics) {
        // eslint-disable-next-line no-await-in-loop
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

// ------------------------------------------------------
// POLLING (uma iteração)
// ------------------------------------------------------

async function pollOnce() {
  const entry = await claimNextMetricJob();
  if (!entry) return null;

  return processMetricJob(entry);
}

module.exports = {
  pollOnce,
  // para debug
  _claimNextMetricJob: claimNextMetricJob,
  _processMetricJob: processMetricJob,
};
