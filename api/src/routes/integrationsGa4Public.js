const express = require('express');

const controller = require('../controllers/integrationsGa4Controller');
const authMiddleware = require('../middleware/auth');
const tenantGuard = require('../middleware/tenantGuard');

const router = express.Router();

router.get('/oauth/callback', controller.oauthCallback);
// Fallback: garante disconnect mesmo se as rotas protegidas não estiverem montadas.
router.post(
  '/disconnect',
  authMiddleware,
  authMiddleware.requireRole('OWNER', 'ADMIN'),
  tenantGuard,
  controller.disconnect,
);

module.exports = router;
