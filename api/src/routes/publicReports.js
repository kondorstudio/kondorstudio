const express = require('express');
const publicReportsController = require('../modules/reports/publicReports.controller');

const router = express.Router();

router.get('/reports/:token', publicReportsController.getReport);
router.post('/metrics/query', publicReportsController.queryMetrics);

module.exports = router;
