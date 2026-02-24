// api/src/services/whatsappCloud.js
// Integração com WhatsApp Cloud API (Meta) — multi-tenant
const { prisma } = require('../prisma');
const approvalsService = require('./approvalsService');
const whatsappRuntime = require('./whatsappRuntimeService');
const { decrypt } = require('../utils/crypto');

const APPROVAL_ACTION_IDS = Object.freeze({
  APPROVE: 'KONDOR_APPROVAL_APPROVE',
  REQUEST_CHANGES: 'KONDOR_APPROVAL_CHANGES',
  REJECT: 'KONDOR_APPROVAL_REJECT',
});

function getWhatsAppApiBaseUrl() {
  const base = process.env.WHATSAPP_API_URL;
  if (!base || !String(base).trim()) {
    throw new Error('Missing WHATSAPP_API_URL env var (required for WhatsApp Cloud API)');
  }
  return String(base).replace(/\/$/, '');
}

function buildCloudMessagesUrl(phoneNumberId) {
  const base = getWhatsAppApiBaseUrl();
  return `${base}/${phoneNumberId}/messages`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripNonDigits(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function normalizeE164(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (!raw.startsWith('+')) return null;
  const digits = stripNonDigits(raw);
  if (!digits) return null;
  const normalized = `+${digits}`;
  if (normalized.length < 9 || normalized.length > 16) return null;
  return normalized;
}

function getPublicAppUrl() {
  const base =
    process.env.APP_PUBLIC_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.PUBLIC_APP_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    '';
  return base ? String(base).replace(/\/$/, '') : '';
}

function buildApprovalLink(token) {
  const base = getPublicAppUrl();
  if (!base) return null;
  if (!token) return `${base}/public/approvals`;
  return `${base}/public/approvals/${token}`;
}

function shouldUseInteractiveApprovals() {
  return process.env.WHATSAPP_APPROVAL_INTERACTIVE_ENABLED !== 'false';
}

function truncateText(value, maxLength) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function formatSuggestedDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function buildApprovalSummary(post, approvalUrl) {
  const lines = [];
  lines.push(`Aprovacao pendente: ${truncateText(post?.title || post?.id, 70)}`);
  const copy = truncateText(post?.caption || post?.content, 120);
  if (copy) lines.push(`Resumo: ${copy}`);
  const suggestedDate = formatSuggestedDate(post?.scheduledDate || post?.publishedDate);
  if (suggestedDate) lines.push(`Data sugerida: ${suggestedDate}`);
  if (approvalUrl) lines.push(`Link de apoio: ${approvalUrl}`);
  return lines.join('\n');
}

function buildActionId(actionId, approvalId) {
  if (!approvalId) return actionId;
  return `${actionId}:${approvalId}`;
}

function parseActionId(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return null;
  const [base, ...rest] = value.split(':');
  if (!Object.values(APPROVAL_ACTION_IDS).includes(base)) {
    return null;
  }
  const approvalId = rest.length ? rest.join(':') : null;
  return { action: base, approvalId: approvalId || null };
}

async function getAgencyWhatsAppIntegration(tenantId) {
  if (!tenantId) return null;

  const integration = await prisma.integration.findFirst({
    where: {
      tenantId,
      provider: 'WHATSAPP_META_CLOUD',
      ownerType: 'AGENCY',
      ownerKey: 'AGENCY',
      status: 'CONNECTED',
    },
    select: {
      id: true,
      tenantId: true,
      provider: true,
      status: true,
      accessTokenEncrypted: true,
      settings: true,
      config: true,
    },
  });

  if (!integration) return null;

  const settings = isPlainObject(integration.settings) ? integration.settings : {};
  const config = isPlainObject(integration.config) ? integration.config : {};

  const phoneNumberId =
    config.phone_number_id ||
    config.phoneNumberId ||
    config.phoneNumberID ||
    settings.phone_number_id ||
    settings.phoneNumberId ||
    settings.phoneNumberID ||
    null;

  const displayPhoneNumber =
    config.display_phone_number ||
    config.displayPhoneNumber ||
    settings.display_phone_number ||
    settings.displayPhoneNumber ||
    null;

  if (!phoneNumberId) {
    return {
      integration,
      phoneNumberId: null,
      displayPhoneNumber: displayPhoneNumber || null,
      accessToken: null,
      settings,
      incomplete: true,
    };
  }

  if (!integration.accessTokenEncrypted) {
    throw new Error('Missing encrypted token for integration');
  }

  let accessToken;
  try {
    accessToken = decrypt(integration.accessTokenEncrypted);
  } catch (_) {
    throw new Error('Invalid encrypted token for integration');
  }

  return { integration, phoneNumberId, displayPhoneNumber, accessToken, settings };
}

async function sendCloudPayload({
  phoneNumberId,
  accessToken,
  payload,
  tenantId = null,
  toE164 = null,
  postId = null,
}) {
  if (!phoneNumberId) {
    throw new Error('Missing phoneNumberId (integration.config.phone_number_id)');
  }
  if (!accessToken) {
    throw new Error('Missing accessToken for WhatsApp Cloud API');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Missing payload for WhatsApp Cloud API');
  }
  if (typeof fetch !== 'function') {
    throw new Error(
      'Global fetch() não disponível no runtime Node. Atualize a versão do Node ou adicione um HTTP client.',
    );
  }

  const url = buildCloudMessagesUrl(phoneNumberId);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    const logicalError =
      data?.error?.message ||
      data?.message ||
      `WhatsApp Cloud API retornou status ${res.status}`;
    const err = new Error(logicalError);
    err.status = res.status;
    err.code = 'WHATSAPP_CLOUD_API_ERROR';
    err.raw = data;
    throw err;
  }

  const waMessageId = data?.messages?.[0]?.id || null;
  if (tenantId) {
    try {
      const outboundType = `OUTBOUND_${String(payload?.type || 'message').toUpperCase()}`;
      const outboundText =
        payload?.text?.body ||
        payload?.interactive?.body?.text ||
        null;
      await whatsappRuntime.persistInboundMessage({
        tenantId,
        fromE164: toE164,
        waMessageId,
        phoneNumberId,
        type: outboundType,
        textBody: outboundText,
        rawPayload: {
          direction: 'OUTBOUND',
          request: payload,
          response: data,
        },
      });
    } catch (_) {
      // best-effort logging
    }
    try {
      await whatsappRuntime.logWhatsAppMessage({
        tenantId,
        waMessageId,
        direction: 'OUTBOUND',
        toE164,
        payload: { request: payload, response: data },
        postId: postId || null,
      });
    } catch (_) {
      // best-effort logging
    }
  }

  return { waMessageId, raw: data };
}

async function sendTextMessage({
  phoneNumberId,
  accessToken,
  toE164,
  text,
  contextMessageId = null,
  tenantId = null,
  postId = null,
}) {
  if (!toE164) throw new Error('Missing destination number (toE164)');
  if (!text) throw new Error('Missing message text');

  const payload = {
    messaging_product: 'whatsapp',
    to: toE164,
    type: 'text',
    text: { body: text },
  };
  if (contextMessageId) {
    payload.context = { message_id: String(contextMessageId) };
  }

  return sendCloudPayload({
    phoneNumberId,
    accessToken,
    payload,
    tenantId,
    toE164,
    postId,
  });
}

async function sendInteractiveApprovalMessage({
  phoneNumberId,
  accessToken,
  toE164,
  approvalId,
  bodyText,
  tenantId = null,
  postId = null,
}) {
  if (!toE164) throw new Error('Missing destination number (toE164)');
  if (!bodyText) throw new Error('Missing interactive message body');

  const payload = {
    messaging_product: 'whatsapp',
    to: toE164,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: truncateText(bodyText, 1024),
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: buildActionId(APPROVAL_ACTION_IDS.APPROVE, approvalId),
              title: 'APROVAR',
            },
          },
          {
            type: 'reply',
            reply: {
              id: buildActionId(APPROVAL_ACTION_IDS.REQUEST_CHANGES, approvalId),
              title: 'PEDIR CORRECAO',
            },
          },
          {
            type: 'reply',
            reply: {
              id: buildActionId(APPROVAL_ACTION_IDS.REJECT, approvalId),
              title: 'RECUSAR',
            },
          },
        ],
      },
    },
  };

  return sendCloudPayload({
    phoneNumberId,
    accessToken,
    payload,
    tenantId,
    toE164,
    postId,
  });
}

