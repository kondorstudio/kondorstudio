const express = require('express');

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const exportsRoutes = require('../modules/reports/exports.routes');

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use('/', exportsRoutes);

module.exports = router;
