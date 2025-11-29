// api/src/jobs/automationWhatsAppJob.js
// Job/Worker para processar automações via WhatsApp.
// - Consome JobQueue com type = 'automation_whatsapp' e status = 'queued'
// - Faz claim condicional (updateMany) para evitar race
// - Suporta payloads típicos:
//   { type: 'post_pending'|'post_approved'|'payment_reminder'|'campaign_status', to, vars, referenceId, clientId? }
// - Usa services/whatsappProvider.js (espera função send(tenantId, to, message, opts))
// - Atualiza JobQueue com status done/failed e implementa retry/backoff básico.
//
// IMPORTANTE:
// - ESTE MÓDULO NÃO TEM MAIS LOOP start/stop COM setTimeout.
// - O agendamento periódico é feito pelo worker BullMQ (repeatable jobs).
// - Aqui expomos apenas pollOnce(), para ser chamado pelo Worker.
//
// Configs via env:
// - WORKER_MAX_ATTEMPTS             -> nº máximo de tentativas antes de marcar como failed (default: 5)
// - WHATSAPP_BACKOFF_MS (opcional)  -> backoff fixo entre tentativas (default: exponencial até 1min)

const { prisma } = require('../prisma');

const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS) || 5;
const BACKOFF_MS_OVERRIDE = process.env.WHATSAPP_BACKOFF_MS
  ? Number(process.env.WHATSAPP_BACKOFF_MS)
  : null;

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[automationWhatsAppJob]', ...args);
}

// Lazy require do provider
function getWhatsappProvider() {
  try {
    // eslint-disable-next-line global-require
    const provider = require('../services/whatsappProvider');
    if (!provider || typeof provider.send !== 'function') {
      safeLog('whatsappProvider encontrado, mas sem método send');
      return null;
    }
    return provider;
  } catch (err) {
    safeLog(
      'whatsappProvider não disponível, pulando envio',
      err && err.message ? err.message : err,
    );
    return null;
  }
}

/**
 * renderMessage(entry)
 * - Usa message pronto se vier no payload, senão monta um texto simples por tipo.
 */
function renderMessage(entry) {
  const payload = entry.payload || {};
  const type = payload.type || 'generic';

  if (payload.message && typeof payload.message === 'string') {
    return payload.message;
  }

  const vars = payload.vars || {};

  if (type === 'post_pending') {
    return (
      vars.custom ||
      `Você tem um novo conteúdo aguardando aprovação no portal da sua agência.` +
        (vars.postTitle ? ` Título: "${vars.postTitle}".` : '')
    );
  }

  if (type === 'post_approved') {
    return (
      vars.custom ||
      `Seu conteúdo foi aprovado e será publicado em breve.` +
        (vars.postTitle ? ` Título: "${vars.postTitle}".` : '')
    );
  }

  if (type === 'payment_reminder') {
    return (
      vars.custom ||
      `Lembrete: existe um pagamento pendente com a sua agência de marketing.` +
        (vars.dueDate ? ` Vencimento: ${vars.dueDate}.` : '')
    );
  }

  if (type === 'campaign_status') {
    return (
      vars.custom ||
      `Atualização da sua campanha: ${vars.status || 'status atualizado'}.`
    );
  }

  // default genérico
  return vars.custom || 'Você recebeu uma nova notificação da sua agência.';
}

/**
 * calculaBackoffMs
 * - Usa override WHATSAPP_BACKOFF_MS se existir; senão backoff exponencial limitado.
 */
function calculaBackoffMs(attempts) {
  if (BACKOFF_MS_OVERRIDE && !Number.isNaN(BACKOFF_MS_OVERRIDE)) {
    return BACKOFF_MS_OVERRIDE;
  }
  const base = 5000; // 5s
  const max = 60000; // 1min
  const backoff = base * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(backoff, max);
}

/**
 * findAndClaim()
 * - busca uma JobQueue entry para type='automation_whatsapp' e status='queued'
 *   cujo runAt seja null ou <= now.
 * - tenta fazer claim via updateMany condicional (id + status='queued')
 */
