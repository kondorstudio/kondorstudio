const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

// todas as rotas de dashboard exigem autenticação
router.use(auth);

// GET /dashboard/summary?range=7d&clientId=...
router.get('/summary', dashboardController.summary);

// Backward-compatible aliases used by the frontend client
router.get('/overview', dashboardController.overview);
router.get('/tenant', dashboardController.tenant);

module.exports = router;
