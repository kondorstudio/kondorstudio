const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth");
const tenantMiddleware = require("../middleware/tenant");
const postsService = require("../services/postsService");
const { prisma } = require("../prisma");
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
    const tenantId = req.tenantId;

    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post || post.tenantId !== tenantId) {
      return res.status(404).json({ error: "Post não encontrado" });
    }

    // Atualizar status do post
    await prisma.post.update({
      where: { id: postId },
      data: {
        status: "AWAITING_APPROVAL",
      },
    });

    // Criar registro em approvals
    await prisma.approval.create({
      data: {
        postId: post.id,
        tenantId,
        status: "PENDING",
        requestedAt: new Date(),
      },
    });

    // Enviar para fila WhatsApp (opcional)
    if (whatsappQueue) {
      await whatsappQueue.add("notifyNewPostApproval", {
        tenantId,
        postId,
        clientId: post.clientId,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /posts/:id/send-to-approval error:", err);
    return res
      .status(500)
      .json({ error: "Erro ao enviar post para aprovação" });
  }
});

module.exports = router;
