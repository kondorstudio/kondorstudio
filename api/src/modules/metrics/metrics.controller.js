const { metricsQuerySchema } = require('./metrics.validators');
const metricsService = require('./metrics.service');

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

async function query(req, res) {
  const parsed = metricsQuerySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: formatValidationError(parsed.error),
      },
    });
  }

  const payload = parsed.data;
  if (payload.tenantId && payload.tenantId !== req.tenantId) {
    return res.status(403).json({
      error: {
        code: 'TENANT_MISMATCH',
        message: 'tenantId inválido para este usuário',
        details: { tenantId: payload.tenantId },
      },
    });
  }

  try {
    const { tenantId: _ignored, ...safePayload } = payload;
    const useReportei = safePayload.responseFormat === 'reportei';
    const result = useReportei
      ? await metricsService.queryMetricsReportei(req.tenantId, safePayload)
      : await metricsService.queryMetrics(req.tenantId, safePayload);
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  query,
};
