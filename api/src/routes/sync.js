const express = require('express');

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const syncRoutes = require('../modules/sync/sync.routes');

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use('/', syncRoutes);

module.exports = router;
