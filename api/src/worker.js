require('dotenv').config();
const { Worker } = require('bullmq');
const Redis = require('ioredis');

const {
  metricsSyncQueue,
  reportsQueue,
  whatsappQueue,
  publishingQueue,
} = require('./queues');
const { prisma } = require('./prisma');

const updateMetricsJob = require('./jobs/updateMetricsJob');
const refreshMetaTokensJob = require('./jobs/refreshMetaTokensJob');
const reportGenerationJob = require('./jobs/reportGenerationJob');
const automationWhatsAppJob = require('./jobs/automationWhatsAppJob');
const whatsappApprovalJob = require('./jobs/whatsappApprovalRequestJob');
const publishScheduledPostsJob = require('./jobs/publishScheduledPostsJob');

// ------------------------------------------------------
// Conexão do BullMQ (usa REDIS_URL da env; em dev cai pro localhost)
// ------------------------------------------------------
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Períodos de agendamento (ms)
const METRICS_AGG_PERIOD_MS = Number(process.env.METRICS_AGG_PERIOD_MS) || 3600000; // 1h
const REPORTS_GENERATION_PERIOD_MS =
  Number(process.env.REPORTS_GENERATION_PERIOD_MS) || 900000; // 15min
const WHATSAPP_AUTOMATION_PERIOD_MS =
  Number(process.env.WHATSAPP_AUTOMATION_PERIOD_MS) || 300000; // 5min
const POSTS_PUBLISH_PERIOD_MS =
  Number(process.env.POSTS_PUBLISH_PERIOD_MS) || 60000; // 1min

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

// ------------------------------------------------------
// Workers das filas
// ------------------------------------------------------
const metricsWorker = new Worker(
  metricsSyncQueue.name,
  async (job) => {
    console.log('[metricsSync] processing job', job.id, job.name);
    await runPollOnce(updateMetricsJob, 'updateMetricsJob');
    await runPollOnce(refreshMetaTokensJob, 'refreshMetaTokensJob');
  },
  { connection },
);

const reportsWorker = new Worker(
  reportsQueue.name,
  async (job) => {
    console.log('[reports] processing job', job.id, job.name);
    await runPollOnce(reportGenerationJob, 'reportGenerationJob');
  },
  { connection },
);

const whatsappWorker = new Worker(
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
  { connection },
);

const publishingWorker = new Worker(
  publishingQueue.name,
  async (job) => {
    console.log('[publish] processing job', job.id, job.name);
    await runPollOnce(publishScheduledPostsJob, 'publishScheduledPostsJob');
  },
  { connection },
);

// ------------------------------------------------------
// Logs de sucesso
// ------------------------------------------------------
metricsWorker.on('completed', (job) => {
  console.log('[metricsSync] job completed', job.id);
});

reportsWorker.on('completed', (job) => {
  console.log('[reports] job completed', job.id);
});

whatsappWorker.on('completed', (job) => {
  console.log('[whatsapp] job completed', job.id);
});

publishingWorker.on('completed', (job) => {
  console.log('[publish] job completed', job.id);
});

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
}

metricsWorker.on('failed', async (job, err) => {
  console.error('[metricsSync] job failed', job?.id, err);
  await logJobFailure(metricsSyncQueue.name, job, err);
});

reportsWorker.on('failed', async (job, err) => {
  console.error('[reports] job failed', job?.id, err);
  await logJobFailure(reportsQueue.name, job, err);
});

whatsappWorker.on('failed', async (job, err) => {
  console.error('[whatsapp] job failed', job?.id, err);
  await logJobFailure(whatsappQueue.name, job, err);
});

publishingWorker.on('failed', async (job, err) => {
  console.error('[publish] job failed', job?.id, err);
  await logJobFailure(publishingQueue.name, job, err);
});

// ------------------------------------------------------
// Agendamento de jobs recorrentes (repeatable jobs)
// ------------------------------------------------------
async function ensureRepeatableJobs() {
  console.log('[worker] configurando repeatable jobs com períodos:', {
    METRICS_AGG_PERIOD_MS,
    REPORTS_GENERATION_PERIOD_MS,
    WHATSAPP_AUTOMATION_PERIOD_MS,
    POSTS_PUBLISH_PERIOD_MS,
  });

  await metricsSyncQueue.upsertJobScheduler('metrics-poll', { every: METRICS_AGG_PERIOD_MS });
  await reportsQueue.upsertJobScheduler('reports-poll', { every: REPORTS_GENERATION_PERIOD_MS });
  await whatsappQueue.upsertJobScheduler('whatsapp-poll', { every: WHATSAPP_AUTOMATION_PERIOD_MS });
  await publishingQueue.upsertJobScheduler('posts-publish', { every: POSTS_PUBLISH_PERIOD_MS });

  console.log('[worker] repeatable jobs registrados com sucesso');
}

ensureRepeatableJobs().catch((err) => {
  console.error(
    '[worker] erro ao configurar repeatable jobs:',
    err && err.stack ? err.stack : err,
  );
});
