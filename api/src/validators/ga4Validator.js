const { z } = require('zod');

const MAX_LIMIT = Number(process.env.GA4_MAX_LIMIT || 10000);
const MAX_OFFSET = Number(process.env.GA4_MAX_OFFSET || 1_000_000);
const MAX_BATCH_REQUESTS = Number(process.env.GA4_BATCH_MAX_REQUESTS || 5);
const MAX_FILTER_BYTES = Number(process.env.GA4_FILTER_MAX_BYTES || 20_000);

const numericString = z.string().trim().regex(/^\d+$/, 'Must be numeric');

function boundedJson(label) {
  return z
    .unknown()
    .refine((value) => {
      if (value === undefined || value === null) return true;
      try {
        const raw = JSON.stringify(value);
        return Buffer.byteLength(raw, 'utf8') <= MAX_FILTER_BYTES;
      } catch (_) {
        return false;
      }
    }, `${label} too large or invalid`);
}

const dateRangeSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

const dateRangesSchema = z.union([
  z.array(dateRangeSchema),
  z
    .object({
      type: z.string().min(1),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .passthrough(),
  dateRangeSchema,
]);

const runReportSchema = z.object({
  propertyId: numericString.optional(),
  dateRanges: dateRangesSchema.optional(),
  dateRange: dateRangesSchema.optional(),
  dimensions: z.array(z.string().trim().min(1)).optional(),
  metrics: z.array(z.string().trim().min(1)).min(1),
  dimensionFilter: boundedJson('dimensionFilter').optional(),
  metricFilter: boundedJson('metricFilter').optional(),
  orderBys: boundedJson('orderBys').optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
  offset: z.coerce.number().int().nonnegative().max(MAX_OFFSET).optional(),
});

const minuteRangeSchema = z
  .object({
    startMinutesAgo: z.coerce.number().int().min(0).max(29),
    endMinutesAgo: z.coerce.number().int().min(0).max(29),
  })
  .refine((value) => value.startMinutesAgo >= value.endMinutesAgo, {
    message: 'startMinutesAgo must be >= endMinutesAgo',
  });

const minuteRangesSchema = z.union([
  z.array(minuteRangeSchema),
  minuteRangeSchema,
  z.object({ type: z.string().min(1) }).passthrough(),
]);

const runRealtimeReportSchema = z.object({
  propertyId: numericString.optional(),
  minuteRanges: minuteRangesSchema.optional(),
  minuteRange: minuteRangesSchema.optional(),
  dimensions: z.array(z.string().trim().min(1)).optional(),
  metrics: z.array(z.string().trim().min(1)).min(1),
  dimensionFilter: boundedJson('dimensionFilter').optional(),
  metricFilter: boundedJson('metricFilter').optional(),
  orderBys: boundedJson('orderBys').optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
});

const batchRunReportsSchema = z.object({
  propertyId: numericString.optional(),
  requests: z
    .array(runReportSchema.omit({ propertyId: true }))
    .min(1)
    .max(MAX_BATCH_REQUESTS),
});

const propertySelectSchema = z.object({
  propertyId: numericString,
});

const dashboardCreateSchema = z.object({
  integrationPropertyId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  defaultDateRange: z.any().optional().nullable(),
});

const dashboardUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  defaultDateRange: z.any().optional().nullable(),
});

const widgetBaseSchema = z.object({
  type: z.enum(['NUMBER', 'LINE', 'BAR', 'TABLE', 'PIE']),
  title: z.string().trim().min(1).max(120),
  config: z.any(),
  layout: z.any().optional().nullable(),
});

const widgetCreateSchema = widgetBaseSchema;
const widgetUpdateSchema = widgetBaseSchema.partial();

module.exports = {
  runReportSchema,
  runRealtimeReportSchema,
  batchRunReportsSchema,
  propertySelectSchema,
  dashboardCreateSchema,
  dashboardUpdateSchema,
  widgetCreateSchema,
  widgetUpdateSchema,
};
