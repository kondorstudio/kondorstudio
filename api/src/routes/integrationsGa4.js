const express = require('express');

const authMiddleware = require('../middleware/auth');
const tenantGuard = require('../middleware/tenantGuard');
const validate = require('../middleware/validate');
const {
  propertySelectSchema,
  ga4FactsSyncSchema,
  ga4BrandSettingsSchema,
} = require('../validators/ga4Validator');
const controller = require('../controllers/integrationsGa4Controller');

const router = express.Router();

router.use(authMiddleware, tenantGuard);

const requireGa4Admin = authMiddleware.requireRole('OWNER', 'ADMIN');

router.get('/oauth/start', requireGa4Admin, controller.oauthStart);
router.get('/status', controller.status);
router.post('/disconnect', requireGa4Admin, controller.disconnect);
router.get('/properties/sync', requireGa4Admin, controller.propertiesSync);
router.get('/properties', controller.propertiesList);
router.post('/properties/select', requireGa4Admin, validate(propertySelectSchema), controller.propertiesSelect);
router.post('/demo-report', controller.demoReport);
router.get('/metadata', controller.metadata);
router.get('/brands/settings', controller.brandSettingsGet);
router.post('/brands/settings', requireGa4Admin, validate(ga4BrandSettingsSchema), controller.brandSettingsUpsert);
router.post('/facts/sync', requireGa4Admin, validate(ga4FactsSyncSchema), controller.syncFacts);

module.exports = router;
