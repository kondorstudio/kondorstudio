const express = require('express');
const metricsController = require('./metrics.controller');

const router = express.Router();

router.post(
  '/query',
  metricsController.queryMetrics || metricsController.query
);

module.exports = router;
