// Rotas públicas para aprovação de posts via link externo.
// NÃO usa authMiddleware nem tenantMiddleware.
// O token aqui é um identificador público da Approval (publicToken), distinto do id interno.
//
// Endpoints (montados em /api/public no server.js):
//  - GET  /api/public/approvals/:token
//  - POST /api/public/approvals/:token/confirm (alias /approve)
//  - POST /api/public/approvals/:token/reject
//  - POST /api/public/approvals/:token/request-changes
//
// Fluxo básico:
//  1) Cliente recebe link com o token da approval (ex.: https://api.kondor.com/api/public/approvals/TOKEN)
//  2) GET  -> retorna resumo do que está sendo aprovado (post + cliente)
//  3) POST -> marca como APPROVED e (AGORA) reflete no Post.status também, além de disparar automação.

const express = require('express');
const router = express.Router();

const { prisma } = require('../prisma');
let automationEngine = null;

try {
  // automationEngine é opcional: se não existir ou estiver quebrado, não impede a aprovação.
  // eslint-disable-next-line global-require
  automationEngine = require('../services/automationEngine');
} catch (e) {
  automationEngine = null;
}

/**
 * Rate limit simples em memória para rotas públicas de aprovação.
 *
 * Config via ENV (opcional):
 *  - PUBLIC_APPROVALS_RATE_WINDOW_MS (default: 60000 ms = 1 min)
 *  - PUBLIC_APPROVALS_RATE_MAX       (default: 30 req por IP por janela)
 */
const RATE_WINDOW_MS = Number(process.env.PUBLIC_APPROVALS_RATE_WINDOW_MS) || 60_000;
const RATE_MAX = Number(process.env.PUBLIC_APPROVALS_RATE_MAX) || 30;

// buckets: key = ip, value = { count, start }
const rateBuckets = new Map();
const MAX_BUCKETS = Number(process.env.PUBLIC_APPROVALS_RATE_MAX_KEYS || 10000);

function publicApprovalsRateLimit(req, res, next) {
  try {
    const ip =
      (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim())
      || req.ip
      || (req.connection && req.connection.remoteAddress)
      || 'unknown';

    const now = Date.now();
    const bucket = rateBuckets.get(ip) || { count: 0, start: now };

    // reseta janela se passou do tempo
    if (now - bucket.start > RATE_WINDOW_MS) {
      bucket.count = 0;
      bucket.start = now;
    }

    bucket.count += 1;
    rateBuckets.set(ip, bucket);

    if (rateBuckets.size > MAX_BUCKETS) {
      for (const [key, value] of rateBuckets.entries()) {
        if (now - value.start > RATE_WINDOW_MS) {
          rateBuckets.delete(key);
        }
        if (rateBuckets.size <= MAX_BUCKETS) break;
      }
    }

    if (bucket.count > RATE_MAX) {
      return res.status(429).json({
        error: 'Muitas requisições. Tente novamente em instantes.',
      });
    }

    return next();
  } catch (err) {
    // se der qualquer problema, não bloqueia a rota
    console.error('publicApprovalsRateLimit error:', err && err.stack ? err.stack : err);
    return next();
  }
}

// Aplica rate limit em todas as rotas públicas de approvals
router.use(publicApprovalsRateLimit);

/**
 * Carrega contexto da approval via token público:
 * - approval (somente se publicToken for válido e não expirado)
 * - post
 * - project
 * - client
 */
