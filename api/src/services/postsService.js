// api/src/services/postsService.js
// Service para CRUD e operações úteis sobre posts (escopado por tenant)

const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');
const approvalsService = require('./approvalsService');
const { publishPost } = require('./postPublisher');
const metaSocialService = require('./metaSocialService');
const { decrypt } = require('../utils/crypto');
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

function resolveIntegrationIdFromPost(post) {
  if (!post) return null;
  const meta = isPlainObject(post.metadata) ? post.metadata : {};
  return (
    sanitizeString(meta.integrationId || meta.integration_id) ||
    sanitizeString(post.integrationId || post.integration_id) ||
    null
  );
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

const POST_KIND_VALUES = new Set(['feed', 'story', 'reel']);

function normalizePostKind(value) {
  const normalized = sanitizeString(value);
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  return POST_KIND_VALUES.has(lower) ? lower : null;
}

function normalizeStorySchedule(value) {
  if (!isPlainObject(value)) return null;
  const next = {};

  if (value.enabled !== undefined) next.enabled = Boolean(value.enabled);
  if (value.startDate !== undefined) next.startDate = sanitizeString(value.startDate);
  if (value.endDate !== undefined) next.endDate = sanitizeString(value.endDate);
  if (value.time !== undefined) next.time = sanitizeString(value.time);
  if (value.timezone !== undefined) next.timezone = sanitizeString(value.timezone);
  if (Array.isArray(value.weekdays)) {
    const weekdays = value.weekdays
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (weekdays.length) next.weekdays = Array.from(new Set(weekdays));
  }

  return Object.keys(next).length ? next : null;
}

function applyPostContentMetadata(base, data = {}) {
  const next = base ? { ...base } : {};
  const hasPostKind = data.postKind !== undefined || data.post_kind !== undefined;
  const hasStorySchedule =
    data.storySchedule !== undefined ||
    data.story_schedule !== undefined ||
    data.storyRecurrence !== undefined ||
    data.story_recurrence !== undefined;

  if (hasPostKind) {
    const value = normalizePostKind(data.postKind || data.post_kind);
    if (value) next.postKind = value;
    else delete next.postKind;
  }

  if (hasStorySchedule) {
    const raw =
      data.storySchedule ||
      data.story_schedule ||
      data.storyRecurrence ||
      data.story_recurrence;
    const value = normalizeStorySchedule(raw);
    if (value) next.storySchedule = value;
    else delete next.storySchedule;
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

  const hasContentFields =
    data.postKind !== undefined ||
    data.post_kind !== undefined ||
    data.storySchedule !== undefined ||
    data.story_schedule !== undefined ||
    data.storyRecurrence !== undefined ||
    data.story_recurrence !== undefined;

  if (!base && !hasIntegrationFields && !hasContentFields) return null;
  const merged = base ? { ...base } : {};
  const withIntegration = applyIntegrationMetadata(merged, data);
  return applyPostContentMetadata(withIntegration, data);
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

  const hasContentFields =
    data.postKind !== undefined ||
    data.post_kind !== undefined ||
    data.storySchedule !== undefined ||
    data.story_schedule !== undefined ||
    data.storyRecurrence !== undefined ||
    data.story_recurrence !== undefined;

  if (!patch && !hasIntegrationFields && !hasContentFields) {
    return { hasUpdate: false, metadata: null };
  }

  const base = isPlainObject(existingMetadata) ? { ...existingMetadata } : {};
  const merged = patch ? { ...base, ...patch } : base;
  const withIntegration = applyIntegrationMetadata(merged, data);
  const next = applyPostContentMetadata(withIntegration, data);

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

const WORKFLOW_STATUS_ALIASES = {
  CONTENT: 'IDEA',
  INTERNAL_APPROVAL: 'IDEA',
  CLIENT_APPROVAL: 'PENDING_APPROVAL',
  CHANGES: 'DRAFT',
  PUBLISHING: 'APPROVED',
  SCHEDULING: 'APPROVED',
  DONE: 'PUBLISHED',
  PRODUCTION: 'IDEA',
  EDITING: 'IDEA',
};

const WORKFLOW_STATUS_KEYS = new Set([
  'DRAFT',
  'CONTENT',
  'INTERNAL_APPROVAL',
  'CLIENT_APPROVAL',
  'CHANGES',
  'PUBLISHING',
  'SCHEDULING',
  'SCHEDULED',
  'DONE',
  'FAILED',
]);

const WORKFLOW_STATUS_ORDER = [
  'DRAFT',
  'CONTENT',
  'INTERNAL_APPROVAL',
  'CLIENT_APPROVAL',
  'CHANGES',
  'PUBLISHING',
  'SCHEDULING',
  'SCHEDULED',
  'DONE',
  'FAILED',
];

const LEGACY_STATUS_ALIASES = {
  IDEA: 'CONTENT',
  PRODUCTION: 'CONTENT',
  EDITING: 'INTERNAL_APPROVAL',
  PENDING_APPROVAL: 'CLIENT_APPROVAL',
  APPROVED: 'SCHEDULING',
  SCHEDULED: 'SCHEDULED',
  PUBLISHED: 'DONE',
  ARCHIVED: 'DONE',
  FAILED: 'DONE',
  CANCELLED: 'DONE',
};

const POST_SUMMARY_SELECT = {
  id: true,
  title: true,
  caption: true,
  mediaType: true,
  platform: true,
  status: true,
  scheduledDate: true,
  publishedDate: true,
  createdAt: true,
  clientId: true,
  metadata: true,
  clientFeedback: true,
};

function normalizePostStatusInput(inputStatus) {
  const raw = sanitizeString(inputStatus);
  if (!raw) return { postStatus: 'DRAFT', approvalOverride: null, workflowStatus: null };

  const normalized = raw.replace(/\s+/g, '_').toUpperCase();

  // Se o front mandar "REJECTED", não existe no PostStatus -> vira DRAFT + override no approval
  if (normalized === 'REJECTED') {
    return { postStatus: 'DRAFT', approvalOverride: 'REJECTED', workflowStatus: null };
  }

  const mapped = WORKFLOW_STATUS_ALIASES[normalized] || normalized;
  if (!POST_STATUSES.has(mapped)) {
    // Evita quebrar Prisma por enum inválido
    return { postStatus: 'DRAFT', approvalOverride: null, workflowStatus: null };
  }

  const workflowStatus = WORKFLOW_STATUS_KEYS.has(normalized) ? normalized : null;
  return { postStatus: mapped, approvalOverride: null, workflowStatus };
}

function normalizePostStatusFilterValue(inputStatus) {
  const raw = sanitizeString(inputStatus);
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, '_').toUpperCase();
  if (normalized === 'REJECTED') return 'DRAFT';
  const mapped = WORKFLOW_STATUS_ALIASES[normalized] || normalized;
  if (!POST_STATUSES.has(mapped)) return null;
  return mapped;
}

function normalizeWorkflowStatus(value) {
  if (!value) return null;
  const raw = String(value).trim().replace(/\s+/g, '_').toUpperCase();
  if (WORKFLOW_STATUS_KEYS.has(raw)) return raw;
  if (LEGACY_STATUS_ALIASES[raw]) return LEGACY_STATUS_ALIASES[raw];
  return null;
}

function resolveWorkflowStatusFromPost(post) {
  const explicit = normalizeWorkflowStatus(post?.metadata?.workflowStatus);
  if (explicit) return explicit;

  const base = normalizeWorkflowStatus(post?.status);
  if (base === 'DRAFT') {
    const feedback = sanitizeString(post?.clientFeedback || post?.client_feedback);
    return feedback ? 'CHANGES' : 'DRAFT';
  }

  return base || 'DRAFT';
}

function resolvePostDate(post) {
  return (
    post?.scheduledDate ||
    post?.publishedDate ||
    post?.createdAt ||
    null
  );
}

function buildDateRangeFilter(startDate, endDate) {
  const start = toDateOrNull(startDate);
  const end = toDateOrNull(endDate);
  if (!start && !end) return null;

  const range = {};
  if (start) range.gte = start;
  if (end) range.lte = end;

  return {
    OR: [
      { scheduledDate: range },
      { scheduledDate: null, publishedDate: range },
      { scheduledDate: null, publishedDate: null, createdAt: range },
    ],
  };
}

function normalizeStatusFilters(rawStatus) {
  if (!rawStatus) return [];
  const rawList = Array.isArray(rawStatus)
    ? rawStatus
    : String(rawStatus).split(',').map((value) => value.trim()).filter(Boolean);

  const normalized = rawList
    .map((value) => normalizeWorkflowStatus(value))
    .filter(Boolean);

  return normalized;
}

function buildPostsWhere(tenantId, opts = {}) {
  const where = { tenantId };
  const andFilters = [];

  if (opts.clientId) {
    andFilters.push({ clientId: opts.clientId });
  }

  if (opts.q) {
    andFilters.push({
      OR: [
        { title: { contains: opts.q, mode: 'insensitive' } },
        { caption: { contains: opts.q, mode: 'insensitive' } },
        { content: { contains: opts.q, mode: 'insensitive' } },
        { client: { name: { contains: opts.q, mode: 'insensitive' } } },
      ],
    });
  }

  const dateFilter = buildDateRangeFilter(opts.startDate, opts.endDate);
  if (dateFilter) andFilters.push(dateFilter);

  if (andFilters.length) {
    where.AND = andFilters;
  }

  return where;
}

function applyWorkflowStatusFilter(items, statusFilters) {
  if (!statusFilters || statusFilters.length === 0) return items;
  const allowed = new Set(statusFilters);
  return (items || []).filter((post) => allowed.has(resolveWorkflowStatusFromPost(post)));
}

function mapPostSummary(post) {
  if (!post) return null;
  return {
    id: post.id,
    title: post.title,
    caption: post.caption,
    mediaType: post.mediaType,
    platform: post.platform,
    status: post.status,
    scheduledDate: post.scheduledDate,
    publishedDate: post.publishedDate,
    createdAt: post.createdAt,
    clientId: post.clientId,
    metadata: post.metadata,
    clientFeedback: post.clientFeedback,
  };
}

function mergeWorkflowStatus(metadata, workflowStatus) {
  if (!workflowStatus) return metadata;
  const base = isPlainObject(metadata) ? { ...metadata } : {};
  base.workflowStatus = workflowStatus;
  return base;
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
      postVersion: Number(post.version || 1),
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
      postVersion: Number(post.version || latestPending.postVersion || 1),
      resolvedAt: new Date(),
      resolvedSource: 'INTERNAL',
      resolvedByPhone: null,
    },
  });
}

