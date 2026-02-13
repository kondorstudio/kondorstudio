const express = require('express');
const rateLimit = require('express-rate-limit');

const authMiddleware = require('../middleware/auth');
const tenantGuard = require('../middleware/tenantGuard');
const validate = require('../middleware/validate');
const {
  runReportSchema,
  runRealtimeReportSchema,
  batchRunReportsSchema,
  dashboardCreateSchema,
  dashboardUpdateSchema,
  widgetCreateSchema,
  widgetUpdateSchema,
} = require('../validators/ga4Validator');
const controller = require('../controllers/analyticsDashboardsController');

const router = express.Router();

router.use(authMiddleware, tenantGuard);

const ga4Limiter = rateLimit({
  windowMs: Number(process.env.GA4_RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.GA4_RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const tenantId = req.tenantId || 'unknown';
    const userId = req.user?.id || 'anon';
    const propertyId = req.body?.propertyId || 'selected';
    return `${tenantId}:${userId}:${propertyId}`;
  },
  handler: (req, res) =>
    res.status(429).json({ error: 'Too many GA4 requests' }),
});

router.get('/dashboards', controller.listDashboards);
router.post('/dashboards', validate(dashboardCreateSchema), controller.createDashboard);
router.get('/dashboards/:id', controller.getDashboard);
router.put('/dashboards/:id', validate(dashboardUpdateSchema), controller.updateDashboard);
router.delete('/dashboards/:id', controller.deleteDashboard);

router.post('/dashboards/:id/widgets', validate(widgetCreateSchema), controller.createWidget);
router.put('/widgets/:widgetId', validate(widgetUpdateSchema), controller.updateWidget);
router.delete('/widgets/:widgetId', controller.deleteWidget);

router.post('/widgets/preview', ga4Limiter, validate(runReportSchema), controller.previewWidget);
router.post('/ga4/run-report', ga4Limiter, validate(runReportSchema), controller.runReport);
router.post('/ga4/run-realtime-report', ga4Limiter, validate(runRealtimeReportSchema), controller.runRealtimeReport);
router.post('/ga4/batch-run-reports', ga4Limiter, validate(batchRunReportsSchema), controller.batchRunReports);

module.exports = router;
