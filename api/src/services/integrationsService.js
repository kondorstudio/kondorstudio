// api/src/services/integrationsService.js
// Service para gerenciar integrações (Meta, Google, TikTok, GA, YouTube etc.)
// Responsabilidades:
// - CRUD de integrações por tenant
// - Testar conexão
// - Sincronizar métricas (placeholder para enfileirar job)
// - Registrar logs de atualização

const { prisma } = require('../prisma');

/**
 * Converte tempo para Date ou null
 */
function toDateOrNull(v) {
  if (!v && v !== 0) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

module.exports = {
  /**
   * Lista integrações do tenant
   * opts: { provider, active, page, perPage, q }
   */
  async list(tenantId, opts = {}) {
    const { provider, active, q, page = 1, perPage = 50 } = opts;
    const where = { tenantId };

    if (provider) where.provider = provider;
    if (active !== undefined) where.active = Boolean(active);
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { credentialsJson: { contains: q, mode: 'insensitive' } },
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
          name: true,
          provider: true,
          active: true,
          lastSyncAt: true,
          settings: true,
        },
      }),
      prisma.integration.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  },

  /**
   * Cria integração para o tenant
   * data: { name, provider, credentials (object), settings (object), active }
   */
  async create(tenantId, data = {}) {
    if (!data.provider) throw new Error('Provider é obrigatório');
    const payload = {
      tenantId,
      name: data.name || `${data.provider} integration`,
      provider: data.provider,
      credentialsJson: data.credentials ? JSON.stringify(data.credentials) : null,
      settings: data.settings || null,
      active: data.active === undefined ? true : Boolean(data.active),
      lastSyncAt: data.lastSyncAt ? toDateOrNull(data.lastSyncAt) : null,
      metadata: data.metadata || null,
    };

    return prisma.integration.create({ data: payload });
  },

  /**
   * Busca integração por id
   */
  async getById(tenantId, id) {
    if (!id) return null;
    return prisma.integration.findFirst({
      where: { id, tenantId },
    });
  },

  /**
   * Atualiza integração
   */
  async update(tenantId, id, data = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.active !== undefined) updateData.active = Boolean(data.active);
    if (data.settings !== undefined) updateData.settings = data.settings;
    if (data.credentials !== undefined) {
      updateData.credentialsJson = data.credentials ? JSON.stringify(data.credentials) : null;
    }
    if (data.lastSyncAt !== undefined) updateData.lastSyncAt = toDateOrNull(data.lastSyncAt);
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    await prisma.integration.update({ where: { id }, data: updateData });
    return this.getById(tenantId, id);
  },

  /**
   * Remove integração
   */
  async remove(tenantId, id) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;
    await prisma.integration.delete({ where: { id } });
    return true;
  },

  /**
   * Registra um log de sync/update para auditoria
   * data: { integrationId, success: bool, message, rawResponse }
   */
  async log(tenantId, integrationId, data = {}) {
    // assume tabela integrationLog com fields: integrationId, tenantId, success, message, raw, createdAt
    return prisma.integrationLog.create({
      data: {
        tenantId,
        integrationId,
        success: data.success === undefined ? true : Boolean(data.success),
        message: data.message || null,
        raw: data.rawResponse ? JSON.stringify(data.rawResponse) : null,
      },
    });
  },

  /**
   * Testa a conexão com as credenciais da integração.
   * Implementa checks básicos por provider (placeholders).
   * Retorna { ok: boolean, info?: string }
   */
  async testConnection(tenantId, id) {
    const integration = await this.getById(tenantId, id);
    if (!integration) return { ok: false, info: 'Integration not found' };

    const creds = integration.credentialsJson ? JSON.parse(integration.credentialsJson) : null;
    if (!creds) return { ok: false, info: 'No credentials configured' };

    try {
      // Implement provider-specific lightweight checks (placeholders)
      switch ((integration.provider || '').toLowerCase()) {
        case 'meta':
        case 'facebook':
        case 'instagram':
          // expect accessToken or appId/appSecret pair
          if (creds.accessToken || (creds.appId && creds.appSecret)) {
            return { ok: true, info: 'Credentials look valid (basic check)' };
          }
          return { ok: false, info: 'Missing access token or appId/appSecret' };

        case 'google':
        case 'google-ads':
        case 'ga4':
          if (creds.client_email || creds.refresh_token || creds.client_id) {
            return { ok: true, info: 'Credentials look valid (basic check)' };
          }
          return { ok: false, info: 'Missing Google credentials' };

        case 'tiktok':
          if (creds.accessToken || creds.client_key) return { ok: true, info: 'Basic check ok' };
          return { ok: false, info: 'Missing TikTok credentials' };

        default:
          return { ok: true, info: 'Provider unknown — no deep check performed' };
      }
    } catch (err) {
      return { ok: false, info: `Error testing connection: ${String(err)}` };
    }
  },

  /**
   * Sincroniza métricas dessa integração.
   * Aqui colocamos placeholder que registra o pedido e devolve status.
   * Ideal: enfileirar job em BullMQ para processar assincronamente.
   *
   * options: { since, until, force, schedule }
   */
  async syncMetrics(tenantId, id, options = {}) {
    const integration = await this.getById(tenantId, id);
    if (!integration) throw new Error('Integration not found');

    // Register a sync request in DB (integrationSync table) to be picked by worker
    const syncRecord = await prisma.integrationSync.create({
      data: {
        tenantId,
        integrationId: integration.id,
        status: 'queued',
        options: options || null,
        requestedBy: options.requestedBy || null,
      },
    });

    // Log short message
    await this.log(tenantId, integration.id, { success: true, message: 'Sync queued', rawResponse: { syncId: syncRecord.id } });

    // Return record info so caller can track
    return {
      ok: true,
      queued: true,
      syncId: syncRecord.id,
    };
  },

  /**
   * Função utilitária que workers podem usar para aplicar dados de métricas vindos do provider
   * payload: { type, value, timestamp, clientId, meta }
   */
  async ingestMetricFromProvider(tenantId, payload = {}) {
    // Usa a tabela metric via prisma
    const metric = await prisma.metric.create({
      data: {
        tenantId,
        clientId: payload.clientId || null,
        type: payload.type || 'unknown',
        value: Number(payload.value || 0),
        timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
        meta: payload.meta || null,
        source: payload.source || 'integration',
      },
    });
    return metric;
  },
};
