const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const preferencesService = require('../services/preferencesService');

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get('/preferences', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario nao autenticado' });
    }

    const preferences = await preferencesService.getPreferences(req.tenantId, userId);
    return res.json({ preferences });
  } catch (err) {
    console.error('GET /me/preferences error:', err);
    return res.status(500).json({ error: 'Erro ao carregar preferencias' });
  }
});

router.patch('/preferences', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario nao autenticado' });
    }

    const preferences = await preferencesService.updatePreferences(
      req.tenantId,
      userId,
      req.body || {}
    );
    return res.json({ preferences });
  } catch (err) {
    console.error('PATCH /me/preferences error:', err);
    return res.status(500).json({ error: 'Erro ao salvar preferencias' });
  }
});

module.exports = router;
