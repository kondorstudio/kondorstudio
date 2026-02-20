const { z } = require('zod');
const metricsService = require('./metrics.service');

function mapInfrastructureError(err) {
  if (!err || typeof err !== 'object') return null;

  const code = String(err.code || '').toUpperCase();
  const message = String(err.message || '').toLowerCase();

  if (code === 'P1001') {
    return {
      status: 503,
      code: 'DB_UNAVAILABLE',
      message: 'Banco indisponível no momento',
    };
  }

  if (code === 'P2024') {
    return {
      status: 503,
      code: 'DB_POOL_TIMEOUT',
      message: 'Timeout ao obter conexão do pool',
    };
  }

  if (
    message.includes('remaining connection slots') ||
    message.includes('too many clients') ||
    message.includes('connection pool')
  ) {
    return {
      status: 503,
      code: 'DB_CONNECTION_LIMIT',
      message: 'Limite de conexões do banco atingido',
    };
  }

  return null;
}

function normalizePlatforms(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .map((v) => String(v).trim().toUpperCase())
    .filter(Boolean);
}

const querySchema = z.object({
  brandId: z.string().min(1),

  dateRange: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
    preset: z.string().optional(),
  }),

  dimensions: z.array(z.string()).default([]),

  metrics: z.array(z.string()).min(1),

  filters: z.array(
    z.object({
      field: z.string(),
      op: z.string(),
      value: z.any(),
    })
  ).default([]),

  compareTo: z
    .object({
      mode: z.string().optional(),
    })
    .nullable()
    .optional(),

  limit: z.number().optional(),

  sort: z
    .object({
      field: z.string(),
      direction: z.string().optional(),
    })
    .optional(),

  pagination: z
    .object({
      page: z.number().optional(),
      pageSize: z.number().optional(),
    })
    .optional(),

  requiredPlatforms: z.array(z.string()).optional(),

  widgetId: z.string().optional(),
  widgetType: z.string().optional(),
  responseFormat: z.string().optional(),
});

async function queryMetrics(req, res) {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Tenant não identificado',
        },
      });
    }

    const parsed = querySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Payload inválido',
          details: parsed.error.issues,
        },
      });
    }

    const payload = parsed.data;

    payload.requiredPlatforms = normalizePlatforms(payload.requiredPlatforms);

    // Auto-detect platform filter if present
    const platformFilter = (payload.filters || []).find(
      (f) => f.field === 'platform'
    );

    if (platformFilter) {
      if (platformFilter.op === 'eq') {
        payload.requiredPlatforms = normalizePlatforms(platformFilter.value);
      }

      if (platformFilter.op === 'in') {
        payload.requiredPlatforms = normalizePlatforms(platformFilter.value);
      }
    }

    const result = await metricsService.queryMetrics(
      tenantId,
      payload
    );

    return res.json(result);
  } catch (err) {
    const mapped = mapInfrastructureError(err);
    const status = mapped?.status || err.status || 500;
    const code = mapped?.code || err.code || 'INTERNAL_ERROR';
    const message = mapped?.message || err.message || 'Erro ao consultar métricas';

    if (process.env.NODE_ENV !== 'test') {
      console.error('[metrics.controller]', {
        message: err.message,
        code: err.code,
        stack: err.stack,
      });
    }

    return res.status(status).json({
      error: {
        code,
        message,
        details: err.details || null,
      },
    });
  }
}

async function queryMetricsReportei(req, res) {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Tenant não identificado',
        },
      });
    }

    const parsed = querySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Payload inválido',
          details: parsed.error.issues,
        },
      });
    }

    const payload = parsed.data;

    payload.requiredPlatforms = normalizePlatforms(payload.requiredPlatforms);

    const result = await metricsService.queryMetricsReportei(
      tenantId,
      payload
    );

    return res.json(result);
  } catch (err) {
    const mapped = mapInfrastructureError(err);
    const status = mapped?.status || err.status || 500;
    const code = mapped?.code || err.code || 'INTERNAL_ERROR';
    const message = mapped?.message || err.message || 'Erro ao consultar métricas';

    if (process.env.NODE_ENV !== 'test') {
      console.error('[metrics.controller.reportei]', {
        message: err.message,
        code: err.code,
        stack: err.stack,
      });
    }

    return res.status(status).json({
      error: {
        code,
        message,
        details: err.details || null,
      },
    });
  }
}

module.exports = {
  // Backwards-compatible aliases consumed by legacy routes.
  query: queryMetrics,
  queryReportei: queryMetricsReportei,
  queryMetrics,
  queryMetricsReportei,
};
