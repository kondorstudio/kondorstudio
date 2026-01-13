const { linkConnectionSchema } = require('./connections.validators');
const connectionsService = require('./connections.service');
const { logReportingAction } = require('./reportingAudit.service');

function parseLinkPayload(body = {}) {
  const parsed = linkConnectionSchema.safeParse(body || {});
  if (!parsed.success) {
    const message = parsed.error?.errors?.[0]?.message || 'Dados inválidos';
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
  return parsed.data;
}

module.exports = {
  async listByBrand(req, res) {
    try {
      const { brandId } = req.params;
      const connections = await connectionsService.listConnections(req.tenantId, brandId);
      return res.json({ items: connections });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao listar conexões' });
    }
  },

  async link(req, res) {
    try {
      const { brandId } = req.params;
      const payload = parseLinkPayload(req.body || {});
      const connection = await connectionsService.linkConnection(
        req.tenantId,
        brandId,
        payload,
      );
      logReportingAction({
        tenantId: req.tenantId,
        userId: req.user?.id,
        action: 'link',
        resource: 'dataSourceConnection',
        resourceId: connection.id,
        ip: req.ip,
        meta: {
          brandId,
          source: payload.source,
          integrationId: payload.integrationId,
          externalAccountId: payload.externalAccountId,
        },
      });
      return res.status(201).json(connection);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao vincular conexão' });
    }
  },

  async listAccounts(req, res) {
    try {
      const { integrationId } = req.params;
      const source = req.query?.source ? String(req.query.source) : null;
      if (!source) {
        return res.status(400).json({ error: 'source é obrigatório' });
      }
      const items = await connectionsService.listIntegrationAccounts(
        req.tenantId,
        integrationId,
        source,
      );
      return res.json({ items });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao listar contas' });
    }
  },
};
