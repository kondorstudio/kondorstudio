const integrationsService = require('../services/integrationsService');

module.exports = {
  async list(req, res) {
    try {
      const { provider, status } = req.query;
      const integrations = await integrationsService.list(req.tenantId, { provider, status });
      return res.json(integrations);
    } catch (err) {
      console.error('Error listing integrations:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async create(req, res) {
    try {
      const data = req.body;

      if (!data.provider) {
        return res.status(400).json({ error: 'provider is required' });
      }

      const integration = await integrationsService.create(req.tenantId, data);
      return res.json(integration);
    } catch (err) {
      console.error('Error creating integration:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async getById(req, res) {
    try {
      const id = req.params.id;
      const integration = await integrationsService.getById(req.tenantId, id);
      if (!integration) return res.status(404).json({ error: 'integration not found' });
      return res.json(integration);
    } catch (err) {
      console.error('Error getting integration:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async update(req, res) {
    try {
      const id = req.params.id;
      const data = req.body;

      const updated = await integrationsService.update(req.tenantId, id, data);
      if (!updated) return res.status(404).json({ error: 'integration not found' });
      return res.json(updated);
    } catch (err) {
      console.error('Error updating integration:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async remove(req, res) {
    try {
      const id = req.params.id;
      await integrationsService.remove(req.tenantId, id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Error deleting integration:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },
};
