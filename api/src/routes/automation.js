// api/src/routes/automation.js
// Rotas para configurar automações (relatórios recorrentes, lembretes de aprovação)
// por tenant, usando Tenant.settings + schedulerService.
//
// Base path esperado: /api/automation
//
// Endpoints:
//  - GET  /      -> retorna settings de automação do tenant atual
//  - PUT  /      -> atualiza settings e sincroniza agendamentos

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const automationSettingsService = require('../services/automationSettingsService');

// Todas as rotas exigem auth + tenant
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * GET /automation
 * Retorna configurações de automação do tenant atual.
 */
router.get('/', async (req, res) => {
  try {
    const settings = await automationSettingsService.getAutomationSettings(req.tenantId);

    return res.json({
      ok: true,
      automation: settings,
    });

  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('GET /automation error:', err);

    return res.status(500).json({
      ok: false,
      error: 'Erro ao carregar configurações de automação',
    });
  }
});

/**
 * PUT /automation
 * Atualiza configurações de automação do tenant atual e sincroniza agendamentos.
 *
 * Body esperado (parcial):
 * {
 *   "reports": {
 *     "enabled": true,
 *     "cron": "0 9 * * 1",
 *     "slug": "default",
 *     "rangeDays": 30
 *   },
 *   "approvals": {
 *     "enabled": true,
 *     "cron": "0 10 * * *",
 *     "to": "+5511999999999"
 *   }
 * }
 */
router.put('/', async (req, res) => {
  try {
    const payload = req.body || {};

    const settings = await automationSettingsService.updateAutomationSettings(
      req.tenantId,
      payload,
    );

    return res.json({
      ok: true,
      automation: settings,
    });

  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('PUT /automation error:', err);

    // Tratamento 1: Tenant não encontrado
    if (err && err.message === 'Tenant não encontrado') {
      return res.status(404).json({
        ok: false,
        error: 'Tenant não encontrado',
      });
    }

    // Tratamento 2: Erro de validação (statusCode 400)
    if (err && err.statusCode === 400) {
      return res.status(400).json({
        ok: false,
        error: err.message,
        details: err.details || [],
      });
    }

    // Tratamento 3: Erro inesperado
    return res.status(500).json({
      ok: false,
      error: 'Erro ao atualizar configurações de automação',
    });
  }
});

module.exports = router;
