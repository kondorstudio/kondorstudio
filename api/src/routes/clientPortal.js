const express = require('express');
const jwt = require('jsonwebtoken');
const { prisma } = require('../prisma');
const approvalsService = require('../services/approvalsService');
const postsService = require('../services/postsService');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'changeme_local_secret';

// === Auth para CLIENTE (JWT do tipo 'client') ===
function extractToken(req) {
  const authHeader = req.headers && req.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
  }
  if (req.query && req.query.token) return req.query.token;
  return null;
}

async function clientAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    if (!payload || payload.type !== 'client') {
      return res.status(401).json({ error: 'Token não é de cliente' });
    }

    const client = await prisma.client.findUnique({
      where: { id: payload.clientId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        phone: true,
        metadata: true,
      },
    });

    if (!client) return res.status(401).json({ error: 'Cliente não encontrado' });

    req.client = client;
    req.tenantId = payload.tenantId;
    return next();
  } catch (err) {
    console.error('clientAuth error:', err);
    return res.status(500).json({ error: 'Erro ao validar token de cliente' });
  }
}

// === Rotas ===
router.get('/me', clientAuth, async (req, res) => {
  const client = req.client;
  return res.json({ client });
});

router.get('/posts', clientAuth, async (req, res) => {
  try {
    const { status } = req.query || {};
    const where = {
      tenantId: req.tenantId,
      clientId: req.client.id,
      ...(status ? { status } : {}),
    };

    const posts = await prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ items: posts });
  } catch (err) {
    console.error('GET /client-portal/posts error:', err);
    return res.status(500).json({ error: 'Erro ao buscar posts do cliente' });
  }
});

router.get('/metrics', clientAuth, async (req, res) => {
  try {
    const { days } = req.query;
    const dateFilter = {};
    if (Number.isFinite(Number(days))) {
      const d = new Date();
      d.setDate(d.getDate() - Number(days));
      dateFilter.gte = d;
    }

    const metrics = await prisma.metric.findMany({
      where: {
        tenantId: req.tenantId,
        ...(Object.keys(dateFilter).length ? { collectedAt: dateFilter } : {}),
        post: { clientId: req.client.id },
      },
      orderBy: { collectedAt: 'desc' },
      include: {
        post: { select: { id: true, title: true, status: true } },
      },
    });

    return res.json({ items: metrics });
  } catch (err) {
    console.error('GET /client-portal/metrics error:', err);
    return res.status(500).json({ error: 'Erro ao buscar métricas do cliente' });
  }
});

router.get('/approvals', clientAuth, async (req, res) => {
  try {
    const { status } = req.query || {};
    const approvals = await prisma.approval.findMany({
      where: {
        tenantId: req.tenantId,
        post: { clientId: req.client.id },
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        post: { select: { id: true, title: true, status: true } },
      },
    });

    return res.json({ items: approvals });
  } catch (err) {
    console.error('GET /client-portal/approvals error:', err);
    return res.status(500).json({ error: 'Erro ao buscar aprovações do cliente' });
  }
});

router.get('/reports', clientAuth, async (req, res) => {
  try {
    const reports = await prisma.report.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ items: reports });
  } catch (err) {
    console.error('GET /client-portal/reports error:', err);
    return res.status(500).json({ error: 'Erro ao buscar relatórios do cliente' });
  }
});

// NOVO: Aprovação pelo cliente via portal
router.post('/approvals/:id/approve', clientAuth, async (req, res) => {
  try {
    const approval = await prisma.approval.findUnique({
      where: { id: req.params.id },
      include: { post: true },
    });

    if (
      !approval ||
      approval.tenantId !== req.tenantId ||
      approval.post.clientId !== req.client.id
    ) {
      return res.status(404).json({ error: 'Approval não encontrada' });
    }

    await approvalsService.changeStatus(req.tenantId, approval.id, 'APPROVED', {
      note: req.body.comment || null,
      by: req.client.id,
    });

    await postsService.updateStatus(req.tenantId, approval.post.id, 'APPROVED', req.client.id);

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /client-portal/approvals/:id/approve error:', err);
    return res.status(500).json({ error: 'Erro ao aprovar post' });
  }
});

router.post('/approvals/:id/reject', clientAuth, async (req, res) => {
  try {
    const approval = await prisma.approval.findUnique({
      where: { id: req.params.id },
      include: { post: true },
    });

    if (
      !approval ||
      approval.tenantId !== req.tenantId ||
      approval.post.clientId !== req.client.id
    ) {
      return res.status(404).json({ error: 'Approval não encontrada' });
    }

    await approvalsService.changeStatus(req.tenantId, approval.id, 'REJECTED', {
      note: req.body.comment || null,
      by: req.client.id,
    });

    await postsService.updateStatus(req.tenantId, approval.post.id, 'REJECTED', req.client.id);

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /client-portal/approvals/:id/reject error:', err);
    return res.status(500).json({ error: 'Erro ao rejeitar post' });
  }
});

module.exports = router;
