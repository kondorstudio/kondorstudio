const express = require('express');
const exportsController = require('./exports.controller');
const { requireReportingRole } = require('../reporting/reportingAccess.middleware');

const router = express.Router();

const allowViewer = requireReportingRole('viewer');

router.get('/:exportId/download', allowViewer, exportsController.download);

module.exports = router;
