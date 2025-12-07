const express = require('express');
const router = express.Router();
const uploadsService = require('../services/uploadsService');

/**
 * Rota pública para servir arquivos upados no S3/local storage.
 * Não exige autenticação porque apenas gera um redirect seguro.
 */
router.get('/:key', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    if (!key) return res.status(404).json({ error: 'Arquivo não encontrado' });

    const fileUrl = await uploadsService.getUrlForKey(key);
    if (!fileUrl) return res.status(404).json({ error: 'Arquivo não encontrado' });

    if (/^https?:\/\//i.test(fileUrl)) {
      return res.redirect(fileUrl);
    }

    const baseUrl =
      process.env.UPLOADS_BASE_URL ||
      process.env.API_PUBLIC_URL ||
      process.env.API_BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      `${req.protocol}://${req.get('host')}`;
    const normalized = baseUrl.replace(/\/$/, '');
    const absoluteUrl = `${normalized}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
    return res.redirect(absoluteUrl);
  } catch (err) {
    console.error('GET /uploads/public/:key error:', err);
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }
});

module.exports = router;
