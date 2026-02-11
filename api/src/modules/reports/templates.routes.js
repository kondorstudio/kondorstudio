const express = require('express');
const templatesController = require('./templates.controller');
const { requireReportingRole } = require('../reporting/reportingAccess.middleware');

const router = express.Router();

const allowViewer = requireReportingRole('viewer');
const allowEditor = requireReportingRole('editor');

router.get('/', allowViewer, templatesController.list);
router.post('/', allowEditor, templatesController.create);
router.post('/:id/instantiate', allowEditor, templatesController.instantiate);

module.exports = router;
