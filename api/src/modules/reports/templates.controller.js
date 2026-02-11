const { instantiateTemplateSchema, createTemplateSchema } = require('./templates.validators');
const templatesService = require('./templates.service');

function formatValidationError(error) {
  return error.flatten ? error.flatten() : error.errors || error;
}

function handleError(res, err) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Erro inesperado';
  const details = err.details || null;
  return res.status(status).json({
    error: {
      code,
      message,
      details,
    },
  });
}

async function list(req, res) {
  try {
    const items = await templatesService.listTemplates(req.tenantId);
    return res.json({ items });
  } catch (err) {
    return handleError(res, err);
  }
}

async function instantiate(req, res) {
  const parsed = instantiateTemplateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: formatValidationError(parsed.error),
      },
    });
  }

  try {
    const result = await templatesService.instantiateTemplate(
      req.tenantId,
      req.user?.id,
      req.params.id,
      parsed.data,
    );
    if (!result) {
      return res.status(404).json({
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template não encontrado', details: null },
      });
    }
    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function create(req, res) {
  const parsed = createTemplateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: formatValidationError(parsed.error),
      },
    });
  }

  try {
    const result = await templatesService.createTemplate(
      req.tenantId,
      req.user?.id,
      parsed.data,
    );
    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  list,
  instantiate,
  create,
};
