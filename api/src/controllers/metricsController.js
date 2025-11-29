const metricsService = require('../services/metricsService');

module.exports = {
  async list(req, res) {
    try {
      const { clientId, source, key, startTs, endTs } = req.query;

      const metrics = await metricsService.list(req.tenantId, {
        clientId,
        source,
        key,
        startTs,
        endTs,
      });

      return res.json(metrics);
    } catch (err) {
      console.error('Error listing metrics:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async create(req, res) {
    try {
      const data = req.body;

      if (!data.source || !data.key) {
        return res.status(400).json({ error: 'source and key are required' });
      }

      if (typeof data.value === 'undefined') {
        return res.status(400).json({ error: 'value is required' });
      }

      const metric = await metricsService.create(req.tenantId, data);
      return res.json(metric);
    } catch (err) {
      console.error('Error creating metric:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async getById(req, res) {
    try {
      const id = req.params.id;
      const metric = await metricsService.getById(req.tenantId, id);
      if (!metric) return res.status(404).json({ error: 'metric not found' });
      return res.json(metric);
    } catch (err) {
      console.error('Error getting metric:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async remove(req, res) {
    try {
      const id = req.params.id;
      await metricsService.remove(req.tenantId, id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Error deleting metric:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },
};
