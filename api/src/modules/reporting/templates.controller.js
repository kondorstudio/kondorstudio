const { templateSchema, VISIBILITIES } = require('./templates.validators');
const templatesService = require('./templates.service');
const { logReportingAction } = require('./reportingAudit.service');

function parseTemplatePayload(body = {}, { partial = false } = {}) {
  const payload = {
    ...body,
    visibility: body.visibility ? String(body.visibility).toUpperCase() : undefined,
  };

  if (payload.visibility && !VISIBILITIES.includes(payload.visibility)) {
    const err = new Error('visibility invalida');
    err.status = 400;
    throw err;
  }

  const schema = partial ? templateSchema.partial() : templateSchema;
  const parsed = schema.safeParse(payload);
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
      const visibility = req.query?.visibility
        ? String(req.query.visibility).toUpperCase()
        : null;
      const filters = {};
      if (visibility && VISIBILITIES.includes(visibility)) {
        filters.visibility = visibility;
      }
      const items = await templatesService.listTemplates(req.tenantId, filters);
      return res.json({ items });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao listar templates' });
    }
  },

  async get(req, res) {
    try {
      const template = await templatesService.getTemplate(req.tenantId, req.params.id);
      if (!template) {
        return res.status(404).json({ error: 'Template nao encontrado' });
      }
      return res.json(template);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao buscar template' });
    }
  },

  async create(req, res) {
    try {
      const payload = parseTemplatePayload(req.body || {});
      const template = await templatesService.createTemplate(req.tenantId, payload);
      logReportingAction({
        tenantId: req.tenantId,
        userId: req.user?.id,
        action: 'create',
        resource: 'reportTemplate',
        resourceId: template.id,
        ip: req.ip,
        meta: {
          name: template.name,
          visibility: template.visibility,
        },
      });
      return res.status(201).json(template);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao criar template' });
    }
  },

  async update(req, res) {
    try {
      const payload = parseTemplatePayload(req.body || {}, { partial: true });
      const template = await templatesService.updateTemplate(req.tenantId, req.params.id, payload);
      if (!template) {
        return res.status(404).json({ error: 'Template nao encontrado' });
      }
      logReportingAction({
        tenantId: req.tenantId,
        userId: req.user?.id,
        action: 'update',
        resource: 'reportTemplate',
        resourceId: template.id,
        ip: req.ip,
        meta: {
          name: template.name,
          visibility: template.visibility,
        },
      });
      return res.json(template);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao atualizar template' });
    }
  },

  async duplicate(req, res) {
    try {
      const payload = req.body || {};
      const template = await templatesService.duplicateTemplate(
        req.tenantId,
        req.params.id,
        payload,
      );
      if (!template) {
        return res.status(404).json({ error: 'Template nao encontrado' });
      }
      logReportingAction({
        tenantId: req.tenantId,
        userId: req.user?.id,
        action: 'duplicate',
        resource: 'reportTemplate',
        resourceId: template.id,
        ip: req.ip,
        meta: {
          sourceTemplateId: req.params.id,
        },
      });
      return res.status(201).json(template);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao duplicar template' });
    }
  },
};
