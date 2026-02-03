const express = require('express');
const dashboardsController = require('./dashboards.controller');
const exportsController = require('./exports.controller');
const { requireReportingRole } = require('../reporting/reportingAccess.middleware');

const router = express.Router();

const allowViewer = requireReportingRole('viewer');
const allowEditor = requireReportingRole('editor');

router.get('/', allowViewer, dashboardsController.list);
router.post('/', allowEditor, dashboardsController.create);
router.get('/:id', allowViewer, dashboardsController.get);
router.put('/:id', allowEditor, dashboardsController.update);
router.post('/:id/clone', allowEditor, dashboardsController.clone);
router.post('/:id/exports', allowEditor, exportsController.create);
router.post('/:id/versions', allowEditor, dashboardsController.createVersion);
router.get('/:id/versions', allowEditor, dashboardsController.listVersions);
router.post('/:id/publish', allowEditor, dashboardsController.publish);
router.post('/:id/rollback', allowEditor, dashboardsController.rollback);
router.post('/:id/share', allowEditor, dashboardsController.share);
router.delete('/:id/share', allowEditor, dashboardsController.unshare);

module.exports = router;
