const {
  previewSyncSchema,
  backfillSyncSchema,
  incrementalSyncSchema,
} = require('./sync.validators');
const syncService = require('./sync.service');

function formatValidationError(error) {
  return error.flatten ? error.flatten() : error.errors || error;
}

function handleError(res, err) {
  const status = err?.status || err?.statusCode || 500;
  const code = err?.code || 'INTERNAL_ERROR';
  const message = err?.message || 'Erro inesperado';
  const details = err?.details || null;
  return res.status(status).json({
    error: {
      code,
      message,
      details,
    },
  });
}

async function enqueuePreview(req, res) {
  const parsed = previewSyncSchema.safeParse(req.body || {});
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
    const response = await syncService.enqueueSync(
      'preview',
      req.tenantId,
      req.user?.id || null,
      parsed.data,
    );
    return res.status(202).json(response);
  } catch (err) {
    return handleError(res, err);
  }
}

async function enqueueBackfill(req, res) {
  const parsed = backfillSyncSchema.safeParse(req.body || {});
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
    const response = await syncService.enqueueSync(
      'backfill',
      req.tenantId,
      req.user?.id || null,
      parsed.data,
    );
    return res.status(202).json(response);
  } catch (err) {
    return handleError(res, err);
  }
}

async function enqueueIncremental(req, res) {
  const parsed = incrementalSyncSchema.safeParse(req.body || {});
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
    const response = await syncService.enqueueSync(
      'incremental',
      req.tenantId,
      req.user?.id || null,
      parsed.data,
    );
    return res.status(202).json(response);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  enqueuePreview,
  enqueueBackfill,
  enqueueIncremental,
};
