const { linkConnectionSchema } = require('./connections.validators');
const connectionsService = require('./connections.service');
const { logReportingAction } = require('./reportingAudit.service');

function respondReauth(res, error) {
  if (!error) return false;
  const code = error?.code;
  if (code !== 'REAUTH_REQUIRED' && code !== 'GA4_REAUTH_REQUIRED') {
    return false;
  }
  const message = 'Reconecte o GA4 para continuar.';
  res.status(409).json({ code: 'REAUTH_REQUIRED', message, error: message });
  return true;
}

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
      const connections = await connectionsService.listConnections(
        req.tenantId,
        brandId,
        req.reportingScope,
      );
      return res.json({ items: connections });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao listar conexões' });
    }
  },

  async ga4Metadata(req, res) {
    try {
      const { connectionId } = req.params;
      const data = await connectionsService.getGa4Metadata(
        req.tenantId,
        connectionId,
        req.reportingScope,
      );
      return res.json(data);
    } catch (err) {
      const status = err.status || 500;
      if (respondReauth(res, err)) return;
      return res.status(status).json({ error: err.message || 'Erro ao buscar metadata GA4' });
    }
  },

  async ga4Compatibility(req, res) {
    try {
      const { connectionId } = req.params;
      const data = await connectionsService.checkGa4Compatibility(
        req.tenantId,
        connectionId,
        req.body || {},
        req.reportingScope,
      );
      return res.json(data);
    } catch (err) {
      const status = err.status || 500;
      if (respondReauth(res, err)) return;
      return res
        .status(status)
        .json({
          error: err.message || 'Erro ao validar compatibilidade GA4',
          details: err.details || null,
          code: err.code || null,
        });
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
        req.user?.id,
        req.reportingScope,
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
        req.reportingScope,
      );
      return res.json({ items });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao listar contas' });
    }
  },
};
