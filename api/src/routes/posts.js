const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth");
const tenantMiddleware = require("../middleware/tenant");
const postsService = require("../services/postsService");
const { PostValidationError } = postsService;
const postsController = require("../controllers/postsController");
const whatsappCloud = require("../services/whatsappCloud");
const { Prisma } = require("@prisma/client");
//const { whatsappQueue } = require("../queues/whatsappQueue"); //TODO: Reativar automações WhatsApp quando a fila estiver configurada.
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * GET /posts
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
 * GET /posts/suggest
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
 */
router.post("/", async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const newPost = await postsService.create(req.tenantId, userId, req.body);
    return res.status(201).json(newPost);
  } catch (err) {
    if (err instanceof PostValidationError) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003") {
        return res
          .status(400)
          .json({ error: "Cliente selecionado não existe mais", code: "INVALID_CLIENT" });
      }
    }
    console.error("POST /posts error:", err);
    return res.status(500).json({ error: "Erro ao criar post" });
  }
});

/**
 * PUT /posts/:id
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
 * POST /posts/:id/request-changes
 */
router.post("/:id/request-changes", async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const body = req.body || {};
    const noteInput =
      typeof body.note === "string"
        ? body.note
        : typeof body.message === "string"
          ? body.message
          : "";

    const updated = await postsService.requestChanges(
      req.tenantId,
      req.params.id,
      noteInput,
      userId
    );

    if (!updated) return res.status(404).json({ error: "Post não encontrado" });
    return res.json(updated);
  } catch (err) {
    if (err instanceof PostValidationError) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    console.error("POST /posts/:id/request-changes error:", err);
    return res.status(500).json({ error: "Erro ao solicitar ajustes" });
  }
});

/**
 * POST /posts/:id/request-approval
 * Solicita aprovação do cliente e enfileira WhatsApp
 */
router.post("/:id/request-approval", async (req, res) => {
  return postsController.requestApproval(req, res);
});

/**
 * DELETE /posts/:id
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

/**
 * POST /posts/:id/send-to-approval
 * Atualiza o post para status AGUARDANDO_APROVACAO e cria uma approval
 */
router.post("/:id/send-to-approval", async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user?.id || null;
    const forceNewLink = Boolean(req.body?.forceNewLink || false);

    const approvalResult = await postsService.requestApproval(req.tenantId, postId, {
      userId,
      forceNewLink,
      enqueueWhatsapp: false,
    });

    const sendResult = await whatsappCloud.sendApprovalRequest({
      tenantId: req.tenantId,
      postId,
    });

    return res.json({
      ...approvalResult,
      whatsappSend: sendResult,
    });
  } catch (err) {
    if (err instanceof whatsappCloud.WhatsAppSendError) {
      const status = err.statusCode || 500;
      const payload = { error: err.message, code: err.code };
      if (status < 500 && err.details) payload.details = err.details;
      return res.status(status).json(payload);
    }
    if (err instanceof PostValidationError) {
      const statusCode = err.code === "NOT_FOUND" ? 404 : err.code === "MISSING_CLIENT" ? 400 : 409;
      return res.status(statusCode).json({ error: err.message, code: err.code });
    }
    console.error('POST /posts/:id/send-to-approval error:', err);
    return res.status(500).json({ error: "Erro ao solicitar aprovação" });
  }
});

module.exports = router;
