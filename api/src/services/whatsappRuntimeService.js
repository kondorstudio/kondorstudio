const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');

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
  const prefixed = raw.startsWith('+') ? raw : `+${raw}`;
  const digits = stripNonDigits(prefixed);
  if (!digits) return null;
  const normalized = `+${digits}`;
  if (normalized.length < 9 || normalized.length > 16) return null;
  return normalized;
}

function normalizeFromMeta(value) {
  const digits = stripNonDigits(value);
  if (!digits) return null;
  return normalizeE164(`+${digits}`);
}

function extractIntegrationPhoneNumberId(integration) {
  if (!integration) return null;
  const config = isPlainObject(integration.config) ? integration.config : {};
  const settings = isPlainObject(integration.settings) ? integration.settings : {};
  return (
    config.phone_number_id ||
    config.phoneNumberId ||
    config.phoneNumberID ||
    settings.phone_number_id ||
    settings.phoneNumberId ||
    settings.phoneNumberID ||
    null
  );
}

async function resolveIntegrationByPhoneNumberId(phoneNumberId) {
  const normalizedPhoneId = String(phoneNumberId || '').trim();
  if (!normalizedPhoneId) return null;

  const integrations = await prisma.integration.findMany({
    where: {
      provider: 'WHATSAPP_META_CLOUD',
      status: 'CONNECTED',
    },
    select: {
      id: true,
      tenantId: true,
      config: true,
      settings: true,
    },
  });

  return (
    integrations.find((integration) => {
      const candidate = extractIntegrationPhoneNumberId(integration);
      return candidate && String(candidate) === normalizedPhoneId;
    }) || null
  );
}

async function touchIntegrationLastWebhookAt(integrationId) {
  if (!integrationId) return null;

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { id: true, config: true },
  });
  if (!integration) return null;

  const config = isPlainObject(integration.config) ? { ...integration.config } : {};
  config.last_webhook_at = new Date().toISOString();
  await prisma.integration.update({
    where: { id: integrationId },
    data: { config },
  });
  return config.last_webhook_at;
}

async function resolveClientByPhone(tenantId, phoneE164) {
  const normalized = normalizeE164(phoneE164);
  if (!tenantId || !normalized) return null;
  const rawDigits = stripNonDigits(normalized);

  const candidates = await prisma.client.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      whatsappNumberE164: true,
      whatsappOptIn: true,
    },
  });

  return (
    candidates.find((client) => {
      const clientNormalized = normalizeE164(client.whatsappNumberE164);
      if (!clientNormalized) return false;
      return stripNonDigits(clientNormalized) === rawDigits;
    }) || null
  );
}

async function persistInboundMessage({
  tenantId = null,
  fromE164,
  waMessageId,
  phoneNumberId = null,
  type,
  textBody = null,
  rawPayload,
}) {
  const normalizedFrom = normalizeE164(fromE164);
  if (!normalizedFrom || !type || !rawPayload) {
    return { created: false, duplicate: false, reason: 'invalid_payload' };
  }

  try {
    const created = await prisma.whatsAppMessage.create({
      data: {
        tenantId: tenantId || null,
        from: normalizedFrom,
        waMessageId: waMessageId || null,
        phoneNumberId: phoneNumberId || null,
        type: String(type),
        textBody: textBody || null,
        rawPayload,
      },
    });
    return { created: true, duplicate: false, message: created };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return { created: false, duplicate: true };
    }
    throw err;
  }
}

async function logWhatsAppMessage({
  tenantId,
  waMessageId = null,
  direction,
  fromE164 = null,
  toE164 = null,
  payload = {},
  postId = null,
}) {
  if (!tenantId || !direction) return null;

  const normalizedFrom = fromE164 ? normalizeE164(fromE164) : null;
  const normalizedTo = toE164 ? normalizeE164(toE164) : null;

  const data = {
    tenantId,
    waMessageId: waMessageId || null,
    direction: String(direction).toUpperCase(),
    fromE164: normalizedFrom,
    toE164: normalizedTo,
    payload: payload && typeof payload === 'object' ? payload : { raw: payload },
    postId: postId || null,
  };

  try {
    return await prisma.whatsAppMessageLog.create({ data });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      waMessageId
    ) {
      return prisma.whatsAppMessageLog.update({
        where: { waMessageId: String(waMessageId) },
        data: {
          direction: data.direction,
          fromE164: data.fromE164,
          toE164: data.toE164,
          payload: data.payload,
          postId: data.postId,
        },
      });
    }
    throw err;
  }
}

async function appendAuditLog({
  tenantId,
  action,
  resource = null,
  resourceId = null,
  userId = null,
  meta = null,
}) {
  if (!tenantId || !action) return null;
  try {
    return await prisma.auditLog.create({
      data: {
        tenantId,
        action: String(action),
        resource,
        resourceId,
        userId,
        meta: meta && typeof meta === 'object' ? meta : null,
      },
    });
  } catch {
    return null;
  }
}

module.exports = {
  isPlainObject,
  stripNonDigits,
  normalizeE164,
  normalizeFromMeta,
  extractIntegrationPhoneNumberId,
  resolveIntegrationByPhoneNumberId,
  touchIntegrationLastWebhookAt,
  resolveClientByPhone,
  persistInboundMessage,
  logWhatsAppMessage,
  appendAuditLog,
};
