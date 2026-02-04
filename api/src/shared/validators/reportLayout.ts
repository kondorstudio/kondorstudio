const crypto = require('crypto');
const { z } = require('zod');

const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const DEFAULT_REPORT_THEME = Object.freeze({
  mode: 'light',
  brandColor: '#F59E0B',
  accentColor: '#22C55E',
  bg: '#FFFFFF',
  text: '#0F172A',
  mutedText: '#64748B',
  cardBg: '#FFFFFF',
  border: '#E2E8F0',
  radius: 16,
});

const DEFAULT_FILTER_CONTROLS = Object.freeze({
  showDateRange: true,
  showPlatforms: true,
  showAccounts: true,
});

const themeSchema = z
  .object({
    mode: z.enum(['light']).default('light'),
    brandColor: hexColor.default(DEFAULT_REPORT_THEME.brandColor),
    accentColor: hexColor.default(DEFAULT_REPORT_THEME.accentColor),
    bg: hexColor.default(DEFAULT_REPORT_THEME.bg),
    text: hexColor.default(DEFAULT_REPORT_THEME.text),
    mutedText: hexColor.default(DEFAULT_REPORT_THEME.mutedText),
    cardBg: hexColor.default(DEFAULT_REPORT_THEME.cardBg),
    border: hexColor.default(DEFAULT_REPORT_THEME.border),
    radius: z.number().int().min(0).max(32).default(DEFAULT_REPORT_THEME.radius),
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
    controls: z
      .object({
        showDateRange: z.boolean().optional(),
        showPlatforms: z.boolean().optional(),
        showAccounts: z.boolean().optional(),
      })
      .strict()
      .optional(),
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
    requiredPlatforms: z.array(platformEnum).optional(),
    sort: z
      .object({
        field: z.string().min(1),
        direction: z.enum(['asc', 'desc']).default('asc'),
      })
      .strict()
      .optional(),
    limit: z.number().int().min(1).max(500).optional(),
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

const textContentSchema = z
  .object({
    text: z.string().min(1),
    format: z.enum(['plain', 'markdown']).default('plain'),
  })
  .strict();

const widgetSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(['kpi', 'timeseries', 'bar', 'table', 'pie', 'text']),
    title: z.string().min(1),
    layout: layoutSchema,
    query: querySchema.optional(),
    content: textContentSchema.optional(),
    viz: vizSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === 'text') {
      if (!value.content) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Widget text exige content',
          path: ['content'],
        });
      }
      return;
    }

    if (!value.query) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Widget exige query',
        path: ['query'],
      });
      return;
    }

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

const pageSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(60),
    widgets: z.array(widgetSchema).default([]),
  })
  .strict();

const reportLayoutSchema = z
  .object({
    theme: themeSchema.default(DEFAULT_REPORT_THEME),
    globalFilters: globalFiltersSchema,
    pages: z.array(pageSchema).optional(),
    widgets: z.array(widgetSchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasPages = Array.isArray(value.pages);
    const hasWidgets = Array.isArray(value.widgets);

    if (hasPages && hasWidgets) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'layout não pode conter pages e widgets simultaneamente',
        path: ['pages'],
      });
      return;
    }

    if (!hasPages && !hasWidgets) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'layout deve conter pages ou widgets',
        path: ['pages'],
      });
      return;
    }

    if (hasPages) {
      if (!value.pages.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'pages deve conter ao menos 1 pagina',
          path: ['pages'],
        });
        return;
      }

      const pageIds = new Set();
      const widgetIds = new Set();

      value.pages.forEach((page, pageIndex) => {
        if (pageIds.has(page.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'pages[].id deve ser único',
            path: ['pages', pageIndex, 'id'],
          });
        }
        pageIds.add(page.id);

        (page.widgets || []).forEach((widget, widgetIndex) => {
          if (widgetIds.has(widget.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'widgets[].id deve ser único no relatório inteiro',
              path: ['pages', pageIndex, 'widgets', widgetIndex, 'id'],
            });
          }
          widgetIds.add(widget.id);
        });
      });
      return;
    }

    const ids = new Set();
    (value.widgets || []).forEach((widget, index) => {
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

function generateUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

function normalizeLayout(parsedLayout) {
  const parsedTheme = themeSchema.safeParse(parsedLayout?.theme || {});
  const theme = parsedTheme.success ? parsedTheme.data : DEFAULT_REPORT_THEME;
  const globalFilters = {
    ...parsedLayout.globalFilters,
    controls: {
      ...DEFAULT_FILTER_CONTROLS,
      ...(parsedLayout.globalFilters?.controls || {}),
    },
  };

  if (Array.isArray(parsedLayout.pages) && parsedLayout.pages.length) {
    return {
      theme,
      globalFilters,
      pages: parsedLayout.pages.map((page) => ({
        id: page.id,
        name: page.name,
        widgets: Array.isArray(page.widgets) ? page.widgets : [],
      })),
    };
  }

  const widgets = Array.isArray(parsedLayout.widgets) ? parsedLayout.widgets : [];
  return {
    theme,
    globalFilters,
    pages: [
      {
        id: generateUuid(),
        name: 'Pagina 1',
        widgets,
      },
    ],
  };
}

function validateReportLayout(payload) {
  return reportLayoutSchema.parse(payload);
}

module.exports = {
  DEFAULT_REPORT_THEME,
  DEFAULT_FILTER_CONTROLS,
  reportLayoutSchema,
  validateReportLayout,
  normalizeLayout,
};
