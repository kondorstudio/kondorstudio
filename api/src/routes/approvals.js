// Rotas para workflow de approvals (posts).
// Integra com Automation Engine para disparar automações (WhatsApp, etc).
// Protegido por auth + tenant (req.user e req.tenantId esperados).
//
// FASE 3 — CONSISTÊNCIA APPROVAL ↔ POST
// - Sempre que o status da Approval mudar (especialmente para APPROVED),
//   refletimos isso também no Post associado (status + clientFeedback quando houver).

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const { prisma } = require('../prisma');
const automationEngine = require('../services/automationEngine');
const approvalsService = require('../services/approvalsService');

// aplicar auth + tenant
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * Helper para obter tenantId de forma segura
 */
function getTenantId(req) {
  return req.tenantId || (req.tenant && req.tenant.id) || null;
}

/**
 * Helper: carrega contexto completo da approval
 * - approval
 * - post
 * - project
 * - client
 */
async function loadApprovalContext(tenantId, approvalId) {
  if (!tenantId || !approvalId) return null;

  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, tenantId },
    include: {
      post: {
        include: {
          project: {
            include: {
              client: true,
            },
          },
        },
      },
    },
  });

  if (!approval) return null;

  const post = approval.post || null;
  const project = post && post.project ? post.project : null;
  const client = project && project.client ? project.client : null;

  return { approval, post, project, client };
}

/**
 * GET /approvals
 * Lista approvals do tenant com filtros básicos.
 * Query:
 *  - status?
 *  - postId?
 *  - page? (default 1)
 *  - perPage? (default 50)
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado' });

    const {
      status,
      postId,
      page = 1,
      perPage = 50,
    } = req.query || {};

    const pageNumber = Math.max(Number(page) || 1, 1);
    const perPageNumber = Math.min(Number(perPage) || 50, 100);
    const skip = (pageNumber - 1) * perPageNumber;

    const where = { tenantId };
    if (status) where.status = status;
    if (postId) where.postId = postId;

    const [items, total] = await Promise.all([
      prisma.approval.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPageNumber,
      }),
      prisma.approval.count({
        where,
      }),
    ]);

    return res.json({
      items,
      total,
      page: pageNumber,
      perPage: perPageNumber,
    });
  } catch (err) {
    console.error('GET /approvals error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao listar approvals' });
  }
});

/**
 * POST /approvals
 * Cria uma approval para um post.
 * Body:
 *  - postId (obrigatório)
 *  - notes? (string)
 */
router.post('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado' });

    const { postId, notes } = req.body || {};
    if (!postId) return res.status(400).json({ error: "Campo 'postId' é obrigatório." });

    // valida se o post pertence ao tenant
    const post = await prisma.post.findFirst({
      where: { id: postId, tenantId },
      include: {
        project: {
          include: { client: true },
        },
      },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post não encontrado para este tenant' });
    }

    const approval = await prisma.approval.create({
      data: {
        tenantId,
        postId,
        notes: notes || null,
        status: 'PENDING',
      },
    });

    // Opcional: se você quiser disparar automação quando cria "PENDING", use evento 'post.pending_approval'
    // Por enquanto deixamos só como base para extensões futuras.

    return res.status(201).json(approval);
  } catch (err) {
    console.error('POST /approvals error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao criar approval' });
  }
});

/**
 * POST /approvals/:id/status
 * Atualiza o status de uma approval e dispara automações se necessário.
 * A PARTIR DA FASE 3:
 *  - Mantém Approval como FONTE DA VERDADE
 *  - Reflete status e clientFeedback no Post associado (quando existir).
 *
 * Body:
 *  - status (PENDING | APPROVED | REJECTED)
 *  - notes? (comentário opcional para approval)
 *  - clientFeedback? ou client_feedback? (comentário para o post)
 */
