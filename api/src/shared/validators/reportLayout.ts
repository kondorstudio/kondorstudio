const { z } = require('zod');

const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const themeSchema = z
  .object({
    mode: z.enum(['light']),
    brandColor: hexColor,
    accentColor: hexColor,
    bg: hexColor,
    text: hexColor,
    mutedText: hexColor,
    cardBg: hexColor,
    border: hexColor,
    radius: z.number().int().nonnegative(),
  })
  .strict();

const dateRangeSchema = z
  .object({
    preset: z.enum(['last_7_days', 'last_30_days', 'custom']),
    start: dateKey.optional(),
    end: dateKey.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.preset === 'custom') {
      if (!value.start || !value.end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'dateRange.start e dateRange.end são obrigatórios quando preset=custom',
        });
      }
    }
  })
  .strict();

const platformEnum = z.enum([
  'META_ADS',
  'GOOGLE_ADS',
  'TIKTOK_ADS',
  'LINKEDIN_ADS',
  'GA4',
  'GMB',
  'FB_IG',
]);

const globalFiltersSchema = z
  .object({
    dateRange: dateRangeSchema,
    platforms: z.array(platformEnum).default([]),
    accounts: z
      .array(
        z
          .object({
            platform: platformEnum,
            external_account_id: z.string().min(1),
          })
          .strict(),
      )
      .default([]),
    compareTo: z.enum(['previous_period', 'previous_year']).nullable().optional(),
    autoRefreshSec: z.union([
      z.literal(0),
      z.literal(30),
      z.literal(60),
      z.literal(300),
    ]),
  })
  .strict();

const dimensionEnum = z.enum(['date', 'platform', 'account_id', 'campaign_id']);
const filterSchema = z
  .object({
    field: z.enum(['platform', 'campaign_id', 'account_id']),
    op: z.enum(['eq', 'in']),
    value: z.union([
      z.string().min(1),
      z.array(z.string().min(1)).min(1),
    ]),
  })
  .strict();

const querySchema = z
  .object({
    dimensions: z.array(dimensionEnum).default([]),
    metrics: z.array(z.string().min(1)).min(1),
    filters: z.array(filterSchema).default([]),
  })
  .strict();

const layoutSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    minW: z.number().int().positive(),
    minH: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    if (value.minW > value.w) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'layout.minW não pode ser maior que layout.w',
      });
    }
    if (value.minH > value.h) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'layout.minH não pode ser maior que layout.h',
      });
    }
  })
  .strict();

const vizSchema = z
  .object({
    variant: z.string().optional(),
    showLegend: z.boolean().optional(),
    format: z.string().optional(),
    options: z.record(z.any()).optional(),
  })
  .strict()
  .optional();

const widgetSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(['kpi', 'timeseries', 'bar', 'table', 'pie']),
    title: z.string().min(1),
    layout: layoutSchema,
    query: querySchema,
    viz: vizSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const dimensions = Array.isArray(value.query?.dimensions)
      ? value.query.dimensions
      : [];

    if (value.type === 'kpi') {
      if (dimensions.length > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Widget KPI aceita no máximo 1 dimensão',
        });
      }
      if (dimensions.length === 1 && dimensions[0] !== 'date') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Widget KPI com dimensão deve usar apenas date',
        });
      }
    }

    if (value.type === 'timeseries') {
      if (dimensions.length !== 1 || dimensions[0] !== 'date') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Widget timeseries exige dimensão date',
        });
      }
    }

    if (value.type === 'bar') {
      if (dimensions.length !== 1 || dimensions[0] === 'date') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Widget bar exige uma dimensão não-date',
        });
      }
    }

    if (value.type === 'pie') {
      if (dimensions.length !== 1 || dimensions[0] === 'date') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Widget pie exige uma dimensão não-date',
        });
      }
    }
  });

const reportLayoutSchema = z
  .object({
    theme: themeSchema,
    globalFilters: globalFiltersSchema,
    widgets: z.array(widgetSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set();
    value.widgets.forEach((widget, index) => {
      if (ids.has(widget.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'widgets[].id deve ser único',
          path: ['widgets', index, 'id'],
        });
      }
      ids.add(widget.id);
    });
  });

function validateReportLayout(payload) {
  return reportLayoutSchema.parse(payload);
}

module.exports = {
  reportLayoutSchema,
  validateReportLayout,
};
