require('dotenv').config();
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { assertCryptoKeyConfiguration } = require('./lib/cryptoCore');

const {
  metricsSyncQueue,
  reportsQueue,
  whatsappQueue,
  publishingQueue,
  reportGenerateQueue,
  dashboardRefreshQueue,
  reportScheduleQueue,
  ga4SyncQueue,
  BULLMQ_PREFIX,
} = require('./queues');
const { prisma } = require('./prisma');
const emailService = require('./services/emailService');

const updateMetricsJob = require('./jobs/updateMetricsJob');
const refreshMetaTokensJob = require('./jobs/refreshMetaTokensJob');
const reportGenerationJob = require('./jobs/reportGenerationJob');
const reportingGenerateJob = require('./jobs/reportingGenerateJob');
const dashboardRefreshJob = require('./jobs/dashboardRefreshJob');
const reportScheduleJob = require('./jobs/reportScheduleJob');
const automationWhatsAppJob = require('./jobs/automationWhatsAppJob');
const whatsappApprovalJob = require('./jobs/whatsappApprovalRequestJob');
const publishScheduledPostsJob = require('./jobs/publishScheduledPostsJob');
const reportSchedulesService = require('./modules/reporting/reportSchedules.service');
const syncOrchestrationService = require('./modules/sync/sync.service');
const ga4FactSyncJob = require('./jobs/ga4FactSyncJob');
const ga4RealtimeSyncJob = require('./jobs/ga4RealtimeSyncJob');
const ga4BrandFactsSyncJob = require('./jobs/ga4BrandFactsSyncJob');
const ga4PruneJob = require('./jobs/ga4PruneJob');

// Fail fast when encryption keys are misconfigured to avoid token decrypt drift between processes.
assertCryptoKeyConfiguration();

// ------------------------------------------------------
// Conexão do BullMQ (usa REDIS_URL da env; em dev cai pro localhost)
// ------------------------------------------------------
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});
const workerOptions = {
  connection,
  prefix: BULLMQ_PREFIX,
  autorun: false,
};

// Períodos de agendamento (ms)
const METRICS_AGG_PERIOD_MS = Number(process.env.METRICS_AGG_PERIOD_MS) || 3600000; // 1h
const REPORTS_GENERATION_PERIOD_MS =
  Number(process.env.REPORTS_GENERATION_PERIOD_MS) || 900000; // 15min
const WHATSAPP_AUTOMATION_PERIOD_MS =
  Number(process.env.WHATSAPP_AUTOMATION_PERIOD_MS) || 300000; // 5min
const POSTS_PUBLISH_PERIOD_MS =
  Number(process.env.POSTS_PUBLISH_PERIOD_MS) || 60000; // 1min
const DASHBOARD_REFRESH_PERIOD_MS =
  Number(process.env.DASHBOARD_REFRESH_PERIOD_MS) || 0;
const GA4_FACT_SYNC_PERIOD_MS =
  Number(process.env.GA4_FACT_SYNC_PERIOD_MS) || 3600000; // 1h
const GA4_REALTIME_SYNC_PERIOD_MS =
  Number(process.env.GA4_REALTIME_SYNC_PERIOD_MS) || 60000; // 1min
const GA4_PRUNE_PERIOD_MS =
  Number(process.env.GA4_PRUNE_PERIOD_MS) || 24 * 60 * 60 * 1000; // 24h
const WORKER_QUEUE_HEALTH_LOG_INTERVAL_MS = Math.max(
  0,
  Number(process.env.WORKER_QUEUE_HEALTH_LOG_INTERVAL_MS || 60_000),
);

// ------------------------------------------------------
// Helper genérico para rodar pollOnce() dos módulos de job
// ------------------------------------------------------
async function runPollOnce(jobModule, label) {
  if (!jobModule || typeof jobModule.pollOnce !== 'function') {
    console.warn(
      `[worker] módulo de job sem pollOnce(): ${label}. Nada será processado.`,
    );
    return;
  }

  try {
    const result = await jobModule.pollOnce();
    console.log(`[worker] pollOnce() executado para ${label}`, {
      ok: !!result,
    });
  } catch (err) {
    console.error(
      `[worker] erro ao executar pollOnce() em ${label}:`,
      err && err.stack ? err.stack : err,
    );
    throw err;
  }
}