router.post('/:id/status', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado' });

    const id = req.params.id;
    const body = req.body || {};
    const { status, notes } = body;

    if (!status) {
      return res.status(400).json({ error: "Campo 'status' é obrigatório." });
    }

    // suportar clientFeedback/client_feedback vindo do portal
    const clientFeedback =
      body.clientFeedback !== undefined
        ? body.clientFeedback
        : body.client_feedback !== undefined
        ? body.client_feedback
        : undefined;

    // carrega contexto atual (approval + post + client)
    const ctx = await loadApprovalContext(tenantId, id);
    if (!ctx || !ctx.approval) {
      return res.status(404).json({ error: 'Approval não encontrado' });
    }

    const { approval, post, client } = ctx;

    const approverId = req.user && req.user.id ? req.user.id : approval.approverId || null;

    // Monta dados de update da approval
    const approvalUpdateData = {
      status,
      approverId,
    };

    if (typeof notes === 'string') {
      approvalUpdateData.notes = notes;
    } else if (approval.notes !== undefined) {
      approvalUpdateData.notes = approval.notes;
    }

    let updatedApproval = null;
    let updatedPost = null;

    if (post) {
      // Se existir um Post vinculado, refletimos o status da approval nele também.
      const postUpdateData = {};

      // Regra principal de consistência:
      // - APPROVED -> Post.status = 'APPROVED' (ou equivalente no seu enum)
      // - REJECTED -> aqui, opcionalmente, podemos trazer o Post para 'DRAFT'
      if (status === 'APPROVED') {
        postUpdateData.status = post.scheduledDate ? 'SCHEDULED' : 'APPROVED';
      } else if (status === 'REJECTED') {
        const hasFeedback =
          clientFeedback !== undefined && String(clientFeedback || '').trim().length > 0;
        postUpdateData.status = hasFeedback ? 'DRAFT' : 'CANCELLED';
      }

      if (clientFeedback !== undefined) {
        postUpdateData.clientFeedback = clientFeedback;
      }

      // Se por acaso não houver nada para atualizar no Post (ex.: status inválido),
      // ainda assim atualizamos a approval. Por isso checamos se há campos no postUpdateData.
      if (Object.keys(postUpdateData).length > 0) {
        const [approvalResult, postResult] = await prisma.$transaction([
          prisma.approval.update({
            where: { id: approval.id },
            data: approvalUpdateData,
          }),
          prisma.post.update({
            where: { id: post.id },
            data: postUpdateData,
          }),
        ]);

        updatedApproval = approvalResult;
        updatedPost = postResult;
      } else {
        // Atualiza apenas a approval
        updatedApproval = await prisma.approval.update({
          where: { id: approval.id },
          data: approvalUpdateData,
        });
        updatedPost = post;
      }
    } else {
      // Approval sem post vinculado: apenas atualizamos a approval
      updatedApproval = await prisma.approval.update({
        where: { id: approval.id },
        data: approvalUpdateData,
      });
      updatedPost = null;
    }

    // Disparo de automação conforme status
    try {
      if (automationEngine && typeof automationEngine.evaluateEventAndEnqueue === 'function') {
        if (status === 'APPROVED') {
          const to =
            (client && client.phone) ||
            (client && client.contacts && client.contacts.whatsapp) ||
            null;

          await automationEngine.evaluateEventAndEnqueue(tenantId, {
            type: 'post.approved',
            payload: {
              approvalId: updatedApproval.id,
              postId: updatedPost ? updatedPost.id : post ? post.id : null,
              postTitle: updatedPost ? updatedPost.title : post ? post.title : null,
              clientId: client ? client.id : null,
              clientName: client ? client.name : null,
              clientPhone: to,
              source: 'internal_status_change',
            },
          });
        } else if (status === 'REJECTED') {
          await automationEngine.evaluateEventAndEnqueue(tenantId, {
            type: 'post.rejected',
            payload: {
              approvalId: updatedApproval.id,
              postId: updatedPost ? updatedPost.id : post ? post.id : null,
              postTitle: updatedPost ? updatedPost.title : post ? post.title : null,
              clientId: client ? client.id : null,
              clientName: client ? client.name : null,
              source: 'internal_status_change',
            },
          });
        }
      }
    } catch (automationErr) {
      console.error(
        'Erro ao disparar automação após mudança de status de approval:',
        automationErr && automationErr.stack ? automationErr.stack : automationErr,
      );
      // não quebramos o fluxo principal
    }

    return res.json({
      ok: true,
      approval: updatedApproval,
      post: updatedPost,
    });
  } catch (err) {
    console.error('POST /approvals/:id/status error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao atualizar status de approval' });
  }
});

/**
 * GET /approvals/:id/public-link
 *
 * Gera (ou reutiliza) um token público para approval e retorna:
 *  - token
 *  - expiresAt
 *  - url (montada com base na env PUBLIC_APP_URL ou PUBLIC_PORTAL_URL_BASE)
 *
 * Query params opcionais:
 *  - forceNew=true  -> força gerar um novo token mesmo que o atual ainda esteja válido
 *  - ttlHours=XX    -> TTL customizado (senão usa env APPROVAL_PUBLIC_LINK_TTL_HOURS ou 72h)
 */
router.get('/:id/public-link', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado' });

    const { id } = req.params;
    const { forceNew, ttlHours } = req.query || {};

    const link = await approvalsService.getOrCreatePublicLink(tenantId, id, {
      forceNew: String(forceNew).toLowerCase() === 'true',
      ttlHours: ttlHours != null ? Number(ttlHours) : undefined,
    });

    if (!link) {
      return res.status(404).json({ error: 'Approval não encontrado' });
    }

    const baseUrl =
      process.env.PUBLIC_APP_URL
      || process.env.PUBLIC_PORTAL_URL_BASE
      || process.env.APP_BASE_URL
      || '';

    const trimmedBase = baseUrl.replace(/\/+$/, '');
    const url = trimmedBase
      ? `${trimmedBase}/public/approvals/${link.token}`
      : `/public/approvals/${link.token}`;

    return res.json({
      ok: true,
      approvalId: link.approvalId,
      token: link.token,
      expiresAt: link.expiresAt,
      url,
    });
  } catch (err) {
    console.error('GET /approvals/:id/public-link error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao gerar link público de approval' });
  }
});

/**
 * GET /approvals/:id
 * Obtém uma approval específica (com post e client se precisar).
 *
 * IMPORTANTE: esta rota vem DEPOIS de /:id/public-link para não conflitar.
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado' });

    const id = req.params.id;

    const approval = await prisma.approval.findFirst({
      where: { id, tenantId },
      include: {
        post: {
          include: {
            project: {
              include: { client: true },
            },
          },
        },
      },
    });

    if (!approval) return res.status(404).json({ error: 'Approval não encontrado' });

    return res.json({ ok: true, approval });
  } catch (err) {
    console.error('GET /approvals/:id error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao obter approval' });
  }
});

module.exports = router;
