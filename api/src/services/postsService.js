// api/src/services/postsService.js
// Service para CRUD e operações úteis sobre posts (escopado por tenant)

const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');
const approvalsService = require('./approvalsService');
const { whatsappQueue } = require('../queues');
const whatsappCloud = require('./whatsappCloud');
const APPROVAL_LINK_TTL_DAYS =
  Number(process.env.POST_APPROVAL_TTL_DAYS || process.env.APPROVAL_LINK_TTL_DAYS || 7);

class PostValidationError extends Error {
  constructor(message, code = 'POST_VALIDATION_ERROR') {
    super(message);
    this.name = 'PostValidationError';
    this.code = code;
  }
}

/**
 * Converte valores de data flexíveis em Date ou null
 * Aceita: ISO string, timestamp number, ou null/undefined
 */
function toDateOrNull(value) {
  if (!value && value !== 0) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function sanitizeString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMetadataInput(data = {}) {
  const raw = data.metadata || data.meta || data.metadata_json || data.metadataJson;
  if (isPlainObject(raw)) return { ...raw };
  return null;
}

function applyIntegrationMetadata(base, data = {}) {
  const next = base ? { ...base } : {};

  const hasIntegrationId = data.integrationId !== undefined || data.integration_id !== undefined;
  const hasIntegrationKind = data.integrationKind !== undefined || data.integration_kind !== undefined;
  const hasIntegrationProvider =
    data.integrationProvider !== undefined || data.integration_provider !== undefined;

  if (hasIntegrationId) {
    const value = sanitizeString(data.integrationId || data.integration_id);
    if (value) next.integrationId = value;
    else delete next.integrationId;
  }

  if (hasIntegrationKind) {
    const value = sanitizeString(data.integrationKind || data.integration_kind);
    if (value) next.integrationKind = value;
    else delete next.integrationKind;
  }

  if (hasIntegrationProvider) {
    const value = sanitizeString(data.integrationProvider || data.integration_provider);
    if (value) next.integrationProvider = value;
    else delete next.integrationProvider;
  }

  return Object.keys(next).length ? next : null;
}

function buildMetadataForCreate(data = {}) {
  const base = normalizeMetadataInput(data);
  const hasIntegrationFields =
    data.integrationId !== undefined ||
    data.integration_id !== undefined ||
    data.integrationKind !== undefined ||
    data.integration_kind !== undefined ||
    data.integrationProvider !== undefined ||
    data.integration_provider !== undefined;

  if (!base && !hasIntegrationFields) return null;
  const merged = base ? { ...base } : {};
  return applyIntegrationMetadata(merged, data);
}

function buildMetadataForUpdate(existingMetadata, data = {}) {
  const patch = normalizeMetadataInput(data);
  const hasIntegrationFields =
    data.integrationId !== undefined ||
    data.integration_id !== undefined ||
    data.integrationKind !== undefined ||
    data.integration_kind !== undefined ||
    data.integrationProvider !== undefined ||
    data.integration_provider !== undefined;

  if (!patch && !hasIntegrationFields) return { hasUpdate: false, metadata: null };

  const base = isPlainObject(existingMetadata) ? { ...existingMetadata } : {};
  const merged = patch ? { ...base, ...patch } : base;
  const next = applyIntegrationMetadata(merged, data);

  return { hasUpdate: true, metadata: next };
}

function getPublicAppUrl() {
  const base =
    process.env.APP_PUBLIC_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.PUBLIC_APP_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    '';
  return base ? base.replace(/\/$/, '') : '';
}

function buildApprovalLink(token) {
  const base = getPublicAppUrl();
  if (!base) return null;
  if (!token) return `${base}/public/approvals`;
  return `${base}/public/approvals/${token}`;
}

/**
 * PostStatus existentes no seu schema (conforme você colou):
 * DRAFT, PENDING_APPROVAL, ARCHIVED, SCHEDULED, PUBLISHED, FAILED, CANCELLED, IDEA, APPROVED
 *
 * Importante:
 * - ApprovalStatus tem: PENDING, APPROVED, REJECTED
 * - PostStatus NÃO tem REJECTED
 *
 * Então:
 * - Aceitamos "REJECTED" como ALIAS (input) -> postStatus vira "DRAFT"
 * - E sincronizamos Approval para "REJECTED"
 */
const POST_STATUSES = new Set([
  'DRAFT',
  'PENDING_APPROVAL',
  'ARCHIVED',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
  'IDEA',
  'APPROVED',
]);

function normalizePostStatusInput(inputStatus) {
  const raw = sanitizeString(inputStatus);
  if (!raw) return { postStatus: 'DRAFT', approvalOverride: null };

  // Se o front mandar "REJECTED", não existe no PostStatus -> vira DRAFT + override no approval
  if (raw === 'REJECTED') {
    return { postStatus: 'DRAFT', approvalOverride: 'REJECTED' };
  }

  if (!POST_STATUSES.has(raw)) {
    // Evita quebrar Prisma por enum inválido
    return { postStatus: 'DRAFT', approvalOverride: null };
  }

  return { postStatus: raw, approvalOverride: null };
}

async function ensureApprovalRequest(tenantId, post, userId) {
  if (!post || !post.clientId) return null;

  const existing = await prisma.approval.findFirst({
    where: { tenantId, postId: post.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;

  return prisma.approval.create({
    data: {
      tenantId,
      postId: post.id,
      status: 'PENDING',
      // Mantém simples e compatível com o schema atual
      notes: post.caption || post.content || null,
      requesterId: userId || null,
    },
  });
}

/**
 * Sincroniza Approval baseado no STATUS DO POST.
 * - PENDING_APPROVAL -> garante Approval PENDING
 * - APPROVED -> seta Approval APPROVED (se existir pending)
 * - Rejeição: quando o caller passar approvalOverride="REJECTED" (post fica DRAFT)
 */
async function syncApprovalWithPostStatus(tenantId, post, postStatus, userId, approvalOverride = null) {
  if (!post || !postStatus) return;

  // Se post precisa de aprovação, garante um approval pendente
  if (postStatus === 'PENDING_APPROVAL') {
    await ensureApprovalRequest(tenantId, post, userId);
    return;
  }

  // Descobre qual status de approval aplicar (se houver)
  let approvalStatusToApply = null;

  if (approvalOverride === 'REJECTED') approvalStatusToApply = 'REJECTED';
  else if (postStatus === 'APPROVED') approvalStatusToApply = 'APPROVED';
  else return; // outros status do post não mexem em approvals

  const latestPending = await prisma.approval.findFirst({
    where: { tenantId, postId: post.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  if (!latestPending) return;

  await prisma.approval.update({
    where: { id: latestPending.id },
    data: {
      status: approvalStatusToApply,
      approverId: userId || latestPending.approverId || null,
    },
  });
}

async function getOrCreatePendingApproval(tenantId, post, userId, { forceNewToken = false } = {}) {
  if (!post) return null;

  let approval = await prisma.approval.findFirst({
    where: { tenantId, postId: post.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  if (!approval) {
    approval = await prisma.approval.create({
      data: {
        tenantId,
        postId: post.id,
        status: 'PENDING',
        notes: post.caption || post.content || null,
        requesterId: userId || null,
      },
    });
  }

  const ttlHours = Math.max(1, APPROVAL_LINK_TTL_DAYS * 24);
  const publicLink = await approvalsService.getOrCreatePublicLink(tenantId, approval.id, {
    forceNew: forceNewToken,
    ttlHours,
  });

  return { approval, publicLink };
}

async function enqueueWhatsappApprovalJob(payload = {}) {
  if (!whatsappQueue || typeof whatsappQueue.add !== 'function') {
    return { queued: false, reason: 'queue_unavailable' };
  }

  const job = await whatsappQueue.add(
    'whatsapp_send_approval_request',
    payload,
    {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  return { queued: true, jobId: job?.id || null };
}

module.exports = {
  /**
   * Lista posts do tenant com filtros e paginação
   * @param {String} tenantId
   * @param {Object} opts - { status, clientId, q, page, perPage }
   */
  async list(tenantId, opts = {}) {
    const { status, clientId, q } = opts;

    const page = Math.max(1, Number(opts.page || 1));
    const perPage = Math.min(100, Math.max(1, Number(opts.perPage || 50)));

    const where = { tenantId };

    if (status) {
      // aceita alias REJECTED sem quebrar; REJECTED no post vira DRAFT.
      const { postStatus } = normalizePostStatusInput(status);
      where.status = postStatus;
    }

    if (clientId) where.clientId = clientId;

    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { caption: { contains: q, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * perPage;
    const take = perPage;

    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.post.count({ where }),
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
   * Cria um novo post dentro do tenant
   * @param {String} tenantId
   * @param {String} userId - id do usuário que cria
   * @param {Object} data
   */
  async create(tenantId, userId, data = {}) {
    const scheduledDate = data.scheduledDate || data.scheduled_date || data.scheduledAt || null;
    const publishedDate = data.publishedDate || data.published_date || null;

    const title = sanitizeString(data.title);
    const clientId = sanitizeString(data.clientId || data.client_id);
    const mediaUrl = sanitizeString(data.mediaUrl || data.media_url);
    const platform = sanitizeString(data.platform);
    const metadata = buildMetadataForCreate(data);

    if (!title) throw new PostValidationError('Título é obrigatório');
    if (!clientId) throw new PostValidationError('Selecione um cliente antes de salvar o post');
    if (!mediaUrl) throw new PostValidationError('Envie uma mídia antes de salvar o post');

    const { postStatus, approvalOverride } = normalizePostStatusInput(data.status || 'DRAFT');

    const payload = {
      tenantId,
      clientId,
      title,
      caption: sanitizeString(data.caption || data.body),
      mediaUrl,
      mediaType: sanitizeString(data.mediaType || data.media_type) || 'image',
      cta: sanitizeString(data.cta),
      tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []),
      status: postStatus,
      scheduledDate: toDateOrNull(scheduledDate),
      publishedDate: toDateOrNull(publishedDate),
      platform,
      metadata,
      clientFeedback: sanitizeString(data.clientFeedback || data.client_feedback),
      version: Number(data.version || 1),
      history: data.history || null,
      createdBy: userId || null,
    };

    try {
      const created = await prisma.post.create({ data: payload });

      try {
        await syncApprovalWithPostStatus(tenantId, created, created.status, userId, approvalOverride);
      } catch (syncErr) {
        console.error('syncApprovalWithPostStatus(create) failed:', syncErr);
      }

      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2003') {
          throw new PostValidationError('Cliente selecionado não existe mais', 'INVALID_CLIENT');
        }
      }
      throw err;
    }
  },

  /**
   * Busca post por id dentro do tenant
   * @param {String} tenantId
   * @param {String} id
   */
  async getById(tenantId, id, options = {}) {
    if (!id) return null;
    return prisma.post.findFirst({
      where: { id, tenantId },
      ...options,
    });
  },

  /**
   * Atualiza post
   * @param {String} tenantId
   * @param {String} id
   * @param {Object} data
   */
  async update(tenantId, id, data = {}, options = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const updateData = {};
    let approvalOverride = null;

    if (data.title !== undefined) updateData.title = sanitizeString(data.title);

    if (data.caption !== undefined || data.body !== undefined) {
      updateData.caption = sanitizeString(data.caption || data.body);
    }

    if (data.mediaUrl !== undefined || data.media_url !== undefined) {
      updateData.mediaUrl = sanitizeString(data.mediaUrl || data.media_url);
    }

    if (data.mediaType !== undefined || data.media_type !== undefined) {
      updateData.mediaType = sanitizeString(data.mediaType || data.media_type);
    }

    if (data.cta !== undefined) updateData.cta = sanitizeString(data.cta);

    if (data.platform !== undefined) {
      updateData.platform = sanitizeString(data.platform);
    }

    if (data.tags !== undefined) {
      updateData.tags = Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []);
    }

    if (data.clientId !== undefined || data.client_id !== undefined) {
      updateData.clientId = sanitizeString(data.clientId || data.client_id);
    }

    if (data.status !== undefined) {
      const norm = normalizePostStatusInput(data.status);
      updateData.status = norm.postStatus;
      approvalOverride = norm.approvalOverride;
      if (norm.postStatus === 'PENDING_APPROVAL') {
        updateData.clientFeedback = null;
      }
    }

    if (
      data.scheduledDate !== undefined ||
      data.scheduled_date !== undefined ||
      data.scheduledAt !== undefined
    ) {
      const scheduledValue = data.scheduledDate || data.scheduled_date || data.scheduledAt;
      updateData.scheduledDate = toDateOrNull(scheduledValue);
    }

    if (data.publishedDate !== undefined || data.published_date !== undefined) {
      const publishedValue = data.publishedDate || data.published_date;
      updateData.publishedDate = toDateOrNull(publishedValue);
    }

    if (data.clientFeedback !== undefined || data.client_feedback !== undefined) {
      updateData.clientFeedback = sanitizeString(data.clientFeedback || data.client_feedback);
    }

    if (data.version !== undefined) updateData.version = Number(data.version);
    if (data.history !== undefined) updateData.history = data.history;

    const metadataUpdate = buildMetadataForUpdate(existing.metadata, data);
    if (metadataUpdate.hasUpdate) {
      updateData.metadata = metadataUpdate.metadata;
    }

    const updated = await prisma.post.update({
      where: { id },
      data: updateData,
    });

    // Só sincroniza se status mudou (ou se veio override de REJECTED)
    const statusChanged = updateData.status && updateData.status !== existing.status;
    const hasOverride = approvalOverride === 'REJECTED';

    if (statusChanged || hasOverride) {
      try {
        await syncApprovalWithPostStatus(
          tenantId,
          updated,
          updated.status,
          options.userId || null,
          approvalOverride
        );
      } catch (syncErr) {
        console.error('syncApprovalWithPostStatus(update) failed:', syncErr);
      }
    }

    return updated;
  },

  /**
   * Remove post (dentro do tenant)
   * @param {String} tenantId
   * @param {String} id
   */
  async remove(tenantId, id) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;

    await prisma.post.delete({
      where: { id },
    });

    return true;
  },

  /**
   * Sugestão rápida para buscar posts por termos (útil para selects/autocomplete)
   */
  async suggest(tenantId, term, limit = 10) {
    if (!term) return [];
    const take = Math.min(25, Math.max(1, Number(limit || 10)));

    return prisma.post.findMany({
      where: {
        tenantId,
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { caption: { contains: term, mode: 'insensitive' } },
        ],
      },
      take,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, caption: true },
    });
  },

  /**
   * Atualiza apenas o status do post (atalho para automações)
   */
  async updateStatus(tenantId, id, status, userId = null) {
    if (!status) return null;

    const existing = await this.getById(tenantId, id);
    if (!existing) return null;

    const { postStatus, approvalOverride } = normalizePostStatusInput(status);

    if (existing.status === postStatus && !approvalOverride) return existing;

    const statusUpdate = {
      status: postStatus,
    };
    if (postStatus === 'PENDING_APPROVAL') {
      statusUpdate.clientFeedback = null;
    }

    const updated = await prisma.post.update({
      where: { id },
      data: statusUpdate,
    });

    try {
      await syncApprovalWithPostStatus(tenantId, updated, postStatus, userId, approvalOverride);
    } catch (syncErr) {
      console.error('syncApprovalWithPostStatus(updateStatus) failed:', syncErr);
    }

    return updated;
  },

  /**
   * Solicita aprovação do cliente para um post.
   * - Garante Approval pendente + token público
   * - Atualiza status do post para PENDING_APPROVAL
   * - Enfileira job de WhatsApp (idempotente)
   */
  async requestApproval(tenantId, postId, options = {}) {
    const userId = options.userId || null;
    const forceNewLink = options.forceNewLink || false;

    const post = await prisma.post.findFirst({
      where: { id: postId, tenantId },
      include: { client: true },
    });

    if (!post) {
      throw new PostValidationError('Post não encontrado para este tenant', 'NOT_FOUND');
    }

    if (!post.clientId || !post.client) {
      throw new PostValidationError(
        'Selecione um cliente antes de solicitar aprovação',
        'MISSING_CLIENT',
      );
    }

    const client = post.client;
    const { approval, publicLink } = await getOrCreatePendingApproval(
      tenantId,
      post,
      userId,
      { forceNewToken: forceNewLink },
    );

    const shouldUpdateStatus = post.status !== 'PENDING_APPROVAL';
    let updatedPost = post;
    if (shouldUpdateStatus) {
      updatedPost = await prisma.post.update({
        where: { id: post.id },
        data: { status: 'PENDING_APPROVAL', clientFeedback: null },
      });
    }

    const whatsappInfo = {
      ready: Boolean(client.whatsappOptIn && client.whatsappNumberE164),
      alreadySent: Boolean(updatedPost.whatsappSentAt),
      number: client.whatsappNumberE164 || null,
      enqueued: false,
      jobId: null,
    };

    if (!whatsappInfo.ready) {
      whatsappInfo.skippedReason = client.whatsappOptIn
        ? 'missing_number'
        : 'client_opt_out';
    } else if (whatsappInfo.alreadySent) {
      whatsappInfo.skippedReason = 'already_sent';
    } else {
      const integration = await whatsappCloud.getAgencyWhatsAppIntegration(tenantId);
      if (!integration || integration.incomplete) {
        whatsappInfo.skippedReason = 'integration_missing';
        whatsappInfo.ready = false;
      } else {
        whatsappInfo.integrationId = integration.integration?.id || null;
      }
    }

    if (!whatsappInfo.alreadySent && whatsappInfo.ready && options.enqueueWhatsapp !== false) {
      const enqueueResult = await enqueueWhatsappApprovalJob({
        tenantId,
        postId: updatedPost.id,
        clientId: client.id,
        approvalId: approval.id,
        publicToken: publicLink?.token || null,
      });
      whatsappInfo.enqueued = enqueueResult.queued;
      whatsappInfo.jobId = enqueueResult.jobId;
    }

    const approvalUrl = buildApprovalLink(publicLink?.token);

    return {
      ok: true,
      postId: updatedPost.id,
      clientId: client.id,
      approvalId: approval.id,
      status: updatedPost.status,
      publicToken: publicLink?.token || null,
      publicTokenExpiresAt: publicLink?.expiresAt || null,
      approvalUrl,
      whatsapp: whatsappInfo,
    };
  },

  async requestChanges(tenantId, postId, note, userId = null) {
    const feedback = sanitizeString(note);
    if (!feedback || feedback.length < 3) {
      throw new PostValidationError(
        'Descreva o ajuste desejado com pelo menos 3 caracteres',
        'INVALID_FEEDBACK'
      );
    }

    const existing = await prisma.post.findFirst({
      where: { id: postId, tenantId },
    });
    if (!existing) return null;

    const latestApproval = await prisma.approval.findFirst({
      where: { tenantId, postId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (latestApproval) {
      const [approvalResult, postResult] = await prisma.$transaction([
        prisma.approval.update({
          where: { id: latestApproval.id },
          data: {
            status: 'REJECTED',
            notes: feedback,
            approverId: userId || latestApproval.approverId || null,
          },
        }),
        prisma.post.update({
          where: { id: postId },
          data: {
            clientFeedback: feedback,
            status: 'DRAFT',
          },
        }),
      ]);

      return { ...postResult, approval: approvalResult };
    }

    return prisma.post.update({
      where: { id: postId },
      data: {
        clientFeedback: feedback,
        status: 'DRAFT',
      },
    });
  },
};

module.exports.PostValidationError = PostValidationError;