async function loadApprovalContext(token) {
  if (!token) return null;

  const now = new Date();

  const approval = await prisma.approval.findFirst({
    where: {
      publicToken: token,
      OR: [
        { publicTokenExpiresAt: null },
        { publicTokenExpiresAt: { gt: now } },
      ],
    },
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

function resolveApprovedPostStatus(post) {
  if (!post) return 'APPROVED';
  if (post.scheduledDate || post.scheduledAt) return 'SCHEDULED';
  return 'APPROVED';
}

function normalizeFeedback(input) {
  if (input === undefined || input === null) return null;
  const trimmed = String(input).trim();
  return trimmed ? trimmed : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * GET /api/public/approvals/:token
 * Retorna um snapshot seguro da approval para ser exibido em uma tela pública.
 */
router.get('/approvals/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const ctx = await loadApprovalContext(token);
    if (!ctx || !ctx.approval) {
      return res.status(404).json({ error: 'Approval não encontrada ou link expirado' });
    }

    const { approval, post, client } = ctx;

    return res.json({
      ok: true,
      approval: {
        id: approval.id,
        status: approval.status,
        notes: approval.notes || null,
        createdAt: approval.createdAt,
      },
      post: post
        ? {
            id: post.id,
            title: post.title,
            status: post.status,
            scheduledAt: post.scheduledDate || post.scheduledAt || null,
            scheduledDate: post.scheduledDate || post.scheduledAt || null,
            publishedAt: post.publishedDate || post.publishedAt || null,
            publishedDate: post.publishedDate || post.publishedAt || null,
            clientFeedback: post.clientFeedback || null,
            mediaUrl: post.mediaUrl || null,
            mediaType: post.mediaType || null,
            caption: post.caption || post.content || null,
            platform: post.platform || null,
          }
        : null,
      client: client
        ? {
            id: client.id,
            name: client.name,
          }
        : null,
    });
  } catch (err) {
    console.error('GET /public/approvals/:token error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao carregar approval pública' });
  }
});

router.post('/approvals/:token/confirm', approvePublic);
router.post('/approvals/:token/approve', approvePublic);

/**
 * POST /api/public/approvals/:token/reject
 *
 * Rejeita a approval (status = REJECTED) e marca o post como CANCELLED.
 * Body opcional:
 *  - notes (string)
 */
router.post('/approvals/:token/reject', async (req, res) => {
  try {
    const { token } = req.params;
    const ctx = await loadApprovalContext(token);
    if (!ctx || !ctx.approval) {
      return res.status(404).json({ error: 'Approval não encontrada ou link expirado' });
    }

    const { approval, post } = ctx;
    if (approval.status === 'REJECTED') {
      return res.json({ ok: true, status: approval.status, alreadyRejected: true });
    }

    if (approval.status !== 'PENDING') {
      return res.status(400).json({
        error: `Approval em estado inválido para rejeição: ${approval.status}`,
      });
    }

    const notes = normalizeFeedback(req.body?.notes || req.body?.note);

    if (post) {
      const [approvalResult, postResult] = await prisma.$transaction([
        prisma.approval.update({
          where: { id: approval.id },
          data: {
            status: 'REJECTED',
            notes: notes || approval.notes || null,
            postVersion: Number(post.version || approval.postVersion || 1),
            resolvedAt: new Date(),
            resolvedSource: 'PUBLIC_LINK',
            resolvedByPhone: null,
          },
        }),
        prisma.post.update({
          where: { id: post.id },
          data: {
            status: 'CANCELLED',
            clientFeedback: notes || post.clientFeedback || null,
            metadata: {
              ...(isPlainObject(post.metadata) ? post.metadata : {}),
              workflowStatus: 'DONE',
            },
          },
        }),
      ]);

      return res.json({ ok: true, approval: approvalResult, post: postResult });
    }

    const updatedApproval = await prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: 'REJECTED',
        notes: notes || approval.notes || null,
        postVersion: Number(post?.version || approval.postVersion || 1),
        resolvedAt: new Date(),
        resolvedSource: 'PUBLIC_LINK',
        resolvedByPhone: null,
      },
    });

    return res.json({ ok: true, approval: updatedApproval });
  } catch (err) {
    console.error('POST /public/approvals/:token/reject error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao rejeitar approval pública' });
  }
});

/**
 * POST /api/public/approvals/:token/request-changes
 *
 * Solicita ajustes no post (status DRAFT + feedback) e rejeita a approval.
 * Body:
 *  - message | note | clientFeedback
 */
router.post('/approvals/:token/request-changes', async (req, res) => {
  try {
    const { token } = req.params;
    const ctx = await loadApprovalContext(token);
    if (!ctx || !ctx.approval) {
      return res.status(404).json({ error: 'Approval não encontrada ou link expirado' });
    }

    const { approval, post } = ctx;
    if (!post) {
      return res.status(400).json({ error: 'Approval sem post vinculado' });
    }

    const note =
      normalizeFeedback(req.body?.clientFeedback) ||
      normalizeFeedback(req.body?.client_feedback) ||
      normalizeFeedback(req.body?.message) ||
      normalizeFeedback(req.body?.note);

    if (!note || note.length < 3) {
      return res.status(400).json({ error: 'Informe um motivo com pelo menos 3 caracteres' });
    }

    const [approvalResult, postResult] = await prisma.$transaction([
      prisma.approval.update({
        where: { id: approval.id },
        data: {
          status: 'REJECTED',
          notes: note,
          postVersion: Number(post.version || approval.postVersion || 1),
          resolvedAt: new Date(),
          resolvedSource: 'PUBLIC_LINK',
          resolvedByPhone: null,
        },
      }),
      prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'DRAFT',
          clientFeedback: note,
          metadata: {
            ...(isPlainObject(post.metadata) ? post.metadata : {}),
            workflowStatus: 'CHANGES',
          },
        },
      }),
    ]);

    return res.json({ ok: true, approval: approvalResult, post: postResult });
  } catch (err) {
    console.error(
      'POST /public/approvals/:token/request-changes error:',
      err && err.stack ? err.stack : err,
    );
    return res.status(500).json({ error: 'Erro ao solicitar ajustes na approval pública' });
  }
});

