// api/src/services/automationSettingsService.js
// Serviço de configuração de automações por tenant.
// Usa:
//  - Tenant.settings (Json) para persistir configs
//  - schedulerService para criar/remover jobs recorrentes (BullMQ)
//
// Estrutura esperada dentro de Tenant.settings:
//
// settings = {
//   ...,
//   automation: {
//     reports: {
//       enabled: boolean,
//       cron: string,       // ex: "0 9 * * 1" (segunda às 09h)
//       slug: string,       // identificar qual job (default: "default")
//       rangeDays: number,  // quantos dias para trás considerar (default: 30)
//     },
//     approvals: {
//       enabled: boolean,
//       cron: string,       // ex: "0 10 * * *" (todo dia às 10h)
//       to: string | null,  // override do telefone; senão usa dado do client
//     }
//   }
// }

const { prisma } = require('../prisma');
const {
  scheduleRecurringReport,
  cancelRecurringReport,
  scheduleApprovalReminders,
  cancelApprovalReminders,
} = require('./schedulerService');

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[automationSettingsService]', ...args);
}

function ensureSettings(obj) {
  if (!obj || typeof obj !== 'object') return {};
  return obj;
}

function ensureAutomation(obj) {
  const base = ensureSettings(obj);
  if (!base.automation || typeof base.automation !== 'object') {
    base.automation = {};
  }
  if (!base.automation.reports || typeof base.automation.reports !== 'object') {
    base.automation.reports = {};
  }
  if (!base.automation.approvals || typeof base.automation.approvals !== 'object') {
    base.automation.approvals = {};
  }
  return base;
}

function buildValidationError(details) {
  const err = new Error('Dados inválidos para automação');
  err.statusCode = 400;
  err.details = details;
  return err;
}

/**
 * getAutomationSettings(tenantId)
 * Retorna apenas o pedaço relevante de automação.
 */
async function getAutomationSettings(tenantId) {
  if (!tenantId) throw new Error('tenantId é obrigatório em getAutomationSettings');

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      settings: true,
    },
  });

  const base = ensureSettings(tenant && tenant.settings);
  const settings = ensureAutomation(base);

  return {
    reports: {
      enabled: !!settings.automation.reports.enabled,
      cron: settings.automation.reports.cron || null,
      slug: settings.automation.reports.slug || 'default',
      rangeDays:
        typeof settings.automation.reports.rangeDays === 'number'
          ? settings.automation.reports.rangeDays
          : 30,
    },
    approvals: {
      enabled: !!settings.automation.approvals.enabled,
      cron: settings.automation.approvals.cron || null,
      to: settings.automation.approvals.to || null,
    },
  };
}

/**
 * updateAutomationSettings(tenantId, payload)
 *
 * payload: {
 *   reports?: {
 *     enabled?: boolean,
 *     cron?: string,
 *     slug?: string,
 *     rangeDays?: number
 *   },
 *   approvals?: {
 *     enabled?: boolean,
 *     cron?: string,
 *     to?: string
 *   }
 * }
 *
 * Efeitos colaterais:
 *  - Atualiza Tenant.settings.automation
 *  - Cria/atualiza/remove jobs recorrentes no schedulerService
 */
