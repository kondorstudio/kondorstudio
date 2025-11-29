// api/src/routes/metrics.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth");
const tenantMiddleware = require("../middleware/tenant");
const metricsService = require("../services/metricsService");

// Rotas protegidas
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * GET /metrics
 * Lista métricas com filtros e paginação
 * Query:
 *  ?metricType=
 *  ?clientId=
 *  ?startDate=
 *  ?endDate=
 *  ?page=
 *  ?perPage=
 */
router.get("/", async (req, res) => {
  try {
    const {
      metricType,
      clientId,
      startDate,
      endDate,
      page,
      perPage,
      order,
    } = req.query;

    const result = await metricsService.list(req.tenantId, {
      metricType,
      clientId,
      startDate,
      endDate,
      order,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });

    return res.json(result);
  } catch (err) {
    console.error("GET /metrics error:", err);
    return res.status(500).json({ error: "Erro ao listar métricas" });
  }
});

/**
 * POST /metrics
 * Ingesta uma métrica (criação)
 */
router.post("/", async (req, res) => {
  try {
    const metric = await metricsService.ingest(req.tenantId, req.body);
    return res.status(201).json(metric);
  } catch (err) {
    console.error("POST /metrics error:", err);
    return res.status(500).json({ error: "Erro ao criar métrica" });
  }
});

/**
 * GET /metrics/:id
 * Retorna métrica por ID
 */
router.get("/:id", async (req, res) => {
  try {
    const item = await metricsService.getById(req.tenantId, req.params.id);
    if (!item) return res.status(404).json({ error: "Métrica não encontrada" });
    return res.json(item);
  } catch (err) {
    console.error("GET /metrics/:id error:", err);
    return res.status(500).json({ error: "Erro ao buscar métrica" });
  }
});

/**
 * PUT /metrics/:id
 * Atualiza métrica
 */
router.put("/:id", async (req, res) => {
  try {
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
 * Remove métrica
 */
router.delete("/:id", async (req, res) => {
  try {
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
 * Agregações (dashboards, relatórios)
 * Body:
 * {
 *   groupBy: 'day'|'hour'|'week'|'month',
 *   metricTypes: [],
 *   clientId,
 *   startDate,
 *   endDate
 * }
 */
router.post("/aggregate", async (req, res) => {
  try {
    const result = await metricsService.aggregate(req.tenantId, req.body);
    return res.json(result);
  } catch (err) {
    console.error("POST /metrics/aggregate error:", err);
    return res.status(500).json({ error: "Erro ao agregar métricas" });
  }
});

/**
 * GET /metrics/summary?days=7&metricTypes=impression,click,...
 * Resumo rápido (dashboard)
 */
router.get("/summary/quick", async (req, res) => {
  try {
    const { days, metricTypes } = req.query;

    const result = await metricsService.quickSummary(req.tenantId, {
      days: days ? Number(days) : undefined,
      metricTypes: metricTypes
        ? metricTypes.split(",").map((t) => t.trim())
        : undefined,
    });

    return res.json(result);
  } catch (err) {
    console.error("GET /metrics/summary/quick error:", err);
    return res.status(500).json({ error: "Erro ao gerar resumo" });
  }
});

module.exports = router;