let publishPollInFlight = false;
async function runPublishPoll() {
  if (publishPollInFlight) return;
  publishPollInFlight = true;
  try {
    await runPollOnce(publishScheduledPostsJob, 'publishScheduledPostsJob');
  } finally {
    publishPollInFlight = false;
  }
}

// ------------------------------------------------------
// Workers das filas
// ------------------------------------------------------
const metricsWorker = metricsSyncQueue
  ? new Worker(
      metricsSyncQueue.name,
      async (job) => {
        console.log('[metricsSync] processing job', job.id, job.name);
        await runPollOnce(updateMetricsJob, 'updateMetricsJob');
        await runPollOnce(refreshMetaTokensJob, 'refreshMetaTokensJob');
      },
      workerOptions,
    )
  : null;

const reportsWorker = reportsQueue
  ? new Worker(
      reportsQueue.name,
      async (job) => {
        console.log('[reports] processing job', job.id, job.name);
        await runPollOnce(reportGenerationJob, 'reportGenerationJob');
      },
      workerOptions,
    )
  : null;

const reportGenerateWorker = reportGenerateQueue
  ? new Worker(
      reportGenerateQueue.name,
      async (job) => {
        console.log('[reporting] processing job', job.id, job.name);
        await reportingGenerateJob.processJob(job.data || {});
      },
      workerOptions,
    )
  : null;

const dashboardRefreshWorker = dashboardRefreshQueue
  ? new Worker(
      dashboardRefreshQueue.name,
      async (job) => {
        console.log('[dashboardRefresh] processing job', job.id, job.name);
        await dashboardRefreshJob.processJob(job.data || {});
      },
      workerOptions,
    )
  : null;

const reportScheduleWorker = reportScheduleQueue
  ? new Worker(
      reportScheduleQueue.name,
      async (job) => {
        console.log('[reportSchedule] processing job', job.id, job.name);
        await reportScheduleJob.processJob(job.data || {});
      },
      workerOptions,
    )
  : null;

const whatsappWorker = whatsappQueue
  ? new Worker(
      whatsappQueue.name,
      async (job) => {
        if (job.name === 'whatsapp_send_approval_request') {
          console.log('[whatsapp] sending approval request job', job.id);
          await whatsappApprovalJob.processApprovalRequestJob(job.data || {}, {
            jobId: job.id,
            attemptsMade: job.attemptsMade,
          });
          return;
        }
        console.log('[whatsapp] processing job', job.id, job.name);
        await runPollOnce(automationWhatsAppJob, 'automationWhatsAppJob');
      },
      workerOptions,
    )
  : null;

const publishingWorker = publishingQueue
  ? new Worker(
      publishingQueue.name,
      async (job) => {
        console.log('[publish] processing job', job.id, job.name);
        await runPublishPoll();
      },
      workerOptions,
    )
  : null;

const ga4SyncWorker = ga4SyncQueue
  ? new Worker(
      ga4SyncQueue.name,
      async (job) => {
        console.log('[ga4Sync] processing job', job.id, job.name);
        if (job.name === 'ga4-realtime-sync') {
          await runPollOnce(ga4RealtimeSyncJob, 'ga4RealtimeSyncJob');
          return;
        }
        if (job.name === 'ga4-facts-sync') {
          await runPollOnce(ga4FactSyncJob, 'ga4FactSyncJob');
          return;
        }
        if (job.name === 'ga4-brand-facts-sync') {
          await ga4BrandFactsSyncJob.processJob(job.data || {});
          return;
        }
        if (job.name === 'ga4-prune') {
          await runPollOnce(ga4PruneJob, 'ga4PruneJob');
          return;
        }
        if (
          job.name === 'sync-preview' ||
          job.name === 'sync-backfill' ||
          job.name === 'sync-incremental'
        ) {
          await syncOrchestrationService.processSyncQueueJob(job);
          return;
        }

        // Fallback for unexpected scheduler ids.
        await runPollOnce(ga4FactSyncJob, 'ga4FactSyncJob');
      },
      workerOptions,
    )
  : null;

