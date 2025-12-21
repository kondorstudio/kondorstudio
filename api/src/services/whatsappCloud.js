// api/src/services/whatsappCloud.js
// Integração com WhatsApp Cloud API (Meta) — multi-tenant
const { prisma } = require('../prisma');
const approvalsService = require('./approvalsService');
const { decrypt } = require('../utils/crypto');

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

  if (!phoneNumberId) {
    return {
      integration,
      phoneNumberId: phoneNumberId || null,
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
  } catch (err) {
    throw new Error('Invalid encrypted token for integration');
  }

  return { integration, phoneNumberId, accessToken, settings };
}

async function sendTextMessage({ phoneNumberId, accessToken, toE164, text }) {
  if (!phoneNumberId) {
    throw new Error('Missing phoneNumberId (integration.config.phone_number_id)');
  }
  if (!accessToken) {
    throw new Error('Missing accessToken for WhatsApp Cloud API');
  }
  if (!toE164) {
    throw new Error('Missing destination number (toE164)');
  }
  if (!text) {
    throw new Error('Missing message text');
  }

  if (typeof fetch !== 'function') {
    throw new Error(
      'Global fetch() não disponível no runtime Node. Atualize a versão do Node ou adicione um HTTP client.',
    );
  }

  const url = buildCloudMessagesUrl(phoneNumberId);
  const body = {
    messaging_product: 'whatsapp',
    to: toE164,
    type: 'text',
    text: { body: text },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
    throw err;
  }

  const waMessageId = data?.messages?.[0]?.id || null;
  return { waMessageId, raw: data };
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

class WhatsAppSendError extends Error {
  constructor(message, { statusCode = 500, code = 'WHATSAPP_SEND_ERROR', details = null } = {}) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

async function sendApprovalRequest({ tenantId, postId }) {
  if (!tenantId) {
    throw new WhatsAppSendError('tenantId é obrigatório', { statusCode: 400, code: 'MISSING_TENANT' });
  }
  if (!postId) {
    throw new WhatsAppSendError('postId é obrigatório', { statusCode: 400, code: 'MISSING_POST' });
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId },
    include: { client: true },
  });

  if (!post) {
    throw new WhatsAppSendError('Post não encontrado para este tenant', { statusCode: 404, code: 'NOT_FOUND' });
  }

  if (!post.client) {
    throw new WhatsAppSendError('Post não possui cliente associado', { statusCode: 400, code: 'MISSING_CLIENT' });
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

  const alreadySent =
    (Boolean(post.sentAt) && (post.sentMethod === 'cloud_api' || post.sentMethod === 'wa_link')) ||
    Boolean(post.whatsappMessageId) ||
    Boolean(post.whatsappSentAt);

  if (alreadySent) {
    throw new WhatsAppSendError('Este post já foi enviado para aprovação via WhatsApp', {
      statusCode: 409,
      code: 'ALREADY_SENT',
      details: {
        sentMethod: post.sentMethod || null,
        sentAt: post.sentAt || null,
        whatsappMessageId: post.whatsappMessageId || null,
      },
    });
  }

  let integrationBundle;
  try {
    integrationBundle = await getAgencyWhatsAppIntegration(tenantId);
  } catch (err) {
    throw new WhatsAppSendError('Integração WhatsApp Cloud inválida ou incompleta', {
      statusCode: 500,
      code: 'INTEGRATION_INVALID',
      details: {
        message: err?.message || null,
      },
    });
  }

  if (!integrationBundle || integrationBundle.incomplete) {
    const waLink = `https://wa.me/${stripNonDigits(toE164)}`;

    await prisma.post.update({
      where: { id: post.id },
      data: {
        sentAt: new Date(),
        sentMethod: 'wa_link',
        metadata: {
          ...(isPlainObject(post.metadata) ? post.metadata : {}),
          whatsappApproval: {
            mode: 'wa_link',
            waLink,
            at: new Date().toISOString(),
          },
        },
      },
    });

    return { mode: 'wa_link', waLink };
  }

  const approval = await prisma.approval.findFirst({
    where: { tenantId, postId: post.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  let approvalUrl = null;
  if (approval) {
    const publicLink = await approvalsService.getOrCreatePublicLink(tenantId, approval.id, {});
    approvalUrl = buildApprovalLink(publicLink?.token || null);
  } else {
    approvalUrl = buildApprovalLink(null);
  }

  const shortTitle = String(post.title || post.id).slice(0, 80);
  const messageLines = [
    `Aprovação pendente: ${shortTitle}`,
    `Post: ${post.id}`,
  ];
  if (approvalUrl) messageLines.push(`Aprove aqui: ${approvalUrl}`);
  const text = messageLines.join('\n');

  let sendResult;
  try {
    sendResult = await sendTextMessage({
      phoneNumberId: integrationBundle.phoneNumberId,
      accessToken: integrationBundle.accessToken,
      toE164,
      text,
    });
  } catch (err) {
    const status = err?.status || err?.statusCode || null;
    throw new WhatsAppSendError('Falha ao enviar mensagem via WhatsApp Cloud API', {
      statusCode: 500,
      code: 'CLOUD_API_SEND_FAILED',
      details: {
        status,
        message: err?.message || null,
      },
    });
  }

  const waMessageId = sendResult?.waMessageId || null;

  await prisma.post.update({
    where: { id: post.id },
    data: {
      sentAt: new Date(),
      sentMethod: 'cloud_api',
      whatsappSentAt: new Date(),
      whatsappMessageId: waMessageId,
      metadata: {
        ...(isPlainObject(post.metadata) ? post.metadata : {}),
        whatsappApproval: {
          mode: 'cloud_api',
          waMessageId,
          at: new Date().toISOString(),
        },
      },
    },
  });

  return { mode: 'cloud_api', waMessageId };
}

module.exports = {
  getAgencyWhatsAppIntegration,
  sendTextMessage,
  sendApprovalRequest,
  WhatsAppSendError,
};
