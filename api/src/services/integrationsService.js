// api/src/services/integrationsService.js
// Gerencia integrações (Meta, Google, TikTok, WhatsApp) com suporte a ownerType/ownerKey

const { prisma } = require('../prisma');

function toDateOrNull(v) {
  if (!v && v !== 0) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

function sanitizeScopes(scopes) {
  if (!scopes) return [];
  if (Array.isArray(scopes)) return scopes.map((s) => String(s));
  if (typeof scopes === 'string') return scopes.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

function buildOwnerFields(data = {}) {
  const isClientIntegration =
    (data.ownerType && data.ownerType === 'CLIENT') ||
    Boolean(data.clientId);

  const ownerType = isClientIntegration ? 'CLIENT' : data.ownerType || 'AGENCY';
  const ownerKey = isClientIntegration
    ? String(data.ownerKey || data.clientId)
    : data.ownerKey || 'AGENCY';

  return {
    ownerType,
    ownerKey,
    clientId: isClientIntegration ? String(data.clientId || ownerKey) : null,
  };
}

function sanitizeIntegrationResponse(record) {
  if (!record) return null;
  const cloned = { ...record };
  delete cloned.accessToken;
  delete cloned.refreshToken;
  delete cloned.accessTokenEncrypted;
  if (cloned.config && typeof cloned.config === 'object' && !Array.isArray(cloned.config)) {
    const nextConfig = { ...cloned.config };
    for (const key of [
      'access_token',
      'accessToken',
      'accessTokenEncrypted',
      'token',
      'refresh_token',
      'refreshToken',
      'app_secret',
      'client_secret',
      'secret',
    ]) {
      if (Object.prototype.hasOwnProperty.call(nextConfig, key)) delete nextConfig[key];
    }
    cloned.config = nextConfig;
  }
  return cloned;
}

async function ensureIntegrationBelongsToTenant(tenantId, integrationId) {
  return prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });
}