function getActiveWorkers() {
  return [
    metricsWorker,
    reportsWorker,
    reportGenerateWorker,
    dashboardRefreshWorker,
    reportScheduleWorker,
    whatsappWorker,
    publishingWorker,
    ga4SyncWorker,
  ].filter(Boolean);
}

function startWorkers() {
  getActiveWorkers().forEach((worker) => {
    worker.run().catch((err) => {
      console.error('[worker] worker run failed', {
        queue: worker?.name || null,
        message: err?.message || err,
      });
      process.exit(1);
    });
  });
}

// ------------------------------------------------------
// Logs de sucesso
// ------------------------------------------------------
if (metricsWorker) {
  metricsWorker.on('completed', (job) => {
    console.log('[metricsSync] job completed', job.id);
  });
}

if (reportsWorker) {
  reportsWorker.on('completed', (job) => {
    console.log('[reports] job completed', job.id);
  });
}

if (reportGenerateWorker) {
  reportGenerateWorker.on('completed', (job) => {
    console.log('[reporting] job completed', job.id);
  });
}

if (dashboardRefreshWorker) {
  dashboardRefreshWorker.on('completed', (job) => {
    console.log('[dashboardRefresh] job completed', job.id);
  });
}

if (reportScheduleWorker) {
  reportScheduleWorker.on('completed', (job) => {
    console.log('[reportSchedule] job completed', job.id);
  });
}

if (whatsappWorker) {
  whatsappWorker.on('completed', (job) => {
    console.log('[whatsapp] job completed', job.id);
  });
}

if (publishingWorker) {
  publishingWorker.on('completed', (job) => {
    console.log('[publish] job completed', job.id);
  });
}

if (ga4SyncWorker) {
  ga4SyncWorker.on('completed', (job) => {
    console.log('[ga4Sync] job completed', job.id, job.name);
  });
}

const jobAlertState = new Map();

function canSendJobAlert(key, throttleMs) {
  if (!key || throttleMs <= 0) return true;
  const now = Date.now();
  const lastAt = jobAlertState.get(key) || 0;
  if (now - lastAt < throttleMs) return false;
  jobAlertState.set(key, now);
  return true;
}