async function findAndClaim() {
  const now = new Date();
  const candidate = await prisma.jobQueue.findFirst({
    where: {
      type: 'automation_whatsapp',
      status: 'queued',
      OR: [{ runAt: null }, { runAt: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!candidate) return null;

  // tenta claim
  const claimed = await prisma.jobQueue.updateMany({
    where: { id: candidate.id, status: 'queued' },
    data: {
      status: 'processing',
      updatedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    // alguém mais claimou
    return null;
  }

  // re-fetch com attempts atualizados
  const entry = await prisma.jobQueue.findUnique({ where: { id: candidate.id } });
  return entry || null;
}

/**
 * processEntry(entry)
 * - Resolve tenant, checa opt-in (se clientId vier no payload),
 *   renderiza mensagem, chama whatsappProvider.send e aplica retry/backoff.
 */
async function processEntry(entry) {
  if (!entry) return false;

  const provider = getWhatsappProvider();
  if (!provider) {
    safeLog('whatsappProvider indisponível; marcando job como failed');
    await prisma.jobQueue.update({
      where: { id: entry.id },
      data: {
        status: 'failed',
        updatedAt: new Date(),
        result: {
          error: 'whatsappProvider indisponível',
        },
      },
    });
    return false;
  }

  const payload = entry.payload || {};
  const tenantId = entry.tenantId || payload.tenantId || null;
  const to = payload.to || null;

  if (!to) {
    safeLog('Job sem "to"; marcando como failed', entry.id);
    await prisma.jobQueue.update({
      where: { id: entry.id },
      data: {
        status: 'failed',
        updatedAt: new Date(),
        result: {
          error: 'Parâmetro "to" ausente no payload do job',
        },
      },
    });
    return false;
  }

  // Checa opt-in se vier clientId
  if (payload.clientId) {
    try {
      const client = await prisma.client.findFirst({
        where: {
          id: payload.clientId,
          ...(tenantId ? { tenantId } : {}),
        },
      });

      if (!client) {
        safeLog('Client não encontrado para job WhatsApp', {
          jobId: entry.id,
          clientId: payload.clientId,
        });
        await prisma.jobQueue.update({
          where: { id: entry.id },
          data: {
            status: 'failed',
            updatedAt: new Date(),
            result: {
              error: 'Client não encontrado para envio de WhatsApp',
              clientId: payload.clientId,
            },
          },
        });
        return false;
      }

      if (client.whatsappOptIn !== true) {
        safeLog('Client sem opt-in de WhatsApp; marcando job como done/skipped', {
          jobId: entry.id,
          clientId: client.id,
        });
        await prisma.jobQueue.update({
          where: { id: entry.id },
          data: {
            status: 'done', // concluído, mas sem envio
            updatedAt: new Date(),
            result: {
              skipped: true,
              reason: 'client_whatsapp_opt_out',
              clientId: client.id,
            },
          },
        });
        return true;
      }
    } catch (err) {
      safeLog(
        'Erro ao buscar client para checar opt-in',
        err && err.message ? err.message : err,
      );
      // Não aborta o job; segue com o envio, mas registra no result
    }
  }

  const message = renderMessage(entry);

  try {
    const sendResult = await provider.send(tenantId, to, message, {
      meta: {
        jobId: entry.id,
        type: payload.type || 'generic',
        referenceId: payload.referenceId || null,
      },
    });

    const attempts = entry.attempts || 1;

    if (!sendResult || !sendResult.ok) {
      const now = new Date();
      const maxAttempts = MAX_ATTEMPTS;
      const backoffMs = calculaBackoffMs(attempts);
      const nextRunAt = new Date(Date.now() + backoffMs);

      if (attempts < maxAttempts) {
        safeLog('Envio WhatsApp falhou; requeue com backoff', {
          jobId: entry.id,
          attempts,
          maxAttempts,
          backoffMs,
        });

        await prisma.jobQueue.update({
          where: { id: entry.id },
          data: {
            status: 'queued',
            runAt: nextRunAt,
            updatedAt: now,
            result: {
              ...(entry.result || {}),
              lastError: sendResult && sendResult.error
                ? sendResult.error
                : 'Falha ao enviar WhatsApp',
              attempts,
            },
          },
        });

        return false;
      }

      // ultrapassou maxAttempts -> failed definitivo
      safeLog('Envio WhatsApp falhou; maxAttempts atingido, marcando como failed', {
        jobId: entry.id,
        attempts,
        maxAttempts,
      });

      await prisma.jobQueue.update({
        where: { id: entry.id },
        data: {
          status: 'failed',
          runAt: null,
          updatedAt: now,
          result: {
            ...(entry.result || {}),
            lastError: sendResult && sendResult.error
              ? sendResult.error
              : 'Falha ao enviar WhatsApp (maxAttempts atingido)',
            attempts,
          },
        },
      });

      return false;
    }

    // sucesso 🎉
    await prisma.jobQueue.update({
      where: { id: entry.id },
      data: {
        status: 'done',
        updatedAt: new Date(),
        result: {
          ...(entry.result || {}),
          success: true,
          attempts: entry.attempts || 1,
          providerStatus: sendResult.status || null,
        },
      },
    });

    safeLog('Mensagem WhatsApp enviada com sucesso', {
      jobId: entry.id,
      to,
      attempts: entry.attempts || 1,
    });

    return true;
  } catch (err) {
    const attempts = entry.attempts || 1;
    const now = new Date();
    const maxAttempts = MAX_ATTEMPTS;
    const backoffMs = calculaBackoffMs(attempts);
    const nextRunAt = new Date(Date.now() + backoffMs);
    const msg = err && err.message ? err.message : String(err);

    if (attempts < maxAttempts) {
      safeLog('Erro inesperado no envio WhatsApp; requeue com backoff', {
        jobId: entry.id,
        attempts,
        maxAttempts,
        backoffMs,
        error: msg,
      });

      await prisma.jobQueue.update({
        where: { id: entry.id },
        data: {
          status: 'queued',
          runAt: nextRunAt,
          updatedAt: now,
          result: {
            ...(entry.result || {}),
            lastError: msg,
            attempts,
          },
        },
      });

      return false;
    }

    safeLog('Erro inesperado no envio WhatsApp; maxAttempts atingido, marcando como failed', {
      jobId: entry.id,
      attempts,
      maxAttempts,
      error: msg,
    });

    await prisma.jobQueue.update({
      where: { id: entry.id },
      data: {
        status: 'failed',
        runAt: null,
        updatedAt: now,
        result: {
          ...(entry.result || {}),
          lastError: msg,
          attempts,
        },
      },
    });

    return false;
  }
}

/**
 * pollOnce
 * - tenta claim e processar 1 job por chamada.
 */
async function pollOnce() {
  const entry = await findAndClaim();
  if (!entry) {
    return false;
  }
  return processEntry(entry);
}

module.exports = {
  pollOnce,
  // internals for debug/test
  _findAndClaim: findAndClaim,
  _processEntry: processEntry,
};
