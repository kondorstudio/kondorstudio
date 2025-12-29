const integrationsService = require('../services/integrationsService');
const { getClientScope, isClientAllowed } = require('../middleware/teamAccess');

module.exports = {
  async list(req, res) {
    try {
      const { provider, status, clientId, ownerType, ownerKey, kind } = req.query;
      const scope = getClientScope(req);
      if (clientId && !isClientAllowed(req, clientId)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }
      const integrations = await integrationsService.list(req.tenantId, {
        provider,
        status,
        clientId,
        ownerType,
        ownerKey,
        kind,
        clientIds: scope.all || clientId ? null : scope.clientIds,
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
      const clientId = data?.clientId || data?.client_id;
      if (clientId && !isClientAllowed(req, clientId)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

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
      if (integration.clientId && !isClientAllowed(req, integration.clientId)) {
        return res.status(403).json({ error: 'Sem acesso a esta integracao' });
      }
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
      if (updated.clientId && !isClientAllowed(req, updated.clientId)) {
        return res.status(403).json({ error: 'Sem acesso a esta integracao' });
      }
      return res.json(updated);
    } catch (err) {
      console.error('Error updating integration:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async remove(req, res) {
    try {
      const id = req.params.id;
      const integration = await integrationsService.getById(req.tenantId, id);
      if (!integration) return res.status(404).json({ error: 'integration not found' });
      if (integration.clientId && !isClientAllowed(req, integration.clientId)) {
        return res.status(403).json({ error: 'Sem acesso a esta integracao' });
      }
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
      if (clientId && !isClientAllowed(req, clientId)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }
      const integration = await integrationsService.connectClientIntegration(
        req.tenantId,
        clientId,
        provider,
        req.body || {},
      );
      return res.json(integration);
    } catch (err) {
      console.error('Error connecting client integration:', err);
      return res.status(400).json({ error: err.message || 'Erro ao conectar integração' });
    }
  },

  async disconnect(req, res) {
    try {
      const id = req.params.id;
      const integration = await integrationsService.getById(req.tenantId, id);
      if (!integration) return res.status(404).json({ error: 'integration not found' });
      if (integration.clientId && !isClientAllowed(req, integration.clientId)) {
        return res.status(403).json({ error: 'Sem acesso a esta integracao' });
      }
      const updated = await integrationsService.disconnect(req.tenantId, id);
      if (!updated) return res.status(404).json({ error: 'integration not found' });
      return res.json(updated);
    } catch (err) {
      console.error('Error disconnecting integration:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },
};