async function maybeSendJobFailureAlert(queueName, job, err) {
  const to = process.env.JOB_ALERT_EMAIL;
  if (!to) return;

  const throttleMs = Math.max(0, Number(process.env.JOB_ALERT_THROTTLE_MS || 5 * 60 * 1000));
  const alertKey = `${queueName || 'unknown'}:${job?.name || 'unknown'}`;
  if (!canSendJobAlert(alertKey, throttleMs)) return;

  const subject = `[Kondor] Job FAILED: ${queueName || 'unknown'} / ${job?.name || 'unknown'}`;
  const tenantId = job?.data?.tenantId || null;
  const jobId = job?.id ? String(job.id) : null;
  const attempts = job?.attemptsMade || job?.attempts || null;
  const message = err?.message || 'Erro desconhecido';
  const stack = err && err.stack ? String(err.stack).slice(0, 4000) : null;

  const text = [
    `queue: ${queueName || 'unknown'}`,
    `jobId: ${jobId || 'n/a'}`,
    `jobName: ${job?.name || 'n/a'}`,
    `tenantId: ${tenantId || 'n/a'}`,
    `attempts: ${attempts ?? 'n/a'}`,
    `error: ${message}`,
    stack ? `\nstack:\n${stack}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  await emailService.sendEmail({ to, subject, text });
}

async function logJobFailure(queueName, job, err) {
  try {
    await prisma.jobLog.create({
      data: {
        queue: queueName,
        jobId: job?.id ? String(job.id) : null,
        status: 'FAILED',
        attempts: job?.attemptsMade || job?.attempts || null,
        tenantId: job?.data?.tenantId || null,
        error: err && err.stack ? err.stack.slice(0, 2000) : (err && err.message) || 'Erro desconhecido',
      },
    });
  } catch (logErr) {
    console.error('[worker] Falha ao registrar JobLog', logErr);
  }

  try {
    await maybeSendJobFailureAlert(queueName, job, err);
  } catch (alertErr) {
    console.error('[worker] Falha ao enviar alerta de job', alertErr?.message || alertErr);
  }
}

if (metricsWorker) {
  metricsWorker.on('failed', async (job, err) => {
    console.error('[metricsSync] job failed', job?.id, err);
    await logJobFailure(metricsSyncQueue?.name || 'metrics-sync', job, err);
  });
}

if (reportsWorker) {
  reportsWorker.on('failed', async (job, err) => {
    console.error('[reports] job failed', job?.id, err);
    await logJobFailure(reportsQueue?.name || 'reports-generation', job, err);
  });
}

if (reportGenerateWorker) {
  reportGenerateWorker.on('failed', async (job, err) => {
    console.error('[reporting] job failed', job?.id, err);
    await logJobFailure(reportGenerateQueue?.name || 'report-generate', job, err);
  });
}

if (dashboardRefreshWorker) {
  dashboardRefreshWorker.on('failed', async (job, err) => {
    console.error('[dashboardRefresh] job failed', job?.id, err);
    await logJobFailure(dashboardRefreshQueue?.name || 'dashboard-refresh', job, err);
  });
}

if (reportScheduleWorker) {
  reportScheduleWorker.on('failed', async (job, err) => {
    console.error('[reportSchedule] job failed', job?.id, err);
    await logJobFailure(reportScheduleQueue?.name || 'report-schedule', job, err);
  });
}

if (whatsappWorker) {
  whatsappWorker.on('failed', async (job, err) => {
    console.error('[whatsapp] job failed', job?.id, err);
    await logJobFailure(whatsappQueue?.name || 'whatsapp-automation', job, err);
  });
}

if (publishingWorker) {
  publishingWorker.on('failed', async (job, err) => {
    console.error('[publish] job failed', job?.id, err);
    await logJobFailure(publishingQueue?.name || 'posts-publish', job, err);
  });
}

if (ga4SyncWorker) {
  ga4SyncWorker.on('failed', async (job, err) => {
    console.error('[ga4Sync] job failed', job?.id, job?.name, err);
    await logJobFailure(ga4SyncQueue?.name || 'ga4-sync', job, err);
  });
}

async function assertDatabaseReady() {
  if (!prisma || typeof prisma.$queryRaw !== 'function') return;
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[worker] database connectivity check ok');
  } catch (err) {
    const payload = {
      code: err?.code || null,
      message: err?.message || 'database_check_failed',
    };
    console.error('[worker] database connectivity check failed', payload);
    const authFailure =
      String(err?.code || '').toUpperCase() === 'P1000' ||
      String(err?.message || '').toLowerCase().includes('authentication');
    if (authFailure) {
      console.error('[worker] DATABASE_AUTH_FAILED');
    }
    throw err;
  }
}

function getQueueHealthTargets() {
  return [
    ['metrics-sync', metricsSyncQueue],
    ['reports-generation', reportsQueue],
    ['ga4-sync', ga4SyncQueue],
  ].filter((entry) => Boolean(entry[1]));
}

async function logQueueHealthSnapshot(trigger = 'startup') {
  const targets = getQueueHealthTargets();
  if (!targets.length) return;

  await Promise.all(
    targets.map(async ([name, queue]) => {
      try {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'completed',
          'failed',
        );
        console.log('[worker] queue_health', {
          trigger,
          queue: name,
          counts,
        });
      } catch (err) {
        console.error('[worker] queue_health_failed', {
          trigger,
          queue: name,
          message: err?.message || err,
        });
      }
    }),
  );
}

// ------------------------------------------------------
// Agendamento de jobs recorrentes (repeatable jobs)
// ------------------------------------------------------
async function ensureRepeatableJobs() {
  console.log('[worker] configurando repeatable jobs com períodos:', {
    METRICS_AGG_PERIOD_MS,
    REPORTS_GENERATION_PERIOD_MS,
    WHATSAPP_AUTOMATION_PERIOD_MS,
    POSTS_PUBLISH_PERIOD_MS,
    DASHBOARD_REFRESH_PERIOD_MS,
    GA4_FACT_SYNC_PERIOD_MS,
    GA4_REALTIME_SYNC_PERIOD_MS,
    GA4_PRUNE_PERIOD_MS,
  });

  if (metricsSyncQueue) {
    await metricsSyncQueue.upsertJobScheduler('metrics-poll', { every: METRICS_AGG_PERIOD_MS });
  }
  if (reportsQueue) {
    await reportsQueue.upsertJobScheduler('reports-poll', { every: REPORTS_GENERATION_PERIOD_MS });
  }
  if (whatsappQueue) {
    await whatsappQueue.upsertJobScheduler('whatsapp-poll', { every: WHATSAPP_AUTOMATION_PERIOD_MS });
  }
  if (publishingQueue) {
    await publishingQueue.upsertJobScheduler('posts-publish', { every: POSTS_PUBLISH_PERIOD_MS });
  }
  if (DASHBOARD_REFRESH_PERIOD_MS > 0 && dashboardRefreshQueue) {
    await dashboardRefreshQueue.upsertJobScheduler('dashboard-refresh', {
      every: DASHBOARD_REFRESH_PERIOD_MS,
    });
  }

  if (ga4SyncQueue) {
    if (GA4_FACT_SYNC_PERIOD_MS > 0) {
      await ga4SyncQueue.upsertJobScheduler('ga4-facts-sync', { every: GA4_FACT_SYNC_PERIOD_MS });
    }
    if (GA4_REALTIME_SYNC_PERIOD_MS > 0) {
      await ga4SyncQueue.upsertJobScheduler('ga4-realtime-sync', { every: GA4_REALTIME_SYNC_PERIOD_MS });
    }
    if (GA4_PRUNE_PERIOD_MS > 0) {
      await ga4SyncQueue.upsertJobScheduler('ga4-prune', { every: GA4_PRUNE_PERIOD_MS });
    }
  }

  console.log('[worker] repeatable jobs registrados com sucesso');
}

async function ensureScheduleJobs() {
  try {
    const result = await reportSchedulesService.syncActiveSchedules();
    console.log('[worker] report schedules synced', result);
  } catch (err) {
    console.error(
      '[worker] erro ao sincronizar report schedules:',
      err && err.stack ? err.stack : err,
    );
  }
}

async function bootstrapWorker() {
  await assertDatabaseReady();
  startWorkers();
  await ensureRepeatableJobs();
  await ensureScheduleJobs();
  await logQueueHealthSnapshot('startup');

  if (WORKER_QUEUE_HEALTH_LOG_INTERVAL_MS > 0) {
    setInterval(() => {
      logQueueHealthSnapshot('interval').catch((err) => {
        console.error(
          '[worker] erro ao registrar queue health:',
          err && err.stack ? err.stack : err,
        );
      });
    }, WORKER_QUEUE_HEALTH_LOG_INTERVAL_MS);
  }

  if (POSTS_PUBLISH_PERIOD_MS > 0) {
    setInterval(() => {
      runPublishPoll().catch((err) => {
        console.error(
          '[worker] erro ao executar publishScheduledPostsJob via interval:',
          err && err.stack ? err.stack : err,
        );
      });
    }, POSTS_PUBLISH_PERIOD_MS);
  }
}

bootstrapWorker().catch((err) => {
  console.error(
    '[worker] bootstrap failed:',
    err && err.stack ? err.stack : err,
  );
  process.exit(1);
});
