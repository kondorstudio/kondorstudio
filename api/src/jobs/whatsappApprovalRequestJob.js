// api/src/jobs/whatsappApprovalRequestJob.js
// Processa job BullMQ "whatsapp_send_approval_request"
const { prisma } = require('../prisma');
const whatsappCloud = require('../services/whatsappCloud');

async function logJob(status, data = {}) {
  try {
    await prisma.jobLog.create({
      data: {
        queue: 'whatsapp-automation',
        jobId: data.jobId ? String(data.jobId) : null,
        status,
        attempts: data.attempts || null,
        tenantId: data.tenantId || null,
        error: data.error || null,
      },
    });
  } catch (err) {
    // logging best-effort
  }
}

async function processApprovalRequestJob(payload = {}, jobMeta = {}) {
  const { tenantId, postId, clientId, approvalId } = payload;
  if (!tenantId || !postId || !clientId || !approvalId) {
    throw new Error('Parâmetros obrigatórios ausentes no job de aprovação via WhatsApp');
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId },
    include: { client: true },
  });

  if (!post || !post.client || post.client.id !== clientId) {
    throw new Error('Post ou cliente não encontrado para este tenant');
  }

  if (post.whatsappSentAt && post.whatsappMessageId) {
    await logJob('COMPLETED', {
      jobId: jobMeta.jobId,
      tenantId,
      attempts: jobMeta.attemptsMade || null,
      error: null,
    });
    return {
      ok: true,
      skipped: true,
      reason: 'already_sent',
      postId,
      messageId: post.whatsappMessageId || null,
    };
  }

  const client = post.client;
  if (!client.whatsappOptIn || !client.whatsappNumberE164) {
    await logJob('COMPLETED', {
      jobId: jobMeta.jobId,
      tenantId,
      attempts: jobMeta.attemptsMade || null,
      error: 'client_whatsapp_unavailable',
    });
    return {
      ok: false,
      skipped: true,
      reason: 'client_whatsapp_unavailable',
      postId,
    };
  }

  const sendResult = await whatsappCloud.sendApprovalRequest({
    tenantId,
    postId,
  });

  await logJob('COMPLETED', {
    jobId: jobMeta.jobId,
    tenantId,
    attempts: jobMeta.attemptsMade || null,
  });

  return {
    ok: true,
    postId,
    waMessageId: sendResult?.waMessageId || null,
    mode: sendResult?.mode || null,
    fallbackUsed: Boolean(sendResult?.fallbackUsed),
  };
}

module.exports = {
  processApprovalRequestJob,
};
