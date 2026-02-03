// api/src/routes/reporting.js
// DEPRECATED (Reports V1): mantido apenas por compatibilidade.
// TODO: remover após migração total para Reports V2.
// Entry point for the reporting module (protected by auth + tenant).

const express = require('express');

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const reportingRouter = require('../modules/reporting/reporting.routes');

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use('/', reportingRouter);

module.exports = router;