/**
 * POST /api/public/approvals/:token/confirm
 *
 * Aprova a approval (status = APPROVED) sem login.
 * A PARTIR DA FASE 3:
 *  - Atualiza também o Post.status = 'APPROVED'
 *  - Opcionalmente registra clientFeedback informado no body
 *  - Dispara automação (WhatsApp) via automationEngine.
 *
 * Body opcional:
 *  - clientFeedback ou client_feedback (string)
 */
async function approvePublic(req, res) {
  try {
    const { token } = req.params;

    const ctx = await loadApprovalContext(token);
    if (!ctx || !ctx.approval) {
      return res.status(404).json({ error: 'Approval não encontrada ou link expirado' });
    }

    const { approval, post, client } = ctx;

    // Se já estiver aprovada, não precisa fazer nada de novo
    if (approval.status === 'APPROVED') {
      return res.json({
        ok: true,
        status: approval.status,
        alreadyApproved: true,
      });
    }

    // Só permitimos aprovação se estiver PENDENTE; REJECTED não volta
    if (approval.status !== 'PENDING') {
      return res.status(400).json({
        error: `Approval em estado inválido para confirmação externa: ${approval.status}`,
      });
    }

    const body = req.body || {};
    const clientFeedbackRaw =
      body.clientFeedback !== undefined
        ? body.clientFeedback
        : body.client_feedback !== undefined
        ? body.client_feedback
        : undefined;
    const clientFeedback = normalizeFeedback(clientFeedbackRaw);

    // Atualiza approval + (se existir) post de forma consistente
    let updatedApproval = null;
    let updatedPost = null;

    if (post) {
      const postUpdateData = {
        status: resolveApprovedPostStatus(post),
      };

      if (clientFeedback !== undefined) {
        postUpdateData.clientFeedback = clientFeedback;
      }

      // Transaction: garantir consistência entre Approval e Post
      const [approvalResult, postResult] = await prisma.$transaction([
        prisma.approval.update({
          where: { id: approval.id },
          data: {
            status: 'APPROVED',
            // approverId fica null aqui, pois aprovação externa não tem user logado
            postVersion: Number(post.version || approval.postVersion || 1),
            resolvedAt: new Date(),
            resolvedSource: 'PUBLIC_LINK',
            resolvedByPhone: null,
          },
        }),
        prisma.post.update({
          where: { id: post.id },
          data: postUpdateData,
        }),
      ]);

      updatedApproval = approvalResult;
      updatedPost = postResult;
    } else {
      // Approval sem post vinculado: atualiza só a approval
      updatedApproval = await prisma.approval.update({
        where: { id: approval.id },
        data: {
          status: 'APPROVED',
        },
      });
    }

    // 🔁 Disparo de automação opcional: post.approved
    try {
      if (automationEngine && typeof automationEngine.evaluateEventAndEnqueue === 'function' && post) {
        const to =
          (client && client.phone) ||
          (client && client.contacts && client.contacts.whatsapp) ||
          null;

        await automationEngine.evaluateEventAndEnqueue(approval.tenantId, {
          type: 'post.approved',
          payload: {
            approvalId: updatedApproval.id,
            postId: post.id,
            postTitle: post.title,
            clientId: client ? client.id : null,
            clientName: client ? client.name : null,
            clientPhone: to,
            source: 'public_link',
          },
        });
      }
    } catch (automationError) {
      console.error(
        'Erro ao disparar automação após aprovação pública:',
        automationError && automationError.stack ? automationError.stack : automationError,
      );
      // não quebra a aprovação em si
    }

    return res.json({
      ok: true,
      status: updatedApproval.status,
      postStatus: updatedPost ? updatedPost.status : null,
    });
  } catch (err) {
    console.error('POST /public/approvals/:token/confirm error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao confirmar approval pública' });
  }
}

module.exports = router;
