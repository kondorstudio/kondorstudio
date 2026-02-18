const express = require('express');

const controller = require('../controllers/integrationsGa4Controller');
const authMiddleware = require('../middleware/auth');
const tenantGuard = require('../middleware/tenantGuard');
const validate = require('../middleware/validate');
const { checkSubscription } = require('../middleware/checkSubscription');
const {
  ga4BrandSettingsSchema,
  ga4FactsSyncSchema,
} = require('../validators/ga4Validator');

const router = express.Router();

router.get('/oauth/callback', controller.oauthCallback);
// Fallback: garante disconnect mesmo se as rotas protegidas não estiverem montadas.
router.post(
  '/disconnect',
  authMiddleware,
  authMiddleware.requireRole('OWNER', 'ADMIN', 'SUPER_ADMIN'),
  tenantGuard,
  checkSubscription,
  controller.disconnect,
);

// Fallback: o frontend precisa dessas rotas, mas em alguns deploys antigos apenas o router público estava montado.
// Mantemos aqui também (com auth + tenant + subscription + RBAC), para evitar 404 regressivo.
router.get(
  '/brands/settings',
  authMiddleware,
  tenantGuard,
  checkSubscription,
  controller.brandSettingsGet,
);
router.post(
  '/brands/settings',
  authMiddleware,
  authMiddleware.requireRole('OWNER', 'ADMIN', 'SUPER_ADMIN'),
  tenantGuard,
  checkSubscription,
  validate(ga4BrandSettingsSchema),
  controller.brandSettingsUpsert,
);
router.post(
  '/facts/sync',
  authMiddleware,
  authMiddleware.requireRole('OWNER', 'ADMIN', 'SUPER_ADMIN'),
  tenantGuard,
  checkSubscription,
  validate(ga4FactsSyncSchema),
  controller.syncFacts,
);

module.exports = router;
