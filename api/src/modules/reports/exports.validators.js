const { z } = require('zod');

const exportSchema = z
  .object({
    format: z.enum(['pdf', 'PDF']).default('pdf'),
    theme: z.enum(['light', 'dark']).optional(),
  })
  .strict();

const globalFiltersSchema = z
  .object({
    dateRange: z
      .object({
        preset: z.enum(['last_7_days', 'last_30_days', 'custom']).optional(),
        start: z.string().optional(),
        end: z.string().optional(),
      })
      .optional(),
    platforms: z.array(z.string()).optional(),
    accounts: z.array(z.union([z.string(), z.record(z.string(), z.any())])).optional(),
    compareTo: z.enum(['previous_period', 'previous_year']).nullable().optional(),
    autoRefreshSec: z.number().optional(),
    controls: z.record(z.boolean()).optional(),
  })
  .strict()
  .optional();

const exportPdfSchema = z
  .object({
    filters: globalFiltersSchema,
    page: z.enum(['current', 'all']).default('current'),
    activePageId: z.string().uuid().optional().nullable(),
    orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  })
  .strict();

module.exports = {
  exportSchema,
  exportPdfSchema,
};
