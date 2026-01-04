const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth");
const tenantMiddleware = require("../middleware/tenant");
const competitorsService = require("../services/competitorsService");

router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * GET /competitors
 * Lista concorrentes com filtros
 * Query:
 *  - clientId
 *  - platform
 *  - status
 *  - q (busca)
 *  - page
 *  - perPage
 */
router.get("/", async (req, res) => {
  try {
    const { clientId, platform, status, q, page, perPage } = req.query;
    const result = await competitorsService.list(req.tenantId, {
      clientId,
      platform,
      status,
      q,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });
    return res.json(result);
  } catch (err) {
    console.error("GET /competitors error:", err);
    return res.status(500).json({ error: "Erro ao listar concorrentes" });
  }
});

/**
 * POST /competitors
 */
router.post("/", async (req, res) => {
  try {
    const competitor = await competitorsService.create(req.tenantId, req.body || {});
    return res.status(201).json(competitor);
  } catch (err) {
    console.error("POST /competitors error:", err);
    return res.status(400).json({ error: err.message || "Erro ao criar concorrente" });
  }
});

/**
 * GET /competitors/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const item = await competitorsService.getById(req.tenantId, req.params.id);
    if (!item) return res.status(404).json({ error: "Concorrente não encontrado" });
    return res.json(item);
  } catch (err) {
    console.error("GET /competitors/:id error:", err);
    return res.status(500).json({ error: "Erro ao buscar concorrente" });
  }
});

/**
 * PUT /competitors/:id
 */
router.put("/:id", async (req, res) => {
  try {
    const updated = await competitorsService.update(req.tenantId, req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "Concorrente não encontrado" });
    return res.json(updated);
  } catch (err) {
    console.error("PUT /competitors/:id error:", err);
    return res.status(400).json({ error: err.message || "Erro ao atualizar concorrente" });
  }
});

/**
 * DELETE /competitors/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const removed = await competitorsService.remove(req.tenantId, req.params.id);
    if (!removed) return res.status(404).json({ error: "Concorrente não encontrado" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /competitors/:id error:", err);
    return res.status(500).json({ error: "Erro ao remover concorrente" });
  }
});

/**
 * GET /competitors/:id/snapshots
 */
router.get("/:id/snapshots", async (req, res) => {
  try {
    const { startDate, endDate, order, limit } = req.query;
    const items = await competitorsService.listSnapshots(req.tenantId, req.params.id, {
      startDate,
      endDate,
      order,
      limit,
    });
    return res.json({ items });
  } catch (err) {
    console.error("GET /competitors/:id/snapshots error:", err);
    return res.status(500).json({ error: "Erro ao listar snapshots" });
  }
});

/**
 * POST /competitors/:id/snapshots
 */
router.post("/:id/snapshots", async (req, res) => {
  try {
    const snapshot = await competitorsService.createSnapshot(
      req.tenantId,
      req.params.id,
      req.body || {}
    );
    return res.status(201).json(snapshot);
  } catch (err) {
    console.error("POST /competitors/:id/snapshots error:", err);
    return res.status(400).json({ error: err.message || "Erro ao criar snapshot" });
  }
});

/**
 * POST /competitors/:id/sync
 * Stub para futura integração Meta
 */
router.post("/:id/sync", async (req, res) => {
  try {
    const updated = await competitorsService.markSyncRequested(
      req.tenantId,
      req.params.id
    );
    if (!updated) return res.status(404).json({ error: "Concorrente não encontrado" });
    return res.json({
      ok: true,
      status: "pending",
      message: "Integração Meta ainda não configurada.",
      competitor: updated,
    });
  } catch (err) {
    console.error("POST /competitors/:id/sync error:", err);
    return res.status(500).json({ error: "Erro ao solicitar sync" });
  }
});

module.exports = router;