async function updateAutomationSettings(tenantId, payload = {}) {
  if (!tenantId) throw new Error('tenantId é obrigatório em updateAutomationSettings');

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      settings: true,
    },
  });

  if (!tenant) {
    throw new Error('Tenant não encontrado');
  }

  const base = ensureAutomation(tenant.settings || {});
  const next = { ...base };

  const validationErrors = [];

  // --- Atualiza parte de relatórios ---
  if (payload.reports) {
    const prev = next.automation.reports || {};
    const merged = {
      ...prev,
      ...payload.reports,
    };

    // Normaliza valores
    if (merged.enabled === undefined) merged.enabled = !!prev.enabled;

    if (!merged.slug) {
      merged.slug = prev.slug || 'default';
    }

    if (
      merged.rangeDays === undefined
      || Number.isNaN(Number(merged.rangeDays))
    ) {
      merged.rangeDays =
        typeof prev.rangeDays === 'number' ? prev.rangeDays : 30;
    } else {
      merged.rangeDays = Number(merged.rangeDays);
    }

    // Validações básicas de reports
    if (typeof merged.enabled !== 'boolean') {
      validationErrors.push('reports.enabled deve ser boolean');
    }

    if (typeof merged.slug !== 'string' || !merged.slug.trim()) {
      validationErrors.push('reports.slug deve ser uma string não vazia');
    }

    if (
      typeof merged.rangeDays !== 'number'
      || !Number.isFinite(merged.rangeDays)
      || merged.rangeDays <= 0
    ) {
      validationErrors.push('reports.rangeDays deve ser um número maior que zero');
    }

    if (merged.enabled) {
      if (typeof merged.cron !== 'string' || !merged.cron.trim()) {
        validationErrors.push('reports.cron é obrigatório e deve ser uma string não vazia quando reports.enabled = true');
      }
    } else if (
      merged.cron !== undefined
      && (typeof merged.cron !== 'string' || !merged.cron.trim())
    ) {
      validationErrors.push('reports.cron, se informado, deve ser uma string não vazia');
    }

    next.automation.reports = merged;
  }

  // --- Atualiza parte de approvals (lembretes) ---
  if (payload.approvals) {
    const prev = next.automation.approvals || {};
    const merged = {
      ...prev,
      ...payload.approvals,
    };

    if (merged.enabled === undefined) merged.enabled = !!prev.enabled;

    // Validações básicas de approvals
    if (typeof merged.enabled !== 'boolean') {
      validationErrors.push('approvals.enabled deve ser boolean');
    }

    if (
      merged.cron !== undefined
      && (typeof merged.cron !== 'string' || !merged.cron.trim())
    ) {
      validationErrors.push('approvals.cron, se informado, deve ser uma string não vazia');
    }

    if (
      merged.to !== undefined
      && (typeof merged.to !== 'string' || !merged.to.trim())
    ) {
      validationErrors.push('approvals.to, se informado, deve ser uma string não vazia');
    }

    if (merged.enabled) {
      if (typeof merged.cron !== 'string' || !merged.cron.trim()) {
        validationErrors.push('approvals.cron é obrigatório e deve ser uma string não vazia quando approvals.enabled = true');
      }
      if (typeof merged.to !== 'string' || !merged.to.trim()) {
        validationErrors.push('approvals.to é obrigatório e deve ser uma string não vazia quando approvals.enabled = true');
      }
    }

    next.automation.approvals = merged;
  }

  if (validationErrors.length > 0) {
    throw buildValidationError(validationErrors);
  }

  // Persiste settings completos no tenant
  const updatedTenant = await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      settings: next,
    },
    select: {
      id: true,
      settings: true,
    },
  });

  // Sincroniza agendamentos com base nos settings finais
  const finalAutomation = ensureAutomation(updatedTenant.settings).automation;

  // Relatórios recorrentes
  const r = finalAutomation.reports || {};
  if (r.enabled && r.cron) {
    try {
      await scheduleRecurringReport(tenantId, r.cron, {
        slug: r.slug || 'default',
        rangeDays:
          typeof r.rangeDays === 'number'
            ? r.rangeDays
            : 30,
        name: r.name || 'Relatório automático',
        type: r.type || 'scheduled',
      });
    } catch (err) {
      safeLog(
        'Falha ao agendar relatório recorrente',
        err && err.message ? err.message : err,
      );
    }
  } else {
    try {
      await cancelRecurringReport(tenantId, r.slug || 'default');
    } catch (err) {
      safeLog(
        'Falha ao cancelar relatório recorrente',
        err && err.message ? err.message : err,
      );
    }
  }

  // Lembretes de aprovação
  const a = finalAutomation.approvals || {};
  if (a.enabled && a.cron) {
    try {
      await scheduleApprovalReminders(tenantId, a.cron, {
        to: a.to || null,
        type: 'post_pending',
      });
    } catch (err) {
      safeLog(
        'Falha ao agendar lembretes de aprovação',
        err && err.message ? err.message : err,
      );
    }
  } else {
    try {
      await cancelApprovalReminders(tenantId);
    } catch (err) {
      safeLog(
        'Falha ao cancelar lembretes de aprovação',
        err && err.message ? err.message : err,
      );
    }
  }

  return getAutomationSettings(tenantId);
}

module.exports = {
  getAutomationSettings,
  updateAutomationSettings,
};
