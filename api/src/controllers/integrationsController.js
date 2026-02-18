const integrationsService = require('../services/integrationsService');

module.exports = {
  async list(req, res) {
    try {
      const { provider, status, clientId, ownerType, ownerKey, kind } = req.query;
      const integrations = await integrationsService.list(req.tenantId, {
        provider,
        status,
        clientId,
        ownerType,
        ownerKey,
        kind,
      });
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
      return res.status(err?.status || 500).json({ error: err?.message || 'server error' });
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
      return res.status(err?.status || 500).json({ error: err?.message || 'server error' });
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

  async connectForClient(req, res) {
    try {
      const { clientId, provider } = req.params;
      const integration = await integrationsService.connectClientIntegration(
        req.tenantId,
        clientId,
        provider,
        req.body || {},
      );
      return res.json(integration);
    } catch (err) {
      console.error('Error connecting client integration:', err);
      return res.status(err?.status || 400).json({ error: err?.message || 'Erro ao conectar integração' });
    }
  },

  async disconnect(req, res) {
    try {
      const id = req.params.id;
      const integration = await integrationsService.disconnect(req.tenantId, id);
      if (!integration) return res.status(404).json({ error: 'integration not found' });
      return res.json(integration);
    } catch (err) {
      console.error('Error disconnecting integration:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async storeCredential(req, res) {
    try {
      const id = req.params.id;
      const result = await integrationsService.storeCredentialRef(
        req.tenantId,
        id,
        req.body || {},
      );
      if (!result) return res.status(404).json({ error: 'integration not found' });
      return res.json(result);
    } catch (err) {
      console.error('Error storing integration credential:', err);
      const status = err?.status || 500;
      return res.status(status).json({ error: err?.message || 'server error' });
    }
  },
};
