const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth");
const tenantMiddleware = require("../middleware/tenant");
const {
  loadTeamAccess,
  requireTeamPermission,
  getClientScope,
  isClientAllowed,
} = require("../middleware/teamAccess");
const metricsService = require("../services/metricsService");
const automationEngine = require("../services/automationEngine");
const { prisma } = require("../prisma");

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(loadTeamAccess);
router.use(requireTeamPermission("metrics"));

/**
 * GET /metrics
 */
router.get("/", async (req, res) => {
  try {
    const {
      metricType,
      clientId,
      integrationId,
      provider,
      startDate,
      endDate,
      page,
      perPage,
      order,
    } = req.query;

    const scope = getClientScope(req);
    if (clientId && !isClientAllowed(req, clientId)) {
      return res.status(403).json({ error: "Sem acesso a este cliente" });
    }
    const result = await metricsService.list(req.tenantId, {
      metricType,
      clientId,
      integrationId,
      provider,
      startDate,
      endDate,
      order,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
      clientIds: scope.all || clientId ? null : scope.clientIds,
    });

    return res.json(result);
  } catch (err) {
    console.error("GET /metrics error:", err);
    return res.status(500).json({ error: "Erro ao listar métricas" });
  }
});

/**
 * POST /metrics
 */
router.post("/", async (req, res) => {
  try {
    const clientId = req.body?.clientId || req.body?.client_id;
    if (clientId && !isClientAllowed(req, clientId)) {
      return res.status(403).json({ error: "Sem acesso a este cliente" });
    }
    const metric = await metricsService.ingest(req.tenantId, req.body);
    return res.status(201).json(metric);
  } catch (err) {
    console.error("POST /metrics error:", err);
    return res.status(500).json({ error: "Erro ao criar métrica" });
  }
});

/**
 * GET /metrics/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const item = await metricsService.getById(req.tenantId, req.params.id);
    if (!item) return res.status(404).json({ error: "Métrica não encontrada" });
    const scope = getClientScope(req);
    if (!scope.all) {
      const metric = await prisma.metric.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId },
        select: {
          clientId: true,
          post: { select: { clientId: true } },
          integration: { select: { clientId: true } },
        },
      });
      const clientRef =
        metric?.clientId || metric?.post?.clientId || metric?.integration?.clientId;
      if (clientRef && !isClientAllowed(req, clientRef)) {
        return res.status(403).json({ error: "Sem acesso a esta métrica" });
      }
    }
    return res.json(item);
  } catch (err) {
    console.error("GET /metrics/:id error:", err);
    return res.status(500).json({ error: "Erro ao buscar métrica" });
  }
});

/**
 * PUT /metrics/:id
 */
router.put("/:id", async (req, res) => {
  try {
    const existing = await metricsService.getById(req.tenantId, req.params.id);
    if (!existing) return res.status(404).json({ error: "Métrica não encontrada" });
    const scope = getClientScope(req);
    if (!scope.all) {
      const metric = await prisma.metric.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId },
        select: {
          clientId: true,
          post: { select: { clientId: true } },
          integration: { select: { clientId: true } },
        },
      });
      const clientRef =
        metric?.clientId || metric?.post?.clientId || metric?.integration?.clientId;
      if (clientRef && !isClientAllowed(req, clientRef)) {
        return res.status(403).json({ error: "Sem acesso a esta métrica" });
      }
    }
    const updated = await metricsService.update(
      req.tenantId,
      req.params.id,
      req.body
    );
    if (!updated) return res.status(404).json({ error: "Métrica não encontrada" });
    return res.json(updated);
  } catch (err) {
    console.error("PUT /metrics/:id error:", err);
    return res.status(500).json({ error: "Erro ao atualizar métrica" });
  }
});

/**
 * DELETE /metrics/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const existing = await metricsService.getById(req.tenantId, req.params.id);
    if (!existing) return res.status(404).json({ error: "Métrica não encontrada" });
    const scope = getClientScope(req);
    if (!scope.all) {
      const metric = await prisma.metric.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId },
        select: {
          clientId: true,
          post: { select: { clientId: true } },
          integration: { select: { clientId: true } },
        },
      });
      const clientRef =
        metric?.clientId || metric?.post?.clientId || metric?.integration?.clientId;
      if (clientRef && !isClientAllowed(req, clientRef)) {
        return res.status(403).json({ error: "Sem acesso a esta métrica" });
      }
    }
    const removed = await metricsService.remove(req.tenantId, req.params.id);
    if (!removed) return res.status(404).json({ error: "Métrica não encontrada" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /metrics/:id error:", err);
    return res.status(500).json({ error: "Erro ao remover métrica" });
  }
});

/**
 * POST /metrics/aggregate
 */
router.post("/aggregate", async (req, res) => {
  try {
    const clientId = req.body?.clientId || req.body?.client_id;
    if (clientId && !isClientAllowed(req, clientId)) {
      return res.status(403).json({ error: "Sem acesso a este cliente" });
    }
    const scope = getClientScope(req);
    if (!scope.all) {
      req.body.clientIds = scope.clientIds;
    }
    const result = await metricsService.aggregate(req.tenantId, req.body);
    return res.json(result);
  } catch (err) {
    console.error("POST /metrics/aggregate error:", err);
    return res.status(500).json({ error: "Erro ao agregar métricas" });
  }
});

