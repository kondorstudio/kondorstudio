const {
  createReportSchema,
  updateLayoutSchema,
  REPORT_SCOPES,
  COMPARE_MODES,
} = require('./reports.validators');
const reportsService = require('./reports.service');
const reportingSnapshots = require('./reportingSnapshots.service');
const { logReportingAction } = require('./reportingAudit.service');

function parseCreatePayload(body = {}) {
  const payload = {
    ...body,
    scope: body.scope ? String(body.scope).toUpperCase() : body.scope,
    compareMode: body.compareMode
      ? String(body.compareMode).toUpperCase()
      : body.compareMode,
  };

  const parsed = createReportSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error?.errors?.[0]?.message || 'Dados invalidos';
    const err = new Error(message);
    err.status = 400;
    throw err;
  }

  if (!REPORT_SCOPES.includes(parsed.data.scope)) {
    const err = new Error('scope invalido');
    err.status = 400;
    throw err;
  }

  if (!COMPARE_MODES.includes(parsed.data.compareMode || 'NONE')) {
    const err = new Error('compareMode invalido');
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

  if (parsed.data.compareMode === 'CUSTOM') {
    if (!parsed.data.compareDateFrom || !parsed.data.compareDateTo) {
      const err = new Error('Periodo de comparacao obrigatorio');
      err.status = 400;
      throw err;
    }
  }

  const dateFrom = reportsService.toDate(parsed.data.dateFrom);
  const dateTo = reportsService.toDate(parsed.data.dateTo);
  const compareDateFrom = reportsService.toDate(parsed.data.compareDateFrom);
  const compareDateTo = reportsService.toDate(parsed.data.compareDateTo);

  if (!dateFrom || !dateTo) {
    const err = new Error('Periodo invalido');
    err.status = 400;
    throw err;
  }

  if (parsed.data.compareMode === 'CUSTOM') {
    if (!compareDateFrom || !compareDateTo) {
      const err = new Error('Periodo de comparacao invalido');
      err.status = 400;
      throw err;
    }
  }

  return {
    ...parsed.data,
    compareMode: parsed.data.compareMode || 'NONE',
    dateFrom,
    dateTo,
    compareDateFrom: compareDateFrom || null,
    compareDateTo: compareDateTo || null,
  };
}

function parseLayoutPayload(body = {}) {
  const parsed = updateLayoutSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error?.errors?.[0]?.message || 'Dados invalidos';
    const err = new Error(message);
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
        status: req.query?.status || null,
      };
      const items = await reportsService.listReports(req.tenantId, filters);
      return res.json({ items });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao listar relatorios' });
    }
  },

  async get(req, res) {
    try {
      const report = await reportsService.getReport(req.tenantId, req.params.id);
      if (!report) {
        return res.status(404).json({ error: 'Relatorio nao encontrado' });
      }
      return res.json(report);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao buscar relatorio' });
    }
  },

  async create(req, res) {
    try {
      const payload = parseCreatePayload(req.body || {});
      const report = await reportsService.createReport(req.tenantId, payload);
      logReportingAction({
        tenantId: req.tenantId,
        userId: req.user?.id,
        action: 'create',
        resource: 'report',
        resourceId: report.id,
        ip: req.ip,
        meta: {
          scope: report.scope,
          brandId: report.brandId,
          groupId: report.groupId,
          templateId: report.templateId,
        },
      });
      return res.status(201).json(report);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao criar relatorio' });
    }
  },

  async updateLayout(req, res) {
    try {
      const payload = parseLayoutPayload(req.body || {});
      const report = await reportsService.updateReportLayout(
        req.tenantId,
        req.params.id,
        payload.widgets,
      );
      if (!report) {
        return res.status(404).json({ error: 'Relatorio nao encontrado' });
      }
      logReportingAction({
        tenantId: req.tenantId,
        userId: req.user?.id,
        action: 'update_layout',
        resource: 'report',
        resourceId: report.id,
        ip: req.ip,
        meta: {
          widgets: payload.widgets?.length || 0,
        },
      });
      return res.json(report);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao atualizar layout' });
    }
  },

  async refresh(req, res) {
    try {
      const report = await reportsService.refreshReport(req.tenantId, req.params.id);
      if (!report) {
        return res.status(404).json({ error: 'Relatorio nao encontrado' });
      }
      logReportingAction({
        tenantId: req.tenantId,
        userId: req.user?.id,
        action: 'refresh',
        resource: 'report',
        resourceId: report.id,
        ip: req.ip,
      });
      return res.json(report);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao atualizar relatorio' });
    }
  },

  async snapshots(req, res) {
    try {
      const data = await reportingSnapshots.listReportSnapshots(
        req.tenantId,
        req.params.id,
      );
      if (!data) {
        return res.status(404).json({ error: 'Relatorio nao encontrado' });
      }
      return res.json(data);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao buscar snapshots' });
    }
  },
};
