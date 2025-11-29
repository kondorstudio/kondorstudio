// api/src/services/automationEngine.js
// Automation Engine central:
// - CRUD de rules/automations por tenant (placeholder, ainda não persistido em tabela própria)
// - evaluateEventAndEnqueue(tenantId, event) -> checa mapeamentos e enfileira jobs conforme ações
// - enqueueJob(tenantId, job) -> cria entry em JobQueue (prisma.jobQueue)
//
// IMPORTANTE:
// - Não criamos nenhuma tabela nova. Usamos apenas JobQueue já existente no schema.
// - As funções de CRUD de regras são minimalistas (sem persistência), pois ainda não há model específico.
// - O foco atual é suportar eventos principais como 'post.approved' -> job 'automation_whatsapp'.
//
// Event shape esperado:
// {
//   type: 'post.approved' | 'post.pending_approval' | 'report.ready' | 'payment.reminder' | string,
//   payload: {...}, // qualquer objeto
//   context?: {...} // infos adicionais (ex.: actorId, ip, etc.)
// }

const { prisma } = require('../prisma');

const DEFAULT_MAX_ENQUEUE = 100;

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[automationEngine]', ...args);
}

/**
 * Pequeno utilitário para acessar caminhos tipo 'payload.client.phone'
 */
function get(obj, path, defaultValue = undefined) {
  if (!obj || !path) return defaultValue;
  const parts = path.split('.');
  let current = obj;
  for (const p of parts) {
    if (current && Object.prototype.hasOwnProperty.call(current, p)) {
      current = current[p];
    } else {
      return defaultValue;
    }
  }
  return current;
}

/**
 * enqueueJob(tenantId, options)
 *
 * options:
 * - jobType   (obrigatório) -> salvo em JobQueue.type
 * - name      (opcional)    -> nome lógico da fila (JobQueue.name)
 * - referenceId (opcional)  -> guardado dentro do payload
 * - payload   (opcional)    -> objeto JSON livre
 * - runAt     (opcional)    -> Date; se futuro, job fica agendado
 */
async function enqueueJob(tenantId, options) {
  const {
    jobType,
    name,
    referenceId,
    payload,
    runAt,
  } = options || {};

  if (!jobType) {
    throw new Error('jobType required for enqueueJob');
  }

  const queueName = name || jobType;

  // Evitar flood de jobs muito semelhantes por tenant
  try {
    const existingCount = await prisma.jobQueue.count({
      where: {
        tenantId,
        type: jobType,
        status: 'queued',
      },
    });
    const max = Number(process.env.AUTOMATION_MAX_SIMILAR_JOBS) || DEFAULT_MAX_ENQUEUE;
    if (existingCount >= max) {
      safeLog('enqueueJob skipped (max queued reached)', { tenantId, jobType, existingCount, max });
      return { skipped: true, reason: 'max_queued' };
    }
  } catch (err) {
    safeLog('enqueueJob: count failed, continuing', err && err.message ? err.message : err);
  }

  const data = {
    tenantId: tenantId || null,
    name: queueName,
    type: jobType,
    payload: {
      ...(payload || {}),
      referenceId: referenceId || (payload && payload.referenceId) || null,
    },
    status: 'queued',
  };

  if (runAt instanceof Date && !Number.isNaN(runAt.getTime())) {
    data.runAt = runAt;
  }

  const created = await prisma.jobQueue.create({ data });
  safeLog('job enqueued', { id: created.id, tenantId, jobType, queueName });
  return created;
}

/**
 * resolveTo(payload)
 * Resolve o número final "to" usando várias fontes possíveis:
 * - payload.to
 * - payload.clientPhone
 * - payload.clientWhatsapp
 * - payload.client.phone  (usando get)
 * - payload.client.contacts.whatsapp  (usando get)
 */