async function getOrCreatePendingApproval(tenantId, post, userId, { forceNewToken = false } = {}) {
  if (!post) return null;
  let createdNew = false;

  let approval = await prisma.approval.findFirst({
    where: { tenantId, postId: post.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  if (!approval) {
    createdNew = true;
    approval = await prisma.approval.create({
      data: {
        tenantId,
        postId: post.id,
        status: 'PENDING',
        notes: post.caption || post.content || null,
        requesterId: userId || null,
        postVersion: Number(post.version || 1),
      },
    });
  }

  const ttlHours = Math.max(1, APPROVAL_LINK_TTL_DAYS * 24);
  const publicLink = await approvalsService.getOrCreatePublicLink(tenantId, approval.id, {
    forceNew: forceNewToken,
    ttlHours,
  });

  return { approval, publicLink, createdNew };
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
    const { status, clientId, q, startDate, endDate } = opts;

    const page = Math.max(1, Number(opts.page || 1));
    const perPage = Math.min(100, Math.max(1, Number(opts.perPage || 50)));

    const where = buildPostsWhere(tenantId, {
      clientId,
      q,
      startDate,
      endDate,
    });

    if (status) {
      const rawList = Array.isArray(status)
        ? status
        : String(status).split(',').map((value) => value.trim()).filter(Boolean);
      const normalizedList = rawList
        .map((value) => normalizePostStatusFilterValue(value))
        .filter(Boolean);
      if (normalizedList.length === 1) {
        where.status = normalizedList[0];
      } else if (normalizedList.length > 1) {
        where.status = { in: normalizedList };
      }
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
   * Lista posts agrupados por status de workflow (Kanban)
   */
  async listKanban(tenantId, opts = {}) {
    const where = buildPostsWhere(tenantId, opts);

    const items = await prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: POST_SUMMARY_SELECT,
    });

    const statusFilters = normalizeStatusFilters(opts.status);
    const filtered = applyWorkflowStatusFilter(items, statusFilters);

    const columns = {};
    WORKFLOW_STATUS_ORDER.forEach((key) => {
      columns[key] = { count: 0, items: [] };
    });

    filtered.forEach((post) => {
      const statusKey = resolveWorkflowStatusFromPost(post);
      if (!columns[statusKey]) {
        columns[statusKey] = { count: 0, items: [] };
      }
      columns[statusKey].items.push(mapPostSummary(post));
      columns[statusKey].count += 1;
    });

    return {
      columns,
      totals: { all: filtered.length },
    };
  },

  /**
   * Lista posts para visualizacao de calendario (mensal/semanal)
   */
  async listCalendar(tenantId, opts = {}) {
    const where = buildPostsWhere(tenantId, opts);

    const items = await prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: POST_SUMMARY_SELECT,
    });

    const statusFilters = normalizeStatusFilters(opts.status);
    const filtered = applyWorkflowStatusFilter(items, statusFilters);

    return {
      items: filtered.map((post) => ({
        ...mapPostSummary(post),
        date: resolvePostDate(post),
      })),
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
    const integrationId =
      sanitizeString(data.integrationId || data.integration_id) ||
      sanitizeString(metadata?.integrationId || metadata?.integration_id);

    if (!title) throw new PostValidationError('Título é obrigatório');
    if (!clientId) throw new PostValidationError('Selecione um cliente antes de salvar o post');
    if (!mediaUrl) throw new PostValidationError('Envie uma mídia antes de salvar o post');

    const { postStatus, approvalOverride, workflowStatus } = normalizePostStatusInput(
      data.status || 'DRAFT',
    );
    const metadataWithStatus = mergeWorkflowStatus(metadata, workflowStatus);

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
      metadata: metadataWithStatus,
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

      const shouldPublishNow = created.status === 'PUBLISHED' && !created.scheduledDate;
      if (shouldPublishNow) {
        if (!integrationId) {
          throw new PostValidationError('Selecione uma conta conectada antes de publicar.');
        }
        try {
          const result = await publishPost(created);
          const metadataSafe = isPlainObject(created.metadata) ? { ...created.metadata } : {};
          metadataSafe.publish = {
            provider: result.provider,
            platform: result.platform,
            externalId: result.externalId || null,
            publishedAt: new Date().toISOString(),
          };
          metadataSafe.workflowStatus = 'DONE';
          const updated = await prisma.post.update({
            where: { id: created.id },
            data: {
              status: 'PUBLISHED',
              publishedDate: new Date(),
              externalId: result.externalId || created.externalId || null,
              metadata: metadataSafe,
            },
          });
          return updated;
        } catch (err) {
          const metadataSafe = isPlainObject(created.metadata) ? { ...created.metadata } : {};
          metadataSafe.publishError = {
            message: err?.message || 'Publish failed',
            at: new Date().toISOString(),
          };
          metadataSafe.workflowStatus = 'FAILED';
          await prisma.post.update({
            where: { id: created.id },
            data: {
              status: 'FAILED',
              metadata: metadataSafe,
            },
          });
          throw new PostValidationError(
            err?.message || 'Erro ao publicar o post',
            'PUBLISH_FAILED',
          );
        }
      }

      return created;
    } catch (err) {
      if (err instanceof PostValidationError) {
        throw err;
      }
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
    let workflowStatus = null;

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
      workflowStatus = norm.workflowStatus;
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
    if (workflowStatus) {
      updateData.metadata = mergeWorkflowStatus(
        metadataUpdate.hasUpdate ? metadataUpdate.metadata : existing.metadata,
        workflowStatus,
      );
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

    if (statusChanged && updated.status === 'PUBLISHED' && !updated.scheduledDate) {
      const integrationId =
        sanitizeString(data.integrationId || data.integration_id) ||
        sanitizeString(updated.metadata?.integrationId || updated.metadata?.integration_id);
      if (!integrationId) {
        throw new PostValidationError('Selecione uma conta conectada antes de publicar.');
      }
      try {
        const result = await publishPost(updated);
        const metadataSafe = isPlainObject(updated.metadata) ? { ...updated.metadata } : {};
        metadataSafe.publish = {
          provider: result.provider,
          platform: result.platform,
          externalId: result.externalId || null,
          publishedAt: new Date().toISOString(),
        };
        metadataSafe.workflowStatus = 'DONE';
        return await prisma.post.update({
          where: { id },
          data: {
            status: 'PUBLISHED',
            publishedDate: new Date(),
            externalId: result.externalId || updated.externalId || null,
            metadata: metadataSafe,
          },
        });
      } catch (err) {
        const metadataSafe = isPlainObject(updated.metadata) ? { ...updated.metadata } : {};
        metadataSafe.publishError = {
          message: err?.message || 'Publish failed',
          at: new Date().toISOString(),
        };
        metadataSafe.workflowStatus = 'FAILED';
        await prisma.post.update({
          where: { id },
          data: {
            status: 'FAILED',
            metadata: metadataSafe,
          },
        });
        throw new PostValidationError(
          err?.message || 'Erro ao publicar o post',
          'PUBLISH_FAILED',
        );
      }
    }

    return updated;
  },

  /**
   * Remove post (dentro do tenant)
   * @param {String} tenantId
   * @param {String} id
   */
  async remove(tenantId, id, options = {}) {
    const existing = await this.getById(tenantId, id);
    if (!existing) return false;

    if (options.localOnly) {
      await prisma.post.delete({ where: { id } });
      return true;
    }

    const integrationId = resolveIntegrationIdFromPost(existing);
    const externalId = sanitizeString(existing.externalId);
    const platform = sanitizeString(existing.platform);
    if (integrationId && externalId) {
      const integration = await prisma.integration.findFirst({
        where: { id: integrationId, tenantId },
      });
      if (!integration) {
        throw new PostValidationError('Integracao nao encontrada para remover o post', 'INTEGRATION_NOT_FOUND');
      }
      if (String(integration.provider || '').toUpperCase() === 'META') {
        let accessToken = null;
        if (integration.accessTokenEncrypted) {
          try {
            accessToken = decrypt(integration.accessTokenEncrypted);
          } catch (_) {
            accessToken = null;
          }
        }
        if (!accessToken && integration.accessToken) {
          accessToken = integration.accessToken;
        }
        if (!accessToken) {
          throw new PostValidationError('Token da Meta nao encontrado para excluir o post', 'META_TOKEN_MISSING');
        }

        // Para Facebook, usar page token quando houver pageId
        const settings = isPlainObject(integration.settings) ? integration.settings : {};
        const metaAccounts = isPlainObject(existing.metadata?.platformAccounts)
          ? existing.metadata.platformAccounts
          : {};
        const pageId =
          (platform === 'facebook' && (metaAccounts.facebook || metaAccounts.pageId)) ||
          settings.pageId ||
          settings.page_id ||
          null;
        const effectiveToken = pageId
          ? await metaSocialService.resolvePageAccessToken(pageId, accessToken)
          : accessToken;

        try {
          await metaSocialService.graphDelete(String(externalId), {
            access_token: effectiveToken,
          });
        } catch (err) {
          throw new PostValidationError(
            err?.message || 'Erro ao remover post na rede social',
            'NETWORK_DELETE_FAILED',
          );
        }
      }
    }

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

    const { postStatus, approvalOverride, workflowStatus } =
      normalizePostStatusInput(status);

    if (existing.status === postStatus && !approvalOverride) return existing;

    const statusUpdate = {
      status: postStatus,
    };
    if (workflowStatus) {
      statusUpdate.metadata = mergeWorkflowStatus(existing.metadata, workflowStatus);
    }
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
    const shouldEnqueueWhatsapp = options.enqueueWhatsapp !== false;
    const requestId = options.requestId || null;

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
    const { approval, publicLink, createdNew } = await getOrCreatePendingApproval(
      tenantId,
      post,
      userId,
      { forceNewToken: forceNewLink },
    );

    const shouldUpdateStatus = post.status !== 'PENDING_APPROVAL' || createdNew;
    let updatedPost = post;
    if (shouldUpdateStatus) {
      const nextMetadata = isPlainObject(post.metadata) ? { ...post.metadata } : {};
      const currentWa = isPlainObject(nextMetadata.whatsappApproval)
        ? { ...nextMetadata.whatsappApproval }
        : {};
      delete currentWa.pendingInput;
      currentWa.approvalId = approval.id;
      nextMetadata.whatsappApproval = currentWa;
      nextMetadata.workflowStatus = 'CLIENT_APPROVAL';

      updatedPost = await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'PENDING_APPROVAL',
          clientFeedback: null,
          metadata: nextMetadata,
          ...(createdNew
            ? {
                sentAt: null,
                sentMethod: null,
                whatsappSentAt: null,
                whatsappMessageId: null,
              }
            : {}),
        },
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
    } else if (shouldEnqueueWhatsapp) {
      try {
        const integration = await whatsappCloud.getAgencyWhatsAppIntegration(tenantId);
        if (!integration || integration.incomplete) {
          whatsappInfo.skippedReason = 'integration_missing';
          whatsappInfo.ready = false;
        } else {
          whatsappInfo.integrationId = integration.integration?.id || null;
        }
      } catch (err) {
        const integrationError = err?.message || 'integration_check_failed';
        whatsappInfo.skippedReason = 'integration_invalid';
        whatsappInfo.ready = false;
        whatsappInfo.integrationError = integrationError;
        console.error('[postsService.requestApproval] WhatsApp integration precheck failed', {
          requestId,
          tenantId,
          postId: updatedPost.id,
          approvalId: approval.id,
          code: 'INTEGRATION_INVALID',
          message: integrationError,
        });
      }
    } else {
      whatsappInfo.precheckSkipped = true;
    }

    if (!whatsappInfo.alreadySent && whatsappInfo.ready && shouldEnqueueWhatsapp) {
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

  async getApprovalHistory(tenantId, postId) {
    if (!postId) return null;

    const post = await prisma.post.findFirst({
      where: { id: postId, tenantId },
      select: {
        id: true,
        title: true,
        status: true,
        version: true,
        clientFeedback: true,
        createdAt: true,
        updatedAt: true,
        whatsappMessageId: true,
        metadata: true,
      },
    });
    if (!post) return null;

    const [approvals, waLogs] = await Promise.all([
      prisma.approval.findMany({
        where: { tenantId, postId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.whatsAppMessageLog.findMany({
        where: { tenantId, postId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const approvalIdSet = new Set(approvals.map((item) => item.id));
    const approvalIds = Array.from(approvalIdSet);
    const auditWhere = {
      tenantId,
      OR: [{ resource: 'post', resourceId: postId }],
    };
    if (approvalIds.length) {
      auditWhere.OR.push({
        resource: 'approval',
        resourceId: { in: approvalIds },
      });
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: auditWhere,
      orderBy: { createdAt: 'asc' },
    });

    const filteredAuditLogs = auditLogs.filter((entry) => {
      if (entry.resource === 'post' && entry.resourceId === postId) return true;
      if (entry.resource === 'approval' && approvalIdSet.has(entry.resourceId || '')) return true;
      const meta = isPlainObject(entry.meta) ? entry.meta : null;
      return meta?.postId === postId || (meta?.approvalId && approvalIdSet.has(meta.approvalId));
    });

    const events = [];
    for (const approval of approvals) {
      events.push({
        type: 'APPROVAL_REQUESTED',
        channel: 'KONDOR',
        at: approval.createdAt,
        approvalId: approval.id,
        postVersion: approval.postVersion || 1,
        status: approval.status,
        comment: approval.notes || null,
      });

      if (approval.status !== 'PENDING') {
        events.push({
          type: approval.status === 'APPROVED' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
          channel:
            approval.resolvedSource && String(approval.resolvedSource).startsWith('WHATSAPP')
              ? 'WHATSAPP'
              : approval.resolvedSource === 'PUBLIC_LINK'
                ? 'PUBLIC_LINK'
                : 'KONDOR',
          at: approval.resolvedAt || approval.updatedAt,
          approvalId: approval.id,
          postVersion: approval.postVersion || 1,
          status: approval.status,
          comment: approval.notes || null,
          resolvedSource: approval.resolvedSource || null,
          resolvedByPhone: approval.resolvedByPhone || null,
        });
      }
    }

    for (const log of waLogs) {
      events.push({
        type: log.direction === 'OUTBOUND' ? 'WHATSAPP_OUTBOUND' : 'WHATSAPP_INBOUND',
        channel: 'WHATSAPP',
        at: log.createdAt,
        waMessageId: log.waMessageId || null,
        direction: log.direction,
        payload: log.payload || null,
      });
    }

    for (const log of filteredAuditLogs) {
      events.push({
        type: 'AUDIT_EVENT',
        channel: 'KONDOR',
        at: log.createdAt,
        action: log.action,
        resource: log.resource || null,
        resourceId: log.resourceId || null,
        meta: log.meta || null,
      });
    }

    events.sort((a, b) => {
      const aDate = new Date(a.at || 0).getTime();
      const bDate = new Date(b.at || 0).getTime();
      return aDate - bDate;
    });

    return {
      post: {
        id: post.id,
        title: post.title,
        status: post.status,
        version: post.version,
        clientFeedback: post.clientFeedback || null,
        whatsappMessageId: post.whatsappMessageId || null,
        metadata: post.metadata || null,
      },
      approvals,
      whatsappLogs: waLogs,
      auditLogs: filteredAuditLogs,
      timeline: events,
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
            postVersion: Number(existing.version || latestApproval.postVersion || 1),
            resolvedAt: new Date(),
            resolvedSource: 'INTERNAL',
            resolvedByPhone: null,
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
module.exports._internal = {
  normalizeWorkflowStatus,
  resolveWorkflowStatusFromPost,
  normalizeStatusFilters,
  applyWorkflowStatusFilter,
  resolvePostDate,
  buildDateRangeFilter,
  mapPostSummary,
};
