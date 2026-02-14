const { publicMetricsQuerySchema } = require('./publicReports.validators');
const publicReportsService = require('./publicReports.service');

function formatValidationError(error) {
  return error.flatten ? error.flatten() : error.errors || error;
}

function sanitizePayloadForLog(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = { ...(payload || {}) };
  if (clone.token) clone.token = '[redacted]';
  return clone;
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

async function getReport(req, res) {
  try {
    const report = await publicReportsService.getPublicReport(req.params.token);
    if (!report) {
      return res.status(404).json({
        error: { code: 'PUBLIC_REPORT_NOT_FOUND', message: 'Relatório não encontrado', details: null },
      });
    }
    return res.json(report);
  } catch (err) {
    return handleError(res, err);
  }
}

async function queryMetrics(req, res) {
  const parsed = publicMetricsQuerySchema.safeParse(req.body || {});
  if (!parsed.success) {
    const details = formatValidationError(parsed.error);
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[public.metrics.query] validation failed', {
        body: sanitizePayloadForLog(req.body || {}),
        issues: parsed.error?.issues || [],
      });
    }
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details,
        issues: parsed.error?.issues || [],
      },
    });
  }

  try {
    const { token, ...payload } = parsed.data;
    const result = await publicReportsService.queryPublicMetrics(token, payload);
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  getReport,
  queryMetrics,
};