class WhatsAppSendError extends Error {
  constructor(message, { statusCode = 500, code = 'WHATSAPP_SEND_ERROR', details = null } = {}) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

async function resolvePendingApproval(tenantId, post) {
  const currentPending = await prisma.approval.findFirst({
    where: { tenantId, postId: post.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (currentPending) return currentPending;

  return prisma.approval.create({
    data: {
      tenantId,
      postId: post.id,
      status: 'PENDING',
      notes: post.caption || post.content || null,
      postVersion: Number(post.version || 1),
    },
  });
}

function isAlreadySentForApproval(post, approvalId) {
  const meta = isPlainObject(post?.metadata) ? post.metadata : {};
  const waMeta = isPlainObject(meta.whatsappApproval) ? meta.whatsappApproval : {};
  const sameApproval = waMeta.approvalId && waMeta.approvalId === approvalId;
  if (!sameApproval) return false;
  return Boolean(waMeta.waMessageId || post?.whatsappMessageId || post?.whatsappSentAt);
}

async function updatePostDeliveryState(post, nextWhatsAppMeta = {}, overrides = {}) {
  const meta = isPlainObject(post?.metadata) ? { ...post.metadata } : {};
  meta.whatsappApproval = {
    ...(isPlainObject(meta.whatsappApproval) ? meta.whatsappApproval : {}),
    ...nextWhatsAppMeta,
  };

  return prisma.post.update({
    where: { id: post.id },
    data: {
      sentAt: overrides.sentAt || new Date(),
      sentMethod: overrides.sentMethod || 'cloud_api',
      whatsappSentAt: overrides.whatsappSentAt || new Date(),
      whatsappMessageId: overrides.whatsappMessageId || null,
      metadata: meta,
    },
  });
}

async function sendApprovalRequest({ tenantId, postId }) {
  if (!tenantId) {
    throw new WhatsAppSendError('tenantId é obrigatório', {
      statusCode: 400,
      code: 'MISSING_TENANT',
    });
  }
  if (!postId) {
    throw new WhatsAppSendError('postId é obrigatório', {
      statusCode: 400,
      code: 'MISSING_POST',
    });
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId },
    include: { client: true },
  });

  if (!post) {
    throw new WhatsAppSendError('Post não encontrado para este tenant', {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
  if (!post.client) {
    throw new WhatsAppSendError('Post não possui cliente associado', {
      statusCode: 400,
      code: 'MISSING_CLIENT',
    });
  }

  const client = post.client;
  const toE164 = normalizeE164(client.whatsappNumberE164);
  if (!toE164) {
    throw new WhatsAppSendError('Cliente não possui WhatsApp válido em formato E164 (+55...)', {
      statusCode: 400,
      code: 'INVALID_CLIENT_WHATSAPP',
    });
  }
  if (client.whatsappOptIn === false) {
    throw new WhatsAppSendError('Cliente não autorizou receber mensagens via WhatsApp', {
      statusCode: 400,
      code: 'CLIENT_OPT_OUT',
    });
  }

  let integrationBundle;
  try {
    integrationBundle = await getAgencyWhatsAppIntegration(tenantId);
  } catch (err) {
    throw new WhatsAppSendError('Integração WhatsApp Cloud inválida ou incompleta', {
      statusCode: 500,
      code: 'INTEGRATION_INVALID',
      details: { message: err?.message || null },
    });
  }

  const approval = await resolvePendingApproval(tenantId, post);
  if (isAlreadySentForApproval(post, approval.id)) {
    throw new WhatsAppSendError('Este pedido de aprovação já foi enviado no WhatsApp', {
      statusCode: 409,
      code: 'ALREADY_SENT',
      details: {
        approvalId: approval.id,
        whatsappMessageId: post.whatsappMessageId || null,
      },
    });
  }

  await prisma.approval.update({
    where: { id: approval.id },
    data: { postVersion: Number(post.version || 1) },
  });

  const publicLink = await approvalsService.getOrCreatePublicLink(tenantId, approval.id, {});
  const approvalUrl = buildApprovalLink(publicLink?.token || null);
  const summary = buildApprovalSummary(post, approvalUrl);

  if (!integrationBundle || integrationBundle.incomplete) {
    const waLink = `https://wa.me/${stripNonDigits(toE164)}`;
    await updatePostDeliveryState(
      post,
      {
        approvalId: approval.id,
        mode: 'wa_link',
        fallbackUsed: false,
        waLink,
        approvalUrl,
        sentAt: new Date().toISOString(),
      },
      {
        sentMethod: 'wa_link',
        whatsappMessageId: null,
      },
    );
    return {
      mode: 'wa_link',
      fallbackUsed: false,
      waMessageId: null,
      approvalId: approval.id,
      approvalUrl,
      waLink,
    };
  }

  let sendMode = 'text_link';
  let fallbackUsed = false;
  let waMessageId = null;
  let interactiveError = null;

  const interactiveEnabled = shouldUseInteractiveApprovals();

  if (interactiveEnabled) {
    try {
      const interactiveResult = await sendInteractiveApprovalMessage({
        phoneNumberId: integrationBundle.phoneNumberId,
        accessToken: integrationBundle.accessToken,
        toE164,
        approvalId: approval.id,
        bodyText: summary,
        tenantId,
        postId: post.id,
      });
      sendMode = 'interactive';
      waMessageId = interactiveResult?.waMessageId || null;
    } catch (err) {
      interactiveError = err?.message || 'interactive_send_failed';
      fallbackUsed = true;
    }
  }

  if (!waMessageId) {
    const fallbackLines = [
      summary,
      '',
      'Responda com um toque:',
      '1) APROVAR',
      '2) PEDIR CORRECAO',
      '3) RECUSAR',
    ];
    const fallbackText = fallbackLines.filter(Boolean).join('\n');
    try {
      const fallbackResult = await sendTextMessage({
        phoneNumberId: integrationBundle.phoneNumberId,
        accessToken: integrationBundle.accessToken,
        toE164,
        text: fallbackText,
        tenantId,
        postId: post.id,
      });
      sendMode = 'text_link';
      waMessageId = fallbackResult?.waMessageId || null;
    } catch (err) {
      const status = err?.status || err?.statusCode || null;
      throw new WhatsAppSendError('Falha ao enviar mensagem via WhatsApp Cloud API', {
        statusCode: 500,
        code: 'CLOUD_API_SEND_FAILED',
        details: {
          status,
          message: err?.message || null,
          interactiveError,
        },
      });
    }
  }

  const sentAt = new Date();
  await updatePostDeliveryState(
    post,
    {
      approvalId: approval.id,
      mode: sendMode,
      fallbackUsed,
      waMessageId,
      approvalUrl,
      sentAt: sentAt.toISOString(),
      pendingInput: null,
      interactiveError: interactiveError || undefined,
    },
    {
      sentAt,
      sentMethod: 'cloud_api',
      whatsappSentAt: sentAt,
      whatsappMessageId: waMessageId,
    },
  );

  return {
    mode: sendMode,
    fallbackUsed,
    waMessageId,
    approvalId: approval.id,
    approvalUrl,
  };
}

module.exports = {
  APPROVAL_ACTION_IDS,
  buildActionId,
  parseActionId,
  getAgencyWhatsAppIntegration,
  sendTextMessage,
  sendInteractiveApprovalMessage,
  sendApprovalRequest,
  normalizeE164,
  WhatsAppSendError,
};
