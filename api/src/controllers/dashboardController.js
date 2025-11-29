const dashboardService = require('../services/dashboardService');

module.exports = {
  async summary(req, res) {
    try {
      const { range, clientId } = req.query;

      const data = await dashboardService.getSummary(req.tenantId, {
        range,
        clientId,
      });

      return res.json(data);
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },
};
