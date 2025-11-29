// api/src/jobs/integrationSyncJob.js
// Job/Worker responsável por consumir a fila jobQueue para integration_sync
// - Polls regularmente a tabela jobQueue procurando entries com jobType='integration_sync' e status='queued'
// - Tenta "claim" a entrada (set status -> 'processing') via update condicional (id + status='queued')
// - Chama integrationsService.processIntegrationJob(referenceId)
// - Atualiza jobQueue/integrationJob com status adequado (done/failed)
//
// IMPORTANTE:
// - ESTE ARQUIVO NÃO POSSUI MAIS LOOP start/stop COM setTimeout.
// - Ele funciona APENAS via pollOnce(), pronto para integração com BullMQ se desejado futuramente.
// - A FASE 4 não usa integrationSyncJob, mas deixamos ele alinhado com a arquitetura.
//
// Export:
//   pollOnce()
//   _tryClaimNextJob()
//   _processQueueEntry()
//

const { prisma } = require('../prisma');
const integrationsService = require('../services/integrationsService');

const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS) || 5;

function safeLog(...args) {
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log('[integrationSyncJob]', ...args);
  }
}

/**
 * tryClaimNextJob
 * - busca a próxima entry queued do tipo integration_sync
 * - tenta atualizar seu status para 'processing' de forma condicional
 * - retorna a jobQueue entry atualizada claimada, ou null se não conseguiu
 */
async function tryClaimNextJob() {
  const candidate = await prisma.jobQueue.findFirst({
    where: { jobType: 'integration_sync', status: 'queued' },
    orderBy: { createdAt: 'asc' },
  });

  if (!candidate) return null;

  const claimed = await prisma.jobQueue.updateMany({
    where: { id: candidate.id, status: 'queued' },
    data: {
      status: 'processing',
      updatedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  if (claimed.count === 0) return null; // outro worker pegou

  return prisma.jobQueue.findUnique({ where: { id: candidate.id } });
}

/**
 * processQueueEntry
 * - dado um jobQueue entry, chama integrationsService.processIntegrationJob(referenceId)
 * - atualiza integrationJob/prisma.jobQueue de acordo com resultado
 */
async function processQueueEntry(entry) {
  if (!entry) return;

  const referenceId = entry.referenceId;
  safeLog('processing queue entry', entry.id, 'ref->', referenceId);

  try {
    // Chama processamento da integração
    const result = await integrationsService.processIntegrationJob(referenceId);

    await prisma.jobQueue.update({
      where: { id: entry.id },
      data: {
        status: 'done',
        updatedAt: new Date(),
        finishedAt: new Date(),
      },
    });

    safeLog('processed successfully', entry.id, result && result.ok ? 'ok' : result);
    return true;
  } catch (err) {
    safeLog(
      'processing FAILED for entry',
      entry.id,
      err && err.message ? err.message : err,
    );

    const attempts = entry.attempts || 1;
    const now = new Date();

    if (attempts < MAX_ATTEMPTS) {
      const backoffSeconds = Math.min(60 * Math.pow(2, attempts - 1), 3600);
      const nextRunAt = new Date(Date.now() + backoffSeconds * 1000);

      await prisma.jobQueue.update({
        where: { id: entry.id },
        data: {
          status: 'queued',
          updatedAt: now,
          nextRunAt,
          lastError: err && err.message ? err.message : String(err),
        },
      });
    } else {
      await prisma.jobQueue.update({
        where: { id: entry.id },
        data: {
          status: 'failed',
          updatedAt: now,
          lastError: err && err.message ? err.message : String(err),
        },
      });
    }

    return false;
  }
}

/**
 * pollOnce
 * - tenta claim e processar 1 job por chamada.
 */
async function pollOnce() {
  try {
    const candidate = await prisma.jobQueue.findFirst({
      where: {
        jobType: 'integration_sync',
        status: 'queued',
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!candidate) return false;

    const claimed = await prisma.jobQueue.updateMany({
      where: { id: candidate.id, status: 'queued' },
      data: {
        status: 'processing',
        updatedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    if (claimed.count === 0) return false;

    const entry = await prisma.jobQueue.findUnique({ where: { id: candidate.id } });
    if (!entry) return false;

    return processQueueEntry(entry);
  } catch (err) {
    safeLog('pollOnce error', err && err.message ? err.message : err);
    return false;
  }
}

module.exports = {
  pollOnce,
  _tryClaimNextJob: tryClaimNextJob,
  _processQueueEntry: processQueueEntry,
};
