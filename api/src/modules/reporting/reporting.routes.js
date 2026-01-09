const express = require('express');

const router = express.Router();

const auth = require('../../middleware/auth');
const connectionsController = require('./connections.controller');
const metricCatalogController = require('./metricCatalog.controller');

router.get('/health', (req, res) => {
  return res.json({ ok: true, module: 'reporting' });
});

router.get('/brands/:brandId/connections', connectionsController.listByBrand);
router.post('/brands/:brandId/connections/link', connectionsController.link);
router.get('/integrations/:integrationId/accounts', connectionsController.listAccounts);
router.get('/metric-catalog', metricCatalogController.list);
router.get('/dimensions', metricCatalogController.listDimensions);
router.post(
  '/metric-catalog',
  auth.requireRole('OWNER', 'ADMIN'),
  metricCatalogController.create,
);

module.exports = router;
