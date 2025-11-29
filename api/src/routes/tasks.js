// api/src/routes/tasks.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth");
const tenantMiddleware = require("../middleware/tenant");
const tasksService = require("../services/tasksService");

// Todas as rotas são protegidas
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * GET /tasks
 * Lista tarefas com filtros e paginação
 * Query params:
 *  ?status=
 *  ?assignedTo=
 *  ?priority=
 *  ?q=
 *  ?page=
 *  ?perPage=
 */
router.get("/", async (req, res) => {
  try {
    const { status, assignedTo, priority, q, page, perPage } = req.query;

    const result = await tasksService.list(req.tenantId, {
      status,
      assignedTo,
      priority,
      q,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });

    return res.json(result);
  } catch (err) {
    console.error("GET /tasks error:", err);
    return res.status(500).json({ error: "Erro ao listar tarefas" });
  }
});

/**
 * GET /tasks/suggest?q=...
 */
router.get("/suggest", async (req, res) => {
  try {
    const { q, limit } = req.query;

    const result = await tasksService.suggest(
      req.tenantId,
      q,
      limit ? Number(limit) : undefined
    );

    return res.json(result);
  } catch (err) {
    console.error("GET /tasks/suggest error:", err);
    return res.status(500).json({ error: "Erro ao buscar sugestões" });
  }
});

/**
 * GET /tasks/:id
 * Busca tarefa por ID
 */
router.get("/:id", async (req, res) => {
  try {
    const task = await tasksService.getById(req.tenantId, req.params.id);
    if (!task) return res.status(404).json({ error: "Tarefa não encontrada" });
    return res.json(task);
  } catch (err) {
    console.error("GET /tasks/:id error:", err);
    return res.status(500).json({ error: "Erro ao buscar tarefa" });
  }
});

/**
 * POST /tasks
 * Cria nova tarefa
 */
router.post("/", async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const created = await tasksService.create(req.tenantId, userId, req.body);

    return res.status(201).json(created);
  } catch (err) {
    console.error("POST /tasks error:", err);
    return res.status(500).json({ error: "Erro ao criar tarefa" });
  }
});

/**
 * PUT /tasks/:id
 * Atualiza tarefa
 */
router.put("/:id", async (req, res) => {
  try {
    const updated = await tasksService.update(
      req.tenantId,
      req.params.id,
      req.body
    );

    if (!updated) return res.status(404).json({ error: "Tarefa não encontrada" });

    return res.json(updated);
  } catch (err) {
    console.error("PUT /tasks/:id error:", err);
    return res.status(500).json({ error: "Erro ao atualizar tarefa" });
  }
});

/**
 * DELETE /tasks/:id
 * Remove tarefa
 */
router.delete("/:id", async (req, res) => {
  try {
    const removed = await tasksService.remove(req.tenantId, req.params.id);

    if (!removed) return res.status(404).json({ error: "Tarefa não encontrada" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /tasks/:id error:", err);
    return res.status(500).json({ error: "Erro ao remover tarefa" });
  }
});

module.exports = router;
