const express = require('express');

const router = express.Router();

const connectionsController = require('./connections.controller');

router.get('/health', (req, res) => {
  return res.json({ ok: true, module: 'reporting' });
});

router.get('/brands/:brandId/connections', connectionsController.listByBrand);
router.post('/brands/:brandId/connections/link', connectionsController.link);
router.get('/integrations/:integrationId/accounts', connectionsController.listAccounts);

module.exports = router;
