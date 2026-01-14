const express = require('express');

const router = express.Router();

const brandGroupsController = require('./brandGroups.controller');
const connectionsController = require('./connections.controller');
const dashboardsController = require('./dashboards.controller');
const metricCatalogController = require('./metricCatalog.controller');
const reportingMetricsController = require('./reportingMetrics.controller');
const reportExportsController = require('./reportExports.controller');
const reportSchedulesController = require('./reportSchedules.controller');
const templatesController = require('./templates.controller');
const reportsController = require('./reports.controller');
const { requireReportingRole } = require('./reportingAccess.middleware');

const allowViewer = requireReportingRole('viewer');
const allowEditor = requireReportingRole('editor');
const allowAdmin = requireReportingRole('admin');

router.get('/health', (req, res) => {
  return res.json({ ok: true, module: 'reporting' });
});

router.get('/brands/:brandId/connections', allowViewer, connectionsController.listByBrand);
router.post('/brands/:brandId/connections/link', allowEditor, connectionsController.link);
router.get('/integrations/:integrationId/accounts', allowEditor, connectionsController.listAccounts);
router.get('/brand-groups', allowViewer, brandGroupsController.list);
router.get('/brand-groups/:groupId/members', allowViewer, brandGroupsController.listMembers);
router.get('/metric-catalog', allowViewer, metricCatalogController.list);
router.get('/dimensions', allowViewer, metricCatalogController.listDimensions);
router.post(
  '/metric-catalog',
  allowAdmin,
  metricCatalogController.create,
);
router.post('/metrics/query', allowViewer, reportingMetricsController.query);

router.get('/dashboards', allowViewer, dashboardsController.list);
router.post('/dashboards', allowEditor, dashboardsController.create);
router.get('/dashboards/:id', allowViewer, dashboardsController.get);
router.put('/dashboards/:id', allowEditor, dashboardsController.update);
router.post('/dashboards/:id/query', allowViewer, dashboardsController.query);

router.get('/templates', allowViewer, templatesController.list);
router.post('/templates', allowEditor, templatesController.create);
router.get('/templates/:id', allowViewer, templatesController.get);
router.put('/templates/:id', allowEditor, templatesController.update);
router.post('/templates/:id/duplicate', allowEditor, templatesController.duplicate);

router.get('/reports', allowViewer, reportsController.list);
router.post('/reports', allowEditor, reportsController.create);
router.get('/reports/:id', allowViewer, reportsController.get);
router.get('/reports/:id/snapshots', allowViewer, reportsController.snapshots);
router.put('/reports/:id/layout', allowEditor, reportsController.updateLayout);
router.post('/reports/:id/refresh', allowEditor, reportsController.refresh);
router.get('/reports/:id/exports', allowViewer, reportExportsController.list);
router.post('/reports/:id/exports', allowEditor, reportExportsController.create);
router.get('/report-exports/:exportId', allowViewer, reportExportsController.get);

router.get('/schedules', allowAdmin, reportSchedulesController.list);
router.get('/schedules/:id', allowAdmin, reportSchedulesController.get);
router.post('/schedules', allowAdmin, reportSchedulesController.create);
router.put('/schedules/:id', allowAdmin, reportSchedulesController.update);
router.delete('/schedules/:id', allowAdmin, reportSchedulesController.remove);
router.post('/schedules/:id/run', allowAdmin, reportSchedulesController.run);

module.exports = router;
