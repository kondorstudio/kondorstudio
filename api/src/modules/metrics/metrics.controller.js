const { z } = require('zod');
const metricsService = require('./metrics.service');

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
    const tenantId = req.user?.tenantId;

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
    const status = err.status || 500;

    if (process.env.NODE_ENV !== 'test') {
      console.error('[metrics.controller]', {
        message: err.message,
        code: err.code,
        stack: err.stack,
      });
    }

    return res.status(status).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Erro ao consultar métricas',
        details: err.details || null,
      },
    });
  }
}

async function queryMetricsReportei(req, res) {
  try {
    const tenantId = req.user?.tenantId;

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
    const status = err.status || 500;

    if (process.env.NODE_ENV !== 'test') {
      console.error('[metrics.controller.reportei]', {
        message: err.message,
        code: err.code,
        stack: err.stack,
      });
    }

    return res.status(status).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Erro ao consultar métricas',
        details: err.details || null,
      },
    });
  }
}

module.exports = {
  queryMetrics,
  queryMetricsReportei,
};