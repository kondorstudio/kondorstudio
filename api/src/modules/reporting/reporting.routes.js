const express = require('express');

const router = express.Router();

const auth = require('../../middleware/auth');
const brandGroupsController = require('./brandGroups.controller');
const connectionsController = require('./connections.controller');
const dashboardsController = require('./dashboards.controller');
const metricCatalogController = require('./metricCatalog.controller');
const reportExportsController = require('./reportExports.controller');
const templatesController = require('./templates.controller');
const reportsController = require('./reports.controller');

router.get('/health', (req, res) => {
  return res.json({ ok: true, module: 'reporting' });
});

router.get('/brands/:brandId/connections', connectionsController.listByBrand);
router.post('/brands/:brandId/connections/link', connectionsController.link);
router.get('/integrations/:integrationId/accounts', connectionsController.listAccounts);
router.get('/brand-groups', brandGroupsController.list);
router.get('/brand-groups/:groupId/members', brandGroupsController.listMembers);
router.get('/metric-catalog', metricCatalogController.list);
router.get('/dimensions', metricCatalogController.listDimensions);
router.post(
  '/metric-catalog',
  auth.requireRole('OWNER', 'ADMIN'),
  metricCatalogController.create,
);

router.get('/dashboards', dashboardsController.list);
router.post('/dashboards', dashboardsController.create);
router.get('/dashboards/:id', dashboardsController.get);
router.put('/dashboards/:id', dashboardsController.update);
router.post('/dashboards/:id/query', dashboardsController.query);

router.get('/templates', templatesController.list);
router.post('/templates', templatesController.create);
router.get('/templates/:id', templatesController.get);
router.put('/templates/:id', templatesController.update);
router.post('/templates/:id/duplicate', templatesController.duplicate);

router.get('/reports', reportsController.list);
router.post('/reports', reportsController.create);
router.get('/reports/:id', reportsController.get);
router.get('/reports/:id/snapshots', reportsController.snapshots);
router.put('/reports/:id/layout', reportsController.updateLayout);
router.post('/reports/:id/refresh', reportsController.refresh);
router.get('/reports/:id/exports', reportExportsController.list);
router.post('/reports/:id/exports', reportExportsController.create);
router.get('/report-exports/:exportId', reportExportsController.get);

module.exports = router;