function resolveTo(payload = {}) {
  const direct = payload.to || payload.clientPhone || payload.clientWhatsapp;
  if (direct) return direct;

  // fallbacks seguros
  const fromClientPhone = get(payload, 'client.phone');
  if (fromClientPhone) return fromClientPhone;

  const fromClientContacts = get(payload, 'client.contacts.whatsapp');
  if (fromClientContacts) return fromClientContacts;

  return null;
}

/**
 * mapEventToJobs(event)
 *
 * Para agora, temos um mapeamento estático suficiente para:
 * - post.approved
 * - post.pending_approval
 * - report.ready
 * - payment.reminder
 */
function mapEventToJobs(event) {
  if (!event || !event.type) return [];

  const { type, payload = {} } = event;
  const jobs = [];

  if (type === 'post.approved') {
    const to = resolveTo(payload);
    if (to) {
      jobs.push({
        jobType: 'automation_whatsapp',
        name: 'whatsappNotifications',
        referenceId: payload.postId || payload.approvalId || null,
        payload: {
          type: 'post_approved',
          to,
          clientId: payload.clientId || null,
          vars: {
            postTitle: payload.postTitle || null,
            clientName: payload.clientName || null,
          },
        },
      });
    }
  }

  if (type === 'post.pending_approval') {
    const to = resolveTo(payload);
    if (to) {
      jobs.push({
        jobType: 'automation_whatsapp',
        name: 'whatsappNotifications',
        referenceId: payload.postId || null,
        payload: {
          type: 'post_pending',
          to,
          clientId: payload.clientId || null,
          vars: {
            postTitle: payload.postTitle || null,
            clientName: payload.clientName || null,
          },
        },
      });
    }
  }

  if (type === 'report.ready') {
    const to = resolveTo(payload);
    if (to) {
      jobs.push({
        jobType: 'automation_whatsapp',
        name: 'whatsappNotifications',
        referenceId: payload.reportId || null,
        payload: {
          type: 'report_ready',
          to,
          clientId: payload.clientId || null,
          vars: {
            reportId: payload.reportId || null,
            reportType: payload.reportType || null,
          },
        },
      });
    }
  }

  if (type === 'payment.reminder') {
    const to = resolveTo(payload);
    if (to) {
      jobs.push({
        jobType: 'automation_whatsapp',
        name: 'whatsappNotifications',
        referenceId: payload.invoiceId || null,
        payload: {
          type: 'payment_reminder',
          to,
          clientId: payload.clientId || null,
          vars: {
            amountCents: payload.amountCents || null,
            amountFormatted: payload.amountFormatted || null,
            dueDate: payload.dueDate || null,
            dueDateFormatted: payload.dueDateFormatted || null,
          },
        },
      });
    }
  }

  return jobs;
}

/**
 * evaluateEventAndEnqueue(tenantId, event)
 *
 * - Aplica mapeamento estático (e futuramente regras dinâmicas)
 * - Enfileira jobs resultantes via enqueueJob()
 */
async function evaluateEventAndEnqueue(tenantId, event) {
  if (!event || !event.type) {
    return { enqueued: [], skipped: true, reason: 'missing_event_type' };
  }

  const jobs = mapEventToJobs(event);
  if (!jobs.length) {
    safeLog('no jobs mapped for event', { tenantId, type: event.type });
    return { enqueued: [], skipped: true, reason: 'no_jobs_mapped' };
  }

  const enqueued = [];
  for (const job of jobs) {
    const created = await enqueueJob(tenantId, job);
    enqueued.push(created);
  }

  return { enqueued, skipped: false };
}

/**
 * CRUD stubs
 */
async function createRule() {
  throw new Error('Automation rules persistence not implemented yet');
}
async function listRules() {
  return [];
}
async function getRule() {
  return null;
}
async function updateRule() {
  throw new Error('Automation rules persistence not implemented yet');
}
async function deleteRule() {
  throw new Error('Automation rules persistence not implemented yet');
}

/**
 * Export
 */
module.exports = {
  createRule,
  listRules,
  getRule,
  updateRule,
  deleteRule,
  evaluateEventAndEnqueue,
  enqueueJob,
  mapEventToJobs,
  resolveTo,
  get,
};
