// api/src/services/approvalsService.js
// Service para gerenciamento do fluxo de aprovação de posts (kanban-like)
// Escopado por tenant

const crypto = require('crypto');
const { prisma } = require('../prisma');

/**
 * Converte valor em Date ou null
 */
function toDateOrNull(v) {
  if (!v && v !== 0) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Gera um token público seguro para approval.
 * - Usa crypto.randomBytes
 * - Normaliza para [a-zA-Z0-9]
 * - Tamanho aproximado: 32 caracteres
 */
function generatePublicToken(bytes = 24) {
  let token = '';

  // Gera blocos até atingir pelo menos 32 caracteres alfanuméricos
  while (token.length < 32) {
    const chunk = crypto
      .randomBytes(bytes)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '');
    token += chunk;
  }

  return token.slice(0, 32);
}

module.exports = {
  /**
   * Lista approvals do tenant com filtros básicos e paginação
   * opts: { status, clientId, assignedTo, page, perPage }
   */
  async list(tenantId, opts = {}) {
    const { status, clientId, assignedTo, q, page = 1, perPage = 50 } = opts;
    const where = { tenantId };

    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (assignedTo) where.assignedTo = assignedTo;

    if (q) {
      where.OR = [
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    const skip = (Math.max(1, page) - 1) * perPage;

    const [items, total] = await Promise.all([
      prisma.approval.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
      }),
      prisma.approval.count({ where }),
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
   * Cria novo registro de approval (ex: um item para o fluxo de aprovação)
   * data pode conter: title, description, postId, clientId, status, assignedTo, metadata
   */
  async create(tenantId, userId, data = {}) {
    const resolvedNotes =
      data.notes !== undefined
        ? data.notes
        : data.description || data.body || null;

    let metadata =
      data.metadata && typeof data.metadata === 'object'
        ? { ...data.metadata }
        : null;

    const resolvedTitle = data.title || data.name || null;
    if (resolvedTitle) {
      metadata = metadata ? { ...metadata, title: resolvedTitle } : { title: resolvedTitle };
    }

    const payload = {
      tenantId,
      notes: resolvedNotes,
      postId: data.postId || data.post_id || null,
      clientId: data.clientId || data.client_id || null,
      status: data.status || 'PENDING',
      assignedTo: data.assignedTo || null,
      createdBy: userId || null,
      dueDate: toDateOrNull(data.dueDate || data.due_date),
      metadata,
      attachments: data.attachments || null,
      version: data.version || 1,
    };

    return prisma.approval.create({ data: payload });
  },

  /**
   * Busca approval por id (dentro do tenant)
   */
  async getById(tenantId, id) {
    if (!id) return null;
    return prisma.approval.findFirst({
      where: { id, tenantId },
    });
  },

  /**
   * Atualiza approval (campo a campo)
   */
  async update(tenantId, id, data = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const updateData = {};
    if (data.notes !== undefined || data.description !== undefined) {
      updateData.notes =
        data.notes !== undefined ? data.notes : data.description || null;
    }
    if (data.postId !== undefined || data.post_id !== undefined) {
      updateData.postId = data.postId || data.post_id || null;
    }
    if (data.clientId !== undefined || data.client_id !== undefined) {
      updateData.clientId = data.clientId || data.client_id || null;
    }
    if (data.status !== undefined) updateData.status = data.status;
    if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;
    if (data.dueDate !== undefined || data.due_date !== undefined) {
      updateData.dueDate = toDateOrNull(data.dueDate || data.due_date);
    }
    if (data.metadata !== undefined) {
      updateData.metadata = data.metadata;
    } else if (data.title !== undefined || data.name !== undefined) {
      const baseMetadata = existing.metadata && typeof existing.metadata === 'object'
        ? { ...existing.metadata }
        : {};
      const resolvedTitle = data.title !== undefined ? data.title : data.name;
      updateData.metadata = resolvedTitle
        ? { ...baseMetadata, title: resolvedTitle }
        : baseMetadata;
    }
    if (data.attachments !== undefined) updateData.attachments = data.attachments;
    if (data.version !== undefined) updateData.version = data.version;

    await prisma.approval.update({
      where: { id },
      data: updateData,
    });

    return this.getById(tenantId, id);
  },

  /**
   * Muda o status de um approval (helpful for kanban moves)
   */
  async changeStatus(tenantId, id, newStatus, options = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const updateData = { status: newStatus };
    if (options.assignedTo !== undefined) updateData.assignedTo = options.assignedTo;
    if (options.note !== undefined) {
      const activity =
        existing.metadata && existing.metadata.activity ? existing.metadata.activity : [];
      activity.push({
        type: 'status_change',
        by: options.by || null,
        note: options.note,
        at: new Date().toISOString(),
        from: existing.status,
        to: newStatus,
      });
      updateData.metadata = { ...(existing.metadata || {}), activity };
    }

    await prisma.approval.update({
      where: { id },
      data: updateData,
    });

    return this.getById(tenantId, id);
  },

  /**
   * Remove approval
   */
  async remove(tenantId, id) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;

    await prisma.approval.delete({
      where: { id },
    });

    return true;
  },

  /**
   * Lista por postId (útil para mostrar todas versões/approvals de um post)
   */
  async listByPost(tenantId, postId) {
    if (!postId) return [];
    return prisma.approval.findMany({
      where: { tenantId, postId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Sugestão rápida
   */
  async suggest(tenantId, term, limit = 10) {
    if (!term) return [];
    return prisma.approval.findMany({
      where: {
        tenantId,
        notes: { contains: term, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Gera ou reutiliza link público para approval.
   * Retorna sempre { approvalId, token, expiresAt } ou null se não pertencer ao tenant.
   */
  async getOrCreatePublicLink(tenantId, id, options = {}) {
    if (!tenantId || !id) return null;

    const { forceNew = false, ttlHours } = options || {};

    const approval = await prisma.approval.findFirst({
      where: { id, tenantId },
    });

    if (!approval) return null;

    const now = new Date();

    let ttl = null;
    if (ttlHours != null && !Number.isNaN(Number(ttlHours)) && Number(ttlHours) > 0) {
      ttl = Number(ttlHours);
    } else if (process.env.APPROVAL_PUBLIC_LINK_TTL_HOURS) {
      const envTtl = Number(process.env.APPROVAL_PUBLIC_LINK_TTL_HOURS);
      if (!Number.isNaN(envTtl) && envTtl > 0) {
        ttl = envTtl;
      }
    }

    if (!ttl) {
      ttl = 72;
    }

    const hasValidExistingToken =
      approval.publicToken &&
      (!approval.publicTokenExpiresAt || approval.publicTokenExpiresAt > now);

    if (hasValidExistingToken && !forceNew) {
      return {
        approvalId: approval.id,
        token: approval.publicToken,
        expiresAt: approval.publicTokenExpiresAt,
      };
    }

    const token = generatePublicToken();
    const expiresAt = new Date(now.getTime() + ttl * 60 * 60 * 1000);

    await prisma.approval.update({
      where: { id: approval.id },
      data: {
        publicToken: token,
        publicTokenExpiresAt: expiresAt,
      },
    });

    return {
      approvalId: approval.id,
      token,
      expiresAt,
    };
  },

  generatePublicToken,
};