module.exports = {
  async list(tenantId, opts = {}) {
    const { provider, status, ownerType, ownerKey, clientId, page = 1, perPage = 50 } = opts;
    const where = { tenantId };

    if (provider) where.provider = provider;
    if (status) where.status = status;
    if (ownerType) where.ownerType = ownerType;
    if (ownerKey) where.ownerKey = ownerKey;
    if (clientId) {
      where.OR = [
        { clientId },
        { ownerKey: String(clientId), ownerType: 'CLIENT' },
      ];
    }

    const skip = (Math.max(1, page) - 1) * perPage;

    const [items, total] = await Promise.all([
      prisma.integration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
        select: {
          id: true,
          tenantId: true,
          clientId: true,
          provider: true,
          providerName: true,
          status: true,
          settings: true,
          config: true,
          ownerType: true,
          ownerKey: true,
          lastSyncedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.integration.count({ where }),
    ]);

    return {
      items: items.map((item) => sanitizeIntegrationResponse(item)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  },

  async create(tenantId, data = {}) {
    if (!data.provider) throw new Error('Provider é obrigatório');
    const owner = buildOwnerFields(data);

    const payload = {
      tenantId,
      provider: data.provider,
      providerName: data.providerName || data.name || null,
      accessToken: data.accessToken || null,
      refreshToken: data.refreshToken || null,
      scopes: sanitizeScopes(data.scopes),
      settings: data.settings || null,
      status: data.status || 'ACTIVE',
      lastSyncedAt: toDateOrNull(data.lastSyncedAt),
      ownerType: owner.ownerType,
      ownerKey: owner.ownerKey,
      clientId: owner.clientId,
    };

    const created = await prisma.integration.create({ data: payload });
    return sanitizeIntegrationResponse(created);
  },

  async getById(tenantId, id) {
    if (!id) return null;
    const record = await prisma.integration.findFirst({
      where: { id, tenantId },
    });
    return sanitizeIntegrationResponse(record);
  },

  async update(tenantId, id, data = {}) {
    const existing = await ensureIntegrationBelongsToTenant(tenantId, id);
    if (!existing) return null;

    const updateData = {};
    if (data.providerName !== undefined || data.name !== undefined) {
      updateData.providerName = data.providerName || data.name || null;
    }
    if (data.status !== undefined) updateData.status = data.status;
    if (data.settings !== undefined) updateData.settings = data.settings;
    if (data.scopes !== undefined) updateData.scopes = sanitizeScopes(data.scopes);
    if (data.accessToken !== undefined) updateData.accessToken = data.accessToken || null;
    if (data.refreshToken !== undefined) updateData.refreshToken = data.refreshToken || null;
    if (data.lastSyncedAt !== undefined) updateData.lastSyncedAt = toDateOrNull(data.lastSyncedAt);

    if (data.ownerType !== undefined || data.ownerKey !== undefined || data.clientId !== undefined) {
      const owner = buildOwnerFields({
        ownerType: data.ownerType !== undefined ? data.ownerType : existing.ownerType,
        ownerKey: data.ownerKey !== undefined ? data.ownerKey : existing.ownerKey,
        clientId: data.clientId !== undefined ? data.clientId : existing.clientId,
      });
      updateData.ownerType = owner.ownerType;
      updateData.ownerKey = owner.ownerKey;
      updateData.clientId = owner.clientId;
    }

    await prisma.integration.update({ where: { id }, data: updateData });
    return this.getById(tenantId, id);
  },

  async remove(tenantId, id) {
    const existing = await ensureIntegrationBelongsToTenant(tenantId, id);
    if (!existing) return false;
    await prisma.integration.delete({ where: { id } });
    return true;
  },

  async connectClientIntegration(tenantId, clientId, provider, data = {}) {
    if (!tenantId || !clientId || !provider) {
      throw new Error('tenantId, clientId e provider são obrigatórios');
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
    });
    if (!client) {
      throw new Error('Cliente não encontrado para este tenant');
    }

    const owner = buildOwnerFields({ ownerType: 'CLIENT', ownerKey: clientId, clientId });

    const payload = {
      tenantId,
      provider,
      providerName: data.providerName || data.name || null,
      accessToken: data.accessToken || null,
      refreshToken: data.refreshToken || null,
      scopes: sanitizeScopes(data.scopes),
      settings: data.settings || null,
      status: data.status || 'ACTIVE',
      ownerType: owner.ownerType,
      ownerKey: owner.ownerKey,
      clientId: owner.clientId,
    };

    const created = await prisma.integration.create({ data: payload });
    return sanitizeIntegrationResponse(created);
  },

  async disconnect(tenantId, id) {
    const existing = await ensureIntegrationBelongsToTenant(tenantId, id);
    if (!existing) return null;

    await prisma.integration.update({
      where: { id },
      data: { status: 'INACTIVE', accessToken: null, refreshToken: null },
    });

    return this.getById(tenantId, id);
  },

  async queueIntegrationJob(tenantId, integrationId, type, payload = {}) {
    const integration = await ensureIntegrationBelongsToTenant(tenantId, integrationId);
    if (!integration) throw new Error('Integration not found');

    const job = await prisma.integrationJob.create({
      data: {
        integrationId: integration.id,
        type,
        status: 'pending',
        payload,
      },
    });
    return job;
  },

  async processIntegrationJob(integrationJobId) {
    const job = await prisma.integrationJob.findUnique({
      where: { id: integrationJobId },
      include: { integration: true },
    });

    if (!job || !job.integration) {
      throw new Error('IntegrationJob não encontrado ou sem integração associada');
    }

    await prisma.integrationJob.update({
      where: { id: job.id },
      data: {
        status: 'done',
        attempt: job.attempt + 1,
        result: { processedAt: new Date(), type: job.type || null },
      },
    });

    return { ok: true, jobId: job.id };
  },
};
