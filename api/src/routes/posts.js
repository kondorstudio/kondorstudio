// api/src/routes/posts.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth");
const tenantMiddleware = require("../middleware/tenant");
const postsService = require("../services/postsService");

// Todas as rotas protegidas
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * GET /posts
 * Lista posts do tenant com filtros e paginação
 * Query:
 *  ?status=
 *  ?clientId=
 *  ?q=
 *  ?page=
 *  ?perPage=
 */
router.get("/", async (req, res) => {
  try {
    const { status, clientId, q, page, perPage } = req.query;

    const result = await postsService.list(req.tenantId, {
      status,
      clientId,
      q,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });

    return res.json(result);
  } catch (err) {
    console.error("GET /posts error:", err);
    return res.status(500).json({ error: "Erro ao listar posts" });
  }
});

/**
 * GET /posts/suggest?q=...
 * Autosuggest para busca rápida
 */
router.get("/suggest", async (req, res) => {
  try {
    const { q, limit } = req.query;
    const result = await postsService.suggest(
      req.tenantId,
      q,
      limit ? Number(limit) : undefined
    );
    return res.json(result);
  } catch (err) {
    console.error("GET /posts/suggest error:", err);
    return res.status(500).json({ error: "Erro ao buscar sugestões" });
  }
});

/**
 * GET /posts/:id
 * Busca post por ID
 */
router.get("/:id", async (req, res) => {
  try {
    const post = await postsService.getById(req.tenantId, req.params.id);
    if (!post) return res.status(404).json({ error: "Post não encontrado" });
    return res.json(post);
  } catch (err) {
    console.error("GET /posts/:id error:", err);
    return res.status(500).json({ error: "Erro ao buscar post" });
  }
});

/**
 * POST /posts
 * Cria novo post
 * Body deve conter ao menos title/caption/mediaUrl/clientId
 */
router.post("/", async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const newPost = await postsService.create(req.tenantId, userId, req.body);
    return res.status(201).json(newPost);
  } catch (err) {
    console.error("POST /posts error:", err);
    return res.status(500).json({ error: "Erro ao criar post" });
  }
});

/**
 * PUT /posts/:id
 * Atualiza post
 */
router.put("/:id", async (req, res) => {
  try {
    const updated = await postsService.update(
      req.tenantId,
      req.params.id,
      req.body
    );
    if (!updated) return res.status(404).json({ error: "Post não encontrado" });

    return res.json(updated);
  } catch (err) {
    console.error("PUT /posts/:id error:", err);
    return res.status(500).json({ error: "Erro ao atualizar post" });
  }
});

/**
 * DELETE /posts/:id
 * Remove post
 */
router.delete("/:id", async (req, res) => {
  try {
    const removed = await postsService.remove(req.tenantId, req.params.id);
    if (!removed) return res.status(404).json({ error: "Post não encontrado" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /posts/:id error:", err);
    return res.status(500).json({ error: "Erro ao remover post" });
  }
});

module.exports = router;
