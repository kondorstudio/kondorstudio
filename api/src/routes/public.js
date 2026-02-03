const express = require('express');

const router = express.Router();

const approvalsRoutes = require('./publicApprovals');
const publicReportsRoutes = require('./publicReports');

router.use(approvalsRoutes);
router.use(publicReportsRoutes);

module.exports = router;
