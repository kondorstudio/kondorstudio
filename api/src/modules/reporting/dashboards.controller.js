const { dashboardSchema, DASHBOARD_SCOPES } = require('./dashboards.validators');
const dashboardsService = require('./dashboards.service');
const { logReportingAction } = require('./reportingAudit.service');

function parsePayload(body = {}, { partial = false } = {}) {
  const payload = {
    ...body,
    scope: body.scope ? String(body.scope).toUpperCase() : body.scope,
  };

  const schema = partial ? dashboardSchema.partial() : dashboardSchema;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error?.errors?.[0]?.message || 'Dados invalidos';
    const err = new Error(message);
    err.status = 400;
    throw err;
  }

  if (parsed.data.scope && !DASHBOARD_SCOPES.includes(parsed.data.scope)) {
    const err = new Error('scope invalido');
    err.status = 400;
    throw err;
  }

  if (parsed.data.scope === 'BRAND' && !parsed.data.brandId) {
    const err = new Error('brandId obrigatorio');
    err.status = 400;
    throw err;
  }

  if (parsed.data.scope === 'GROUP' && !parsed.data.groupId) {
    const err = new Error('groupId obrigatorio');
    err.status = 400;
    throw err;
  }

  return parsed.data;
}

module.exports = {
  async list(req, res) {
    try {
      const filters = {
        scope: req.query?.scope ? String(req.query.scope).toUpperCase() : null,
        brandId: req.query?.brandId || null,
        groupId: req.query?.groupId || null,
      };
      const items = await dashboardsService.listDashboards(req.tenantId, filters);
      return res.json({ items });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao listar dashboards' });
    }
  },

  async get(req, res) {
    try {
      const dashboard = await dashboardsService.getDashboard(req.tenantId, req.params.id);
      if (!dashboard) {
        return res.status(404).json({ error: 'Dashboard nao encontrado' });
      }
      return res.json(dashboard);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao buscar dashboard' });
    }
  },

  async create(req, res) {
    try {
      const payload = parsePayload(req.body || {});
      const dashboard = await dashboardsService.createDashboard(req.tenantId, payload);
      logReportingAction({
        tenantId: req.tenantId,
        userId: req.user?.id,
        action: 'create',
        resource: 'dashboard',
        resourceId: dashboard.id,
        ip: req.ip,
        meta: {
          scope: dashboard.scope,
          brandId: dashboard.brandId,
          groupId: dashboard.groupId,
        },
      });
      return res.status(201).json(dashboard);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao criar dashboard' });
    }
  },

  async update(req, res) {
    try {
      const payload = parsePayload(req.body || {}, { partial: true });
      const dashboard = await dashboardsService.updateDashboard(
        req.tenantId,
        req.params.id,
        payload,
      );
      if (!dashboard) {
        return res.status(404).json({ error: 'Dashboard nao encontrado' });
      }
      logReportingAction({
        tenantId: req.tenantId,
        userId: req.user?.id,
        action: 'update',
        resource: 'dashboard',
        resourceId: dashboard.id,
        ip: req.ip,
        meta: {
          scope: dashboard.scope,
          brandId: dashboard.brandId,
          groupId: dashboard.groupId,
        },
      });
      return res.json(dashboard);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao atualizar dashboard' });
    }
  },

  async query(req, res) {
    try {
      const data = await dashboardsService.queryDashboardData(
        req.tenantId,
        req.params.id,
        req.body || {},
      );
      if (!data) {
        return res.status(404).json({ error: 'Dashboard nao encontrado' });
      }
      return res.json(data);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao consultar dashboard' });
    }
  },
};
