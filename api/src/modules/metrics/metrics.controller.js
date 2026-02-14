const { metricsQuerySchema } = require('./metrics.validators');
const metricsService = require('./metrics.service');

function formatValidationError(error) {
  return error.flatten ? error.flatten() : error.errors || error;
}

function sanitizePayloadForLog(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = { ...(payload || {}) };
  if (clone.token) clone.token = '[redacted]';
  return clone;
}

function resolveInfrastructureError(err) {
  const code = String(err?.code || '').toUpperCase();
  const message = String(err?.message || '').toLowerCase();

  if (
    code === 'P1001' ||
    message.includes("can't reach database server") ||
    message.includes('can\'t reach database server')
  ) {
    return {
      status: 503,
      code: 'DB_UNAVAILABLE',
      message: 'Banco temporariamente indisponível. Tente novamente em instantes.',
      details: null,
    };
  }

  if (
    code === 'P1002' ||
    message.includes('timed out when connecting to the database') ||
    message.includes('database operation timed out')
  ) {
    return {
      status: 503,
      code: 'DB_TIMEOUT',
      message: 'Banco não respondeu a tempo. Tente novamente em instantes.',
      details: null,
    };
  }

  if (
    code === 'P2024' ||
    message.includes('timed out fetching a new connection from the connection pool')
  ) {
    return {
      status: 503,
      code: 'DB_POOL_TIMEOUT',
      message: 'Banco temporariamente sobrecarregado. Tente novamente em instantes.',
      details: null,
    };
  }

  if (
    message.includes('remaining connection slots are reserved') ||
    message.includes('too many clients already') ||
    message.includes('sorry, too many clients already')
  ) {
    return {
      status: 503,
      code: 'DB_CONNECTION_LIMIT',
      message: 'Banco temporariamente sobrecarregado. Tente novamente em instantes.',
      details: null,
    };
  }
  return null;
}

function handleError(res, err) {
  const infra = resolveInfrastructureError(err);
  if (infra) {
    return res.status(infra.status).json({
      error: {
        code: infra.code,
        message: infra.message,
        details: infra.details,
      },
    });
  }

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
    const details = formatValidationError(parsed.error);
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[metrics.query] validation failed', {
        tenantId: req.tenantId,
        userId: req.user?.id || null,
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
