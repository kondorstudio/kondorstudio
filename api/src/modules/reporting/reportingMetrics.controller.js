const reportingMetricsService = require('./reportingMetrics.service');

module.exports = {
  async query(req, res) {
    try {
      const data = await reportingMetricsService.queryMetrics(req.tenantId, req.body || {});
      return res.json(data);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({
        error: err.message || 'Erro ao consultar metricas',
      });
    }
  },
};
