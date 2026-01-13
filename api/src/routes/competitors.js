const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth");
const tenantMiddleware = require("../middleware/tenant");
const competitorsService = require("../services/competitorsService");
const { requireReportingRole } = require("../modules/reporting/reportingAccess.middleware");
const { logReportingAction } = require("../modules/reporting/reportingAudit.service");

const allowViewer = requireReportingRole("viewer");
const allowEditor = requireReportingRole("editor");

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
router.get("/", allowViewer, async (req, res) => {
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
 * GET /competitors/compare
 * Relatorio comparativo (tabela + graficos)
 * Query:
 *  - clientId
 *  - platform
 *  - status
 *  - q
 *  - startDate
 *  - endDate
 *  - limit
 *  - perCompetitor
 */
router.get("/compare", allowViewer, async (req, res) => {
  try {
    const {
      clientId,
      platform,
      status,
      q,
      startDate,
      endDate,
      limit,
      perCompetitor,
    } = req.query;
    const result = await competitorsService.compare(req.tenantId, {
      clientId,
      platform,
      status,
      q,
      startDate,
      endDate,
      limit: limit ? Number(limit) : undefined,
      perCompetitor: perCompetitor ? Number(perCompetitor) : undefined,
    });
    return res.json(result);
  } catch (err) {
    console.error("GET /competitors/compare error:", err);
    return res.status(500).json({ error: "Erro ao gerar comparativo" });
  }
});

/**
 * POST /competitors
 */
router.post("/", allowEditor, async (req, res) => {
  try {
    const competitor = await competitorsService.create(req.tenantId, req.body || {});
    logReportingAction({
      tenantId: req.tenantId,
      userId: req.user?.id,
      action: "create",
      resource: "competitor",
      resourceId: competitor.id,
      ip: req.ip,
      meta: {
        clientId: competitor.clientId,
        platform: competitor.platform,
        username: competitor.username,
      },
    });
    return res.status(201).json(competitor);
  } catch (err) {
    console.error("POST /competitors error:", err);
    return res.status(400).json({ error: err.message || "Erro ao criar concorrente" });
  }
});

/**
 * GET /competitors/:id
 */
router.get("/:id", allowViewer, async (req, res) => {
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
router.put("/:id", allowEditor, async (req, res) => {
  try {
    const updated = await competitorsService.update(req.tenantId, req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "Concorrente não encontrado" });
    logReportingAction({
      tenantId: req.tenantId,
      userId: req.user?.id,
      action: "update",
      resource: "competitor",
      resourceId: updated.id,
      ip: req.ip,
      meta: {
        clientId: updated.clientId,
        platform: updated.platform,
        username: updated.username,
      },
    });
    return res.json(updated);
  } catch (err) {
    console.error("PUT /competitors/:id error:", err);
    return res.status(400).json({ error: err.message || "Erro ao atualizar concorrente" });
  }
});

/**
 * DELETE /competitors/:id
 */
router.delete("/:id", allowEditor, async (req, res) => {
  try {
    const removed = await competitorsService.remove(req.tenantId, req.params.id);
    if (!removed) return res.status(404).json({ error: "Concorrente não encontrado" });
    logReportingAction({
      tenantId: req.tenantId,
      userId: req.user?.id,
      action: "remove",
      resource: "competitor",
      resourceId: req.params.id,
      ip: req.ip,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /competitors/:id error:", err);
    return res.status(500).json({ error: "Erro ao remover concorrente" });
  }
});

/**
 * GET /competitors/:id/snapshots
 */
router.get("/:id/snapshots", allowViewer, async (req, res) => {
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
router.post("/:id/snapshots", allowEditor, async (req, res) => {
  try {
    const snapshot = await competitorsService.createSnapshot(
      req.tenantId,
      req.params.id,
      req.body || {}
    );
    logReportingAction({
      tenantId: req.tenantId,
      userId: req.user?.id,
      action: "create_snapshot",
      resource: "competitor",
      resourceId: req.params.id,
      ip: req.ip,
      meta: {
        snapshotId: snapshot.id,
      },
    });
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
router.post("/:id/sync", allowEditor, async (req, res) => {
  try {
    const result = await competitorsService.syncFromMeta(req.tenantId, req.params.id);
    logReportingAction({
      tenantId: req.tenantId,
      userId: req.user?.id,
      action: "sync",
      resource: "competitor",
      resourceId: req.params.id,
      ip: req.ip,
      meta: {
        integrationId: result.integrationId || null,
        snapshotId: result.snapshot?.id || null,
      },
    });
    return res.json({
      ok: true,
      status: "ready",
      snapshot: result.snapshot,
      integrationId: result.integrationId,
    });
  } catch (err) {
    console.error("POST /competitors/:id/sync error:", err);
    const status = err.statusCode || err.status || 500;
    return res.status(status).json({
      error: err.message || "Erro ao solicitar sync",
    });
  }
});

module.exports = router;
