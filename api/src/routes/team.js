// api/src/routes/team.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth");
const tenantMiddleware = require("../middleware/tenant");
const teamMembersService = require("../services/teamMembersService");

// Proteção total
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * GET /team
 * Lista membros com filtros
 */
router.get("/", async (req, res) => {
  try {
    const { q, role, page, perPage } = req.query;

    const result = await teamMembersService.list(req.tenantId, {
      q,
      role,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });

    return res.json(result);
  } catch (err) {
    console.error("GET /team error:", err);
    return res.status(500).json({ error: "Erro ao listar equipe" });
  }
});

/**
 * GET /team/suggest?q=
 */
router.get("/suggest", async (req, res) => {
  try {
    const { q, limit } = req.query;

    const items = await teamMembersService.suggest(
      req.tenantId,
      q,
      limit ? Number(limit) : undefined
    );

    return res.json(items);
  } catch (err) {
    console.error("GET /team/suggest error:", err);
    return res.status(500).json({ error: "Erro ao buscar sugestões" });
  }
});

/**
 * GET /team/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const item = await teamMembersService.getById(
      req.tenantId,
      req.params.id
    );

    if (!item) return res.status(404).json({ error: "Membro não encontrado" });

    return res.json(item);
  } catch (err) {
    console.error("GET /team/:id error:", err);
    return res.status(500).json({ error: "Erro ao buscar membro" });
  }
});

/**
 * POST /team
 */
router.post("/", async (req, res) => {
  try {
    const created = await teamMembersService.create(
      req.tenantId,
      req.body
    );

    return res.status(201).json(created);
  } catch (err) {
    console.error("POST /team error:", err);
    return res.status(500).json({ error: "Erro ao criar membro" });
  }
});

/**
 * PUT /team/:id
 */
router.put("/:id", async (req, res) => {
  try {
    const updated = await teamMembersService.update(
      req.tenantId,
      req.params.id,
      req.body
    );

    if (!updated)
      return res.status(404).json({ error: "Membro não encontrado" });

    return res.json(updated);
  } catch (err) {
    console.error("PUT /team/:id error:", err);
    return res.status(500).json({ error: "Erro ao atualizar membro" });
  }
});

/**
 * POST /team/:id/roles
 * Body: { roles: ['designer','gestor','social_media'] }
 */
router.post("/:id/roles", async (req, res) => {
  try {
    const { roles } = req.body;

    const updated = await teamMembersService.assignRoles(
      req.tenantId,
      req.params.id,
      roles
    );

    if (!updated)
      return res.status(404).json({ error: "Membro não encontrado" });

    return res.json(updated);
  } catch (err) {
    console.error("POST /team/:id/roles error:", err);
    return res.status(500).json({ error: "Erro ao atribuir roles" });
  }
});

/**
 * DELETE /team/:id
 * Soft delete por padrão
 * Body opcional: { soft: false }
 */
router.delete("/:id", async (req, res) => {
  try {
    const soft = req.body?.soft !== undefined ? Boolean(req.body.soft) : true;

    const removed = await teamMembersService.remove(
      req.tenantId,
      req.params.id,
      { soft }
    );

    if (!removed)
      return res.status(404).json({ error: "Membro não encontrado" });

    return res.json({ ok: true, soft });
  } catch (err) {
    console.error("DELETE /team/:id error:", err);
    return res.status(500).json({ error: "Erro ao remover membro" });
  }
});

module.exports = router;
