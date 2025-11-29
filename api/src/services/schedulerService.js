// api/src/services/schedulerService.js
// Serviço de agendamento (scheduler) baseado em BullMQ repeatable jobs.
//
// Objetivo:
// - Expor funções para criar/remover jobs recorrentes em filas já existentes:
//   - reportsQueue (reports-generation)
//   - whatsappQueue (whatsapp-automation)
//
// Este service NÃO persiste configurações por conta própria. A camada de
// settings/tenant é quem decide qual cron usar e chama este serviço.
//
// Convenções de jobId (para evitar duplicação por tenant):
//  - Relatório recorrente custom:  "report:custom:<tenantId>:<slug>"
//  - Lembrete de aprovação:        "approval:reminder:<tenantId>"
//  - Lembrete financeiro:          "billing:reminder:<tenantId>"
//
// IMPORTANTE:
// - BullMQ exige jobId estável para identificar o mesmo job repetível.
// - O cron é responsabilidade da camada superior; aqui apenas aplicamos.

const { reportsQueue, whatsappQueue } = require('../queues');

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[schedulerService]', ...args);
}

/**
 * scheduleRecurringReport
 *
 * Agenda um relatório recorrente para um tenant, usando a fila "reports-generation".
 *
 * @param {string} tenantId
 * @param {string} cron   - expressão cron (ex: "0 9 * * 1" -> seg às 09:00)
 * @param {object} payload - payload adicional para o job de geração de relatório:
 *   - name?: string
 *   - type?: string
 *   - rangeDays?: number
 *   - rangeFrom?: string
 *   - rangeTo?: string
 *   - params?: object
 *   - reportId?: string   (opcional, para sempre atualizar o mesmo Report)
 *   - slug?: string       (opcional, para diferenciar configs)
 */
async function scheduleRecurringReport(tenantId, cron, payload = {}) {
  if (!tenantId) throw new Error('tenantId é obrigatório em scheduleRecurringReport');
  if (!cron) throw new Error('cron é obrigatório em scheduleRecurringReport');

  const slug = payload.slug || 'default';
  const jobId = `report:custom:${tenantId}:${slug}`;

  const data = {
    tenantId,
    payload: {
      ...payload,
      tenantId,
    },
  };

  safeLog('Agendando relatório recorrente', { tenantId, cron, jobId });

  await reportsQueue.add('tenant-recurring-report', data, {
    jobId,
    repeat: { cron },
    removeOnComplete: true,
    removeOnFail: false,
  });

  return { jobId, cron };
}

/**
 * cancelRecurringReport
 *
 * Cancela um relatório recorrente para um tenant com base no slug.
 * IMPORTANTE:
 *  - Remove o repeatable job (agenda) e também jobs pendentes com o mesmo jobId.
 */
async function cancelRecurringReport(tenantId, slug = 'default') {
  if (!tenantId) throw new Error('tenantId é obrigatório em cancelRecurringReport');

  const jobId = `report:custom:${tenantId}:${slug}`;
  safeLog('Cancelando relatório recorrente', { tenantId, jobId });

  try {
    // Remove repeatable jobs cuja id seja o jobId configurado
    const repeatableJobs = await reportsQueue.getRepeatableJobs();
    const targets = repeatableJobs.filter(
      (job) => job.id === jobId || (job.key && job.key.includes(jobId)),
    );

    await Promise.all(
      targets.map((job) => reportsQueue.removeRepeatableByKey(job.key)),
    );
  } catch (err) {
    safeLog(
      'Erro ao remover repeatable job de relatório',
      err && err.message ? err.message : err,
    );
  }

  // Também remove jobs pendentes com esse jobId (limpeza adicional)
  try {
    await reportsQueue.removeJobs(jobId);
  } catch (err) {
    safeLog(
      'Erro ao remover jobs pendentes de relatório',
      err && err.message ? err.message : err,
    );
  }

  return { jobId };
}

/**
 * scheduleApprovalReminders
 *
 * Agenda lembretes recorrentes de aprovação via WhatsApp para um tenant.
 *
 * @param {string} tenantId
 * @param {string} cron
 * @param {object} payload - será enviado como payload para o job de WhatsApp:
 *   - clientId?: string
 *   - to?: string
 *   - type?: string (ex: 'post_pending')
 *   - vars?: object
 */
async function scheduleApprovalReminders(tenantId, cron, payload = {}) {
  if (!tenantId) throw new Error('tenantId é obrigatório em scheduleApprovalReminders');
  if (!cron) throw new Error('cron é obrigatório em scheduleApprovalReminders');

  const jobId = `approval:reminder:${tenantId}`;

  const data = {
    tenantId,
    payload: {
      type: payload.type || 'post_pending',
      ...payload,
      tenantId,
    },
  };

  safeLog('Agendando lembretes de aprovação', { tenantId, cron, jobId });

  await whatsappQueue.add('tenant-approval-reminder', data, {
    jobId,
    repeat: { cron },
    removeOnComplete: true,
    removeOnFail: false,
  });

  return { jobId, cron };
}

/**
 * cancelApprovalReminders
 *
 * Cancela lembretes de aprovação recorrentes para um tenant.
 * IMPORTANTE:
 *  - Remove o repeatable job (agenda) e também jobs pendentes com o mesmo jobId.
 */
async function cancelApprovalReminders(tenantId) {
  if (!tenantId) throw new Error('tenantId é obrigatório em cancelApprovalReminders');

  const jobId = `approval:reminder:${tenantId}`;
  safeLog('Cancelando lembretes de aprovação', { tenantId, jobId });

  try {
    const repeatableJobs = await whatsappQueue.getRepeatableJobs();
    const targets = repeatableJobs.filter(
      (job) => job.id === jobId || (job.key && job.key.includes(jobId)),
    );

    await Promise.all(
      targets.map((job) => whatsappQueue.removeRepeatableByKey(job.key)),
    );
  } catch (err) {
    safeLog(
      'Erro ao remover repeatable job de lembrete de aprovação',
      err && err.message ? err.message : err,
    );
  }

  try {
    await whatsappQueue.removeJobs(jobId);
  } catch (err) {
    safeLog(
      'Erro ao remover jobs pendentes de lembrete de aprovação',
      err && err.message ? err.message : err,
    );
  }

  return { jobId };
}

module.exports = {
  scheduleRecurringReport,
  cancelRecurringReport,
  scheduleApprovalReminders,
  cancelApprovalReminders,
};