/**
 * GET /metrics/summary/quick
 */
router.get("/summary/quick", async (req, res) => {
  try {
    const { days, metricTypes, clientId, integrationId, provider, source, startDate, endDate } = req.query;
    const scope = getClientScope(req);
    if (clientId && !isClientAllowed(req, clientId)) {
      return res.status(403).json({ error: "Sem acesso a este cliente" });
    }

    const result = await metricsService.quickSummary(req.tenantId, {
      days: days ? Number(days) : undefined,
      metricTypes: metricTypes
        ? metricTypes.split(",").map((t) => t.trim())
        : undefined,
      clientId: clientId || undefined,
      integrationId: integrationId || undefined,
      provider: provider || source || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      clientIds: scope.all || clientId ? null : scope.clientIds,
    });

    return res.json(result);
  } catch (err) {
    console.error("GET /metrics/summary/quick error:", err);
    return res.status(500).json({ error: "Erro ao gerar resumo" });
  }
});

/**
 * POST /metrics/sync
 * Enfileira sincronização de métricas para uma integração (por client/integration).
 * Body:
 *  - clientId (opcional, usado para validar integração)
 *  - integrationId (obrigatório)
 *  - metricTypes (array)
 *  - rangeFrom | rangeTo | rangeDays
 */
router.post("/sync", async (req, res) => {
  try {
    const { integrationId, clientId, metricTypes, rangeFrom, rangeTo, rangeDays } = req.body || {};

    if (!integrationId) {
      return res.status(400).json({ error: "integrationId é obrigatório" });
    }
    if (clientId && !isClientAllowed(req, clientId)) {
      return res.status(403).json({ error: "Sem acesso a este cliente" });
    }

    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, tenantId: req.tenantId },
      select: { id: true, clientId: true },
    });

    if (!integration) {
      return res.status(404).json({ error: "Integração não encontrada" });
    }

    if (clientId && integration.clientId && integration.clientId !== clientId) {
      return res.status(400).json({ error: "Integração não pertence ao cliente informado" });
    }

    const payload = {
      integrationId: integration.id,
      clientId: integration.clientId || clientId || null,
      metricTypes: Array.isArray(metricTypes) ? metricTypes : undefined,
      rangeFrom: rangeFrom || undefined,
      rangeTo: rangeTo || undefined,
      rangeDays: rangeDays || undefined,
      range: {
        since: rangeFrom || undefined,
        until: rangeTo || undefined,
      },
      granularity: "day",
    };

    const job = await automationEngine.enqueueJob(req.tenantId, {
      jobType: "update_metrics",
      name: "metrics_sync",
      referenceId: integration.id,
      payload,
    });

    return res.json({ ok: true, job });
  } catch (err) {
    console.error("POST /metrics/sync error:", err);
    return res.status(500).json({ error: "Erro ao enfileirar sync de métricas" });
  }
});

/**
 * GET /metrics/overview
 * Exibe dados agregados para dashboard da agência
 */
router.get("/overview", async (req, res) => {
  try {
    const tenantId = req.tenantId;

    const totalPosts = await prisma.post.count({
      where: { tenantId },
    });

    const totalClients = await prisma.client.count({
      where: { tenantId },
    });

    const recentMetrics = await prisma.metric.findMany({
      where: { tenantId },
      orderBy: { collectedAt: 'desc' },
      take: 10,
    });

    return res.json({
      totalPosts,
      totalClients,
      recentMetrics,
    });
  } catch (err) {
    console.error("GET /metrics/overview error:", err);
    return res.status(500).json({ error: "Erro ao gerar overview" });
  }
});

/**
 * GET /metrics/campaigns
 * Exibe lista de campanhas com métrica básica
 */
router.get("/campaigns", async (req, res) => {
  try {
    const tenantId = req.tenantId;

    const campaigns = await prisma.metric.groupBy({
      by: ["postId"],
      where: { tenantId },
      _sum: {
        value: true,
      },
      orderBy: {
        _sum: { value: 'desc' },
      },
      take: 10,
    });

    const postIds = campaigns.map((c) => c.postId);
    const posts = await prisma.post.findMany({
      where: { id: { in: postIds } },
      select: { id: true, title: true, clientId: true },
    });

    const postMap = new Map(posts.map((p) => [p.id, p]));

    return res.json({
      items: campaigns.map((item) => {
        const post = postMap.get(item.postId);
        return {
          postId: item.postId,
          title: post?.title || 'Campanha',
          clientId: post?.clientId || null,
          totalValue: item._sum.value || 0,
        };
      }),
    });
  } catch (err) {
    console.error("GET /metrics/campaigns error:", err);
    return res.status(500).json({ error: "Erro ao listar campanhas" });
  }
});

module.exports = router;
