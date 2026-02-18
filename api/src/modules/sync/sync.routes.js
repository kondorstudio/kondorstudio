const express = require('express');
const { requireReportingRole } = require('../reporting/reportingAccess.middleware');
const syncController = require('./sync.controller');

const router = express.Router();

const allowEditor = requireReportingRole('editor');

router.post('/preview', allowEditor, syncController.enqueuePreview);
router.post('/backfill', allowEditor, syncController.enqueueBackfill);
router.post('/incremental', allowEditor, syncController.enqueueIncremental);

module.exports = router;
