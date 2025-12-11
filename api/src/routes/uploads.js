// api/src/routes/uploads.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const uploadsService = require('../services/uploadsService');

const MAX_FILE_SIZE_MB = Number(process.env.UPLOADS_MAX_FILE_SIZE_MB || 200);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// memória storage (usamos buffer para enviar ao S3 via service)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES, // limite configurável para vídeos/imagens
  },
});

// proteções
router.use(authMiddleware);
router.use(tenantMiddleware);

function detectRequestProtocol(req) {
  const header = (req.headers["x-forwarded-proto"] || "")
    .toString()
    .split(",")[0]
    .trim();
  return header || req.protocol || "http";
}

function forceProtocol(urlString, protocol) {
  if (!urlString || !protocol) return urlString;
  try {
    const parsed = new URL(urlString);
    const normalizedProtocol = protocol.endsWith(":")
      ? protocol
      : `${protocol}:`;
    if (parsed.protocol !== normalizedProtocol) {
      parsed.protocol = normalizedProtocol;
    }
    return parsed.toString();
  } catch (err) {
    return urlString;
  }
}

/**
 * POST /uploads
 * multipart form upload: field name = "file"
 * optional body: folder (prefix), public (true/false)
 */
function sanitizeFileName(name = "file") {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "file";
}

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

    const folder = req.body.folder ? `${req.body.folder.replace(/\/+$/,'')}/` : '';
    const originalName = req.file.originalname || 'file';
    const safeName = sanitizeFileName(originalName);
    const uniqueName = `${Date.now()}-${safeName}`;
    const key = `${req.tenantId}/${folder}${uniqueName}`;

    // prefer service to generate unique key
    const result = await uploadsService.uploadBuffer(req.file.buffer, originalName, req.file.mimetype, {
      key: key,
      acl: req.body.public === 'true' ? 'public-read' : undefined,
      metadata: { uploadedBy: req.user?.id || null },
    });

    const requestProtocol = detectRequestProtocol(req);
    const host = req.get("host") || "localhost";
    const fallbackBase = `${requestProtocol}://${host}`;

    const baseUrl =
      process.env.UPLOADS_BASE_URL ||
      process.env.API_PUBLIC_URL ||
      process.env.API_BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      fallbackBase;
    const normalizedBase = forceProtocol(baseUrl, requestProtocol).replace(/\/$/, '');
    const finalUrl = `${normalizedBase}/uploads/public/${encodeURIComponent(result.key)}`;

    // You may want to persist the key/url into DB (e.g. media table) — not done here

    return res.status(201).json({ ok: true, key: result.key, url: finalUrl });
  } catch (err) {
    console.error('POST /uploads error:', err);
    return res.status(500).json({ error: 'Erro ao enviar arquivo', detail: err.message });
  }
});

/**
 * POST /uploads/presign
 * Body: { originalName, contentType, expiresIn, folder }
 * Returns a presigned upload URL for client-side direct upload
 */
router.post('/presign', async (req, res) => {
  try {
    const { originalName = 'file', contentType = 'application/octet-stream', expiresIn = 900, folder } = req.body || {};
    const prefix = folder ? `${folder.replace(/\/+$/,'')}/` : '';
    const fullName = `${req.tenantId}/${prefix}${originalName}`;
    const result = await uploadsService.createPresignedUpload(fullName, contentType, Number(expiresIn));
    return res.json({ ok: true, key: result.key, url: result.url, expiresIn: result.expiresIn });
  } catch (err) {
    console.error('POST /uploads/presign error:', err);
    return res.status(500).json({ error: 'Erro ao gerar presigned url', detail: err.message });
  }
});

/**
 * GET /uploads/list?prefix=&limit=
 */
router.get('/list', async (req, res) => {
  try {
    const prefix = req.query.prefix ? `${req.tenantId}/${req.query.prefix}` : `${req.tenantId}/`;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const items = await uploadsService.listObjects(prefix, limit);
    return res.json({ items });
  } catch (err) {
    console.error('GET /uploads/list error:', err);
    return res.status(500).json({ error: 'Erro ao listar arquivos' });
  }
});

/**
 * DELETE /uploads/:key (urlencoded key)
 */
router.delete('/:key', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    // security: ensure tenant only deletes files in their folder
    if (!key.startsWith(`${req.tenantId}/`)) {
      return res.status(403).json({ error: 'Não autorizado a deletar esse arquivo' });
    }
    await uploadsService.deleteObject(key);
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /uploads/:key error:', err);
    return res.status(500).json({ error: 'Erro ao remover arquivo', detail: err.message });
  }
});

// Tratamento de erros do Multer (tamanho excedido, etc.)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `Arquivo excede o limite de ${MAX_FILE_SIZE_MB}MB.`,
        code: 'FILE_TOO_LARGE',
      });
    }
    return res.status(400).json({
      error: `Erro no upload: ${err.message}`,
      code: err.code,
    });
  }
  if (err) {
    console.error('[uploads] erro inesperado no middleware:', err);
    return res
      .status(500)
      .json({ error: 'Erro ao processar upload', detail: err.message });
  }
  return next();
});

module.exports = router;
