const crypto = require('crypto');
const express = require('express');

const { prisma } = require('../../prisma');
const whatsappCloud = require('../../services/whatsappCloud');
const whatsappRuntime = require('../../services/whatsappRuntimeService');

const router = express.Router();

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeDecisionText(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function shouldRequireSignature() {
  return process.env.WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED === 'true';
}

function verifyMetaSignature(req) {
  if (!shouldRequireSignature()) return true;

  const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || null;
  if (!appSecret) return false;

  const header = req.headers['x-hub-signature-256'];
  const rawBody = req.rawBody;
  if (!header || !rawBody) return false;

  const expectedHash = crypto
    .createHmac('sha256', String(appSecret))
    .update(String(rawBody))
    .digest('hex');
  const expected = `sha256=${expectedHash}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(String(header)), Buffer.from(expected));
  } catch {
    return false;
  }
}

function parseTextDecision(text) {
  const normalized = normalizeDecisionText(text);
  if (!normalized) return null;

  const approveRegex = /^(OK|APROVAR|APROVADO|CONFIRMO|PODE APROVAR)$/;
  const changesRegex = /^(PEDIR CORRECAO|CORRECAO|CORRIGIR|AJUSTE|AJUSTAR|ALTERAR)$/;
  const rejectRegex = /^(RECUSAR|REJEITAR|REPROVAR|NAO APROVAR|NAO APROVO)$/;

  if (approveRegex.test(normalized)) return whatsappCloud.APPROVAL_ACTION_IDS.APPROVE;
  if (changesRegex.test(normalized)) return whatsappCloud.APPROVAL_ACTION_IDS.REQUEST_CHANGES;
  if (rejectRegex.test(normalized)) return whatsappCloud.APPROVAL_ACTION_IDS.REJECT;
  return null;
}

function extractIncomingMessages(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  const events = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value || !Array.isArray(value.messages) || !value.messages.length) continue;
      for (const message of value.messages) {
        events.push({
          value,
          message,
        });
      }
    }
  }

  return events;
}

async function touchIntegrationsFromPayload(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const phoneNumberId = change?.value?.metadata?.phone_number_id
        ? String(change.value.metadata.phone_number_id)
        : null;
      if (!phoneNumberId) continue;
      const integration = await whatsappRuntime.resolveIntegrationByPhoneNumberId(phoneNumberId);
      if (integration?.id) {
        await whatsappRuntime.touchIntegrationLastWebhookAt(integration.id);
      }
    }
  }
}

function extractMessageText(message) {
  if (!message) return null;
  if (message.type === 'text') return normalizeText(message?.text?.body) || null;
  if (message.type === 'button') return normalizeText(message?.button?.text) || null;
  if (message?.interactive?.button_reply?.title) {
    return normalizeText(message.interactive.button_reply.title) || null;
  }
  return null;
}

function parseMessageDecision(message) {
  const interactiveId =
    message?.interactive?.button_reply?.id ||
    message?.button?.payload ||
    null;
  if (interactiveId) {
    const parsed = whatsappCloud.parseActionId(interactiveId);
    if (parsed) return { action: parsed.action, approvalId: parsed.approvalId, source: 'WHATSAPP_BUTTON' };
  }

  const textBody = extractMessageText(message);
  const textAction = parseTextDecision(textBody);
  if (!textAction) return null;
  return { action: textAction, approvalId: null, source: 'WHATSAPP_TEXT' };
}

function resolveApprovedPostStatus(post) {
  if (!post) return 'APPROVED';
  if (post.scheduledDate) return 'SCHEDULED';
  return 'APPROVED';
}

function mergePostMetadata(post, patch = {}) {
  const base = isPlainObject(post?.metadata) ? { ...post.metadata } : {};
  const currentWa = isPlainObject(base.whatsappApproval) ? { ...base.whatsappApproval } : {};
  const nextWa = { ...currentWa, ...patch };

  if (patch.pendingInput === null) {
    delete nextWa.pendingInput;
  }
  if (patch.interactiveError === undefined && Object.prototype.hasOwnProperty.call(nextWa, 'interactiveError')) {
    delete nextWa.interactiveError;
  }

  base.whatsappApproval = nextWa;
  return base;
}

async function resolveApprovalContext({
  tenantId,
  clientId,
  approvalIdHint = null,
  contextMessageId = null,
}) {
  if (!tenantId) return null;

  if (approvalIdHint) {
    const approval = await prisma.approval.findFirst({
      where: { id: approvalIdHint, tenantId },
      include: {
        post: true,
      },
    });
    if (approval) return approval;
  }

  if (contextMessageId) {
    const post = await prisma.post.findFirst({
      where: { tenantId, whatsappMessageId: String(contextMessageId) },
      select: { id: true },
    });
    if (post) {
      const approvalFromContext = await prisma.approval.findFirst({
        where: { tenantId, postId: post.id, status: 'PENDING' },
        include: { post: true },
        orderBy: { createdAt: 'desc' },
      });
      if (approvalFromContext) return approvalFromContext;
    }
  }

  if (clientId) {
    return prisma.approval.findFirst({
      where: {
        tenantId,
        status: 'PENDING',
        post: {
          clientId,
        },
      },
      include: { post: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  return null;
}

async function resolvePendingConversationPost(tenantId, clientId) {
  if (!tenantId || !clientId) return null;

  const posts = await prisma.post.findMany({
    where: {
      tenantId,
      clientId,
    },
    select: {
      id: true,
      status: true,
      metadata: true,
      version: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  for (const post of posts) {
    const waApproval = post?.metadata?.whatsappApproval;
    if (!isPlainObject(waApproval)) continue;
    if (isPlainObject(waApproval.pendingInput)) return post;
  }

  return null;
}

async function sendPromptMessage({
  tenantId,
  phoneNumberId,
  toE164,
  text,
  contextMessageId = null,
  postId = null,
}) {
  if (!tenantId || !phoneNumberId || !toE164 || !text) return null;
  try {
    const integration = await whatsappCloud.getAgencyWhatsAppIntegration(tenantId);
    if (!integration || integration.incomplete || !integration.accessToken) return null;
    return whatsappCloud.sendTextMessage({
      phoneNumberId,
      accessToken: integration.accessToken,
      toE164,
      text,
      contextMessageId,
      tenantId,
      postId,
    });
  } catch {
    return null;
  }
}

async function registerReportDeliveryInteraction({
  tenantId,
  clientId = null,
  fromE164,
  waMessageId,
  contextMessageId = null,
  textBody,
  rawPayload,
}) {
  if (!tenantId || !textBody) return null;
  const normalizedFrom = whatsappRuntime.normalizeE164(fromE164);
  if (!normalizedFrom) return null;

  const where = {
    tenantId,
    channel: 'WHATSAPP',
    status: 'SENT',
  };
  if (clientId) where.brandId = clientId;

  const deliveries = await prisma.reportDelivery.findMany({
    where,
    orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
    take: 20,
  });
  if (!deliveries.length) return null;

  let target =
    deliveries.find((delivery) => {
      const provider = isPlainObject(delivery.providerResult) ? delivery.providerResult : {};
      return contextMessageId && provider.waMessageId === String(contextMessageId);
    }) ||
    deliveries.find((delivery) => whatsappRuntime.normalizeE164(delivery.to) === normalizedFrom) ||
    null;
  if (!target) return null;

  const payload = isPlainObject(target.payload) ? { ...target.payload } : {};
  const interactions = Array.isArray(payload.interactions) ? [...payload.interactions] : [];

  if (waMessageId && interactions.some((item) => item?.waMessageId === waMessageId)) {
    return { deliveryId: target.id, duplicate: true };
  }

  interactions.push({
    waMessageId: waMessageId || null,
    fromE164: normalizedFrom,
    text: textBody,
    at: new Date().toISOString(),
  });

  const providerResult = isPlainObject(target.providerResult) ? { ...target.providerResult } : {};
  const responses = Array.isArray(providerResult.responses) ? [...providerResult.responses] : [];
  responses.push({
    waMessageId: waMessageId || null,
    text: textBody,
    at: new Date().toISOString(),
  });

  await prisma.reportDelivery.update({
    where: { id: target.id },
    data: {
      payload: {
        ...payload,
        interactions,
      },
      providerResult: {
        ...providerResult,
        responses,
        lastClientReply: {
          waMessageId: waMessageId || null,
          at: new Date().toISOString(),
          text: textBody,
          fromE164: normalizedFrom,
          contextMessageId: contextMessageId || null,
        },
        lastInboundPayload: rawPayload || null,
      },
    },
  });

  return { deliveryId: target.id, duplicate: false };
}

async function applyApprovalDecision({
  tenantId,
  fromE164,
  phoneNumberId,
  message,
  decision,
  client,
}) {
  const contextMessageId = message?.context?.id || null;
  const approval = await resolveApprovalContext({
    tenantId,
    clientId: client?.id || null,
    approvalIdHint: decision?.approvalId || null,
    contextMessageId,
  });
  if (!approval || !approval.post) {
    return { handled: false, reason: 'approval_not_found' };
  }

  const post = approval.post;
  const now = new Date();

  if (decision.action === whatsappCloud.APPROVAL_ACTION_IDS.APPROVE) {
    if (approval.status !== 'PENDING' && approval.status !== 'APPROVED') {
      return { handled: true, skipped: true, reason: 'approval_not_pending', postId: post.id };
    }
    if (approval.status === 'APPROVED') {
      return { handled: true, skipped: true, reason: 'already_approved', postId: post.id };
    }

    const approvedStatus = resolveApprovedPostStatus(post);
    const nextMetadata = mergePostMetadata(post, {
      approvalId: approval.id,
      pendingInput: null,
      lastDecision: 'APPROVED',
      lastDecisionAt: now.toISOString(),
      lastDecisionSource: decision.source,
    });
    nextMetadata.workflowStatus = approvedStatus === 'SCHEDULED' ? 'SCHEDULED' : 'SCHEDULING';

    await prisma.$transaction([
      prisma.approval.update({
        where: { id: approval.id },
        data: {
          status: 'APPROVED',
          postVersion: Number(post.version || approval.postVersion || 1),
          resolvedAt: now,
          resolvedSource: decision.source,
          resolvedByPhone: fromE164 || null,
        },
      }),
      prisma.post.update({
        where: { id: post.id },
        data: {
          status: approvedStatus,
          metadata: nextMetadata,
        },
      }),
    ]);

    await whatsappRuntime.appendAuditLog({
      tenantId,
      action: 'post.approval.approved.whatsapp',
      resource: 'approval',
      resourceId: approval.id,
      meta: {
        postId: post.id,
        source: decision.source,
        fromE164,
      },
    });

    await sendPromptMessage({
      tenantId,
      phoneNumberId,
      toE164: fromE164,
      text: 'Aprovacao registrada com sucesso. Obrigado!',
      contextMessageId: message?.id || null,
      postId: post.id,
    });

    return { handled: true, postId: post.id, approvalId: approval.id, status: 'APPROVED' };
  }

  if (decision.action === whatsappCloud.APPROVAL_ACTION_IDS.REQUEST_CHANGES) {
    if (approval.status !== 'PENDING') {
      return { handled: true, skipped: true, reason: 'approval_not_pending', postId: post.id };
    }
    const nextMetadata = mergePostMetadata(post, {
      approvalId: approval.id,
      pendingInput: {
        type: 'CHANGES_FEEDBACK',
        approvalId: approval.id,
        requestedAt: now.toISOString(),
      },
      lastDecision: 'REQUEST_CHANGES',
      lastDecisionAt: now.toISOString(),
      lastDecisionSource: decision.source,
    });

    await prisma.post.update({
      where: { id: post.id },
      data: {
        metadata: nextMetadata,
      },
    });

    await whatsappRuntime.appendAuditLog({
      tenantId,
      action: 'post.approval.request_changes.whatsapp',
      resource: 'approval',
      resourceId: approval.id,
      meta: {
        postId: post.id,
        source: decision.source,
        fromE164,
      },
    });

    await sendPromptMessage({
      tenantId,
      phoneNumberId,
      toE164: fromE164,
      text: 'Perfeito! Me diga o que voce quer ajustar.',
      contextMessageId: message?.id || null,
      postId: post.id,
    });

    return { handled: true, postId: post.id, approvalId: approval.id, status: 'WAITING_FEEDBACK' };
  }

  if (decision.action === whatsappCloud.APPROVAL_ACTION_IDS.REJECT) {
    if (approval.status !== 'PENDING') {
      return { handled: true, skipped: true, reason: 'approval_not_pending', postId: post.id };
    }
    const nextMetadata = mergePostMetadata(post, {
      approvalId: approval.id,
      pendingInput: {
        type: 'REJECTION_REASON',
        approvalId: approval.id,
        requestedAt: now.toISOString(),
      },
      lastDecision: 'REJECTED',
      lastDecisionAt: now.toISOString(),
      lastDecisionSource: decision.source,
    });
    nextMetadata.workflowStatus = 'DONE';

    await prisma.$transaction([
      prisma.approval.update({
        where: { id: approval.id },
        data: {
          status: 'REJECTED',
          postVersion: Number(post.version || approval.postVersion || 1),
          resolvedAt: now,
          resolvedSource: decision.source,
          resolvedByPhone: fromE164 || null,
        },
      }),
      prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'CANCELLED',
          metadata: nextMetadata,
        },
      }),
    ]);

    await whatsappRuntime.appendAuditLog({
      tenantId,
      action: 'post.approval.rejected.whatsapp',
      resource: 'approval',
      resourceId: approval.id,
      meta: {
        postId: post.id,
        source: decision.source,
        fromE164,
      },
    });

    await sendPromptMessage({
      tenantId,
      phoneNumberId,
      toE164: fromE164,
      text: 'Entendi. Se quiser, me diga o motivo da recusa.',
      contextMessageId: message?.id || null,
      postId: post.id,
    });

    return { handled: true, postId: post.id, approvalId: approval.id, status: 'REJECTED' };
  }

  return { handled: false, reason: 'unsupported_decision' };
}

async function applyPendingConversationInput({
  tenantId,
  fromE164,
  phoneNumberId,
  textBody,
  message,
  client,
}) {
  if (!textBody || !client?.id) return { handled: false, reason: 'missing_context' };

  const post = await resolvePendingConversationPost(tenantId, client.id);
  if (!post) return { handled: false, reason: 'no_pending_conversation' };

  const waApproval = isPlainObject(post?.metadata?.whatsappApproval)
    ? post.metadata.whatsappApproval
    : {};
  const pendingInput = isPlainObject(waApproval.pendingInput) ? waApproval.pendingInput : null;
  if (!pendingInput?.type) return { handled: false, reason: 'no_pending_input' };

  const approvalId = pendingInput.approvalId || waApproval.approvalId || null;
  const approval = approvalId
    ? await prisma.approval.findFirst({
        where: { id: approvalId, tenantId },
      })
    : null;

  const now = new Date();
  const nextMetadata = mergePostMetadata(post, {
    pendingInput: null,
    lastFeedbackAt: now.toISOString(),
    lastFeedbackText: textBody,
  });

  if (pendingInput.type === 'CHANGES_FEEDBACK') {
    nextMetadata.workflowStatus = 'CHANGES';

    const tx = [];
    if (approval) {
      tx.push(
        prisma.approval.update({
          where: { id: approval.id },
          data: {
            status: 'REJECTED',
            notes: textBody,
            postVersion: Number(post.version || approval.postVersion || 1),
            resolvedAt: now,
            resolvedSource: 'WHATSAPP_TEXT',
            resolvedByPhone: fromE164 || null,
          },
        }),
      );
    }

    tx.push(
      prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'DRAFT',
          clientFeedback: textBody,
          metadata: nextMetadata,
        },
      }),
    );

    await prisma.$transaction(tx);

    await whatsappRuntime.appendAuditLog({
      tenantId,
      action: 'post.approval.feedback.whatsapp',
      resource: 'post',
      resourceId: post.id,
      meta: {
        approvalId: approval?.id || null,
        fromE164,
        feedback: textBody,
      },
    });

    await sendPromptMessage({
      tenantId,
      phoneNumberId,
      toE164: fromE164,
      text: 'Feedback registrado. A agencia vai ajustar e enviar uma nova versao.',
      contextMessageId: message?.id || null,
      postId: post.id,
    });

    return { handled: true, postId: post.id, approvalId: approval?.id || null, type: 'CHANGES_FEEDBACK' };
  }

  if (pendingInput.type === 'REJECTION_REASON') {
    const tx = [];
    if (approval) {
      const currentNotes = normalizeText(approval.notes);
      const mergedNotes = currentNotes ? `${currentNotes}\nMotivo: ${textBody}` : textBody;
      tx.push(
        prisma.approval.update({
          where: { id: approval.id },
          data: {
            notes: mergedNotes,
            resolvedAt: now,
            resolvedSource: 'WHATSAPP_TEXT',
            resolvedByPhone: fromE164 || null,
          },
        }),
      );
    }

    tx.push(
      prisma.post.update({
        where: { id: post.id },
        data: {
          clientFeedback: textBody,
          metadata: nextMetadata,
        },
      }),
    );
    await prisma.$transaction(tx);

    await whatsappRuntime.appendAuditLog({
      tenantId,
      action: 'post.approval.rejection_reason.whatsapp',
      resource: 'post',
      resourceId: post.id,
      meta: {
        approvalId: approval?.id || null,
        fromE164,
        reason: textBody,
      },
    });

    await sendPromptMessage({
      tenantId,
      phoneNumberId,
      toE164: fromE164,
      text: 'Motivo registrado. Obrigado pelo retorno.',
      contextMessageId: message?.id || null,
      postId: post.id,
    });

    return { handled: true, postId: post.id, approvalId: approval?.id || null, type: 'REJECTION_REASON' };
  }

  return { handled: false, reason: 'unsupported_pending_type' };
}

async function processIncomingMessageEvent({ value, message }) {
  const fromE164 = whatsappRuntime.normalizeFromMeta(message?.from);
  if (!fromE164) return { ok: false, reason: 'invalid_from' };

  const phoneNumberId = value?.metadata?.phone_number_id
    ? String(value.metadata.phone_number_id)
    : null;

  const integration = phoneNumberId
    ? await whatsappRuntime.resolveIntegrationByPhoneNumberId(phoneNumberId)
    : null;
  const tenantId = integration?.tenantId || null;

  if (integration?.id) {
    await whatsappRuntime.touchIntegrationLastWebhookAt(integration.id);
  }

  const textBody = extractMessageText(message);
  const waMessageId = message?.id || null;

  const persisted = await whatsappRuntime.persistInboundMessage({
    tenantId,
    fromE164,
    waMessageId,
    phoneNumberId,
    type: message?.type || 'unknown',
    textBody,
    rawPayload: {
      value,
      message,
    },
  });
  if (persisted?.duplicate) {
    return { ok: true, duplicate: true, waMessageId };
  }

  let client = null;
  if (tenantId) {
    client = await whatsappRuntime.resolveClientByPhone(tenantId, fromE164);
  }

  await whatsappRuntime.logWhatsAppMessage({
    tenantId,
    waMessageId,
    direction: 'INBOUND',
    fromE164,
    payload: {
      message,
      metadata: value?.metadata || null,
      contact: value?.contacts?.[0] || null,
    },
    postId: null,
  });

  if (!tenantId || !client) {
    return {
      ok: true,
      processed: false,
      reason: !tenantId ? 'tenant_not_found' : 'client_not_found',
    };
  }

  const decision = parseMessageDecision(message);
  let decisionResult = { handled: false, reason: 'no_decision' };

  if (decision) {
    decisionResult = await applyApprovalDecision({
      tenantId,
      fromE164,
      phoneNumberId,
      message,
      decision,
      client,
    });
  }

  let pendingInputResult = { handled: false };
  if (!decisionResult.handled && message?.type === 'text' && textBody) {
    pendingInputResult = await applyPendingConversationInput({
      tenantId,
      fromE164,
      phoneNumberId,
      textBody,
      message,
      client,
    });
  }

  if (!decisionResult.handled && !pendingInputResult.handled && textBody) {
    await registerReportDeliveryInteraction({
      tenantId,
      clientId: client.id,
      fromE164,
      waMessageId,
      contextMessageId: message?.context?.id || null,
      textBody,
      rawPayload: message,
    });
  }

  const relatedPostId =
    decisionResult?.postId ||
    pendingInputResult?.postId ||
    null;
  if (relatedPostId) {
    await whatsappRuntime.logWhatsAppMessage({
      tenantId,
      waMessageId,
      direction: 'INBOUND',
      fromE164,
      postId: relatedPostId,
      payload: {
        message,
        metadata: value?.metadata || null,
        contact: value?.contacts?.[0] || null,
      },
    });
  }

  return {
    ok: true,
    processed: true,
    decision: decisionResult,
    pendingInput: pendingInputResult,
  };
}

async function processWebhookPayload(payload) {
  await touchIntegrationsFromPayload(payload);
  const events = extractIncomingMessages(payload);
  for (const event of events) {
    try {
      await processIncomingMessageEvent(event);
    } catch (err) {
      console.error('[whatsapp webhook] event processing error:', err?.message || err);
    }
  }
}

/**
 * Verificação do webhook (Meta)
 * GET /api/webhooks/whatsapp/meta
 */
router.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/**
 * Eventos do WhatsApp (mensagens, status etc.)
 * POST /api/webhooks/whatsapp/meta
 */
router.post('/meta', express.json({ type: '*/*' }), (req, res) => {
  if (!verifyMetaSignature(req)) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  res.sendStatus(200);

  setImmediate(() => {
    processWebhookPayload(req.body || {}).catch((err) => {
      console.error('[whatsapp webhook] processing failed:', err?.message || err);
    });
  });
});

module.exports = router;
