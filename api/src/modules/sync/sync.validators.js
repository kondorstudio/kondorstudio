const { z } = require('zod');

const providerEnum = z.enum(['GA4', 'META', 'META_ADS']);

const rangeSchema = z
  .object({
    start: z.string().min(1).optional(),
    end: z.string().min(1).optional(),
    startDate: z.string().min(1).optional(),
    endDate: z.string().min(1).optional(),
    since: z.string().min(1).optional(),
    until: z.string().min(1).optional(),
    days: z.number().int().min(1).max(365).optional(),
  })
  .strict();

const cursorSchema = z
  .object({
    start: z.string().min(1).optional(),
    end: z.string().min(1).optional(),
    dateFrom: z.string().min(1).optional(),
    dateTo: z.string().min(1).optional(),
    since: z.string().min(1).optional(),
    until: z.string().min(1).optional(),
    metrics: z.array(z.string().min(1)).optional(),
  })
  .strict();

const baseSchema = z
  .object({
    provider: providerEnum,
    brandId: z.string().uuid(),
    integrationId: z.string().uuid().optional(),
    propertyId: z.string().min(1).optional(),
    externalAccountId: z.string().min(1).optional(),
    connectionId: z.string().min(1).optional(),
    connectionKey: z.string().min(1).optional(),
  })
  .strict();

const previewSyncSchema = baseSchema.extend({
  range: rangeSchema.optional(),
  metrics: z.array(z.string().min(1)).optional(),
  dimensions: z.array(z.string().min(1)).optional(),
});

const backfillSyncSchema = baseSchema.extend({
  range: rangeSchema.optional(),
  days: z.number().int().min(1).max(365).optional(),
  includeCampaigns: z.boolean().optional(),
});

const incrementalSyncSchema = baseSchema.extend({
  cursor: cursorSchema.optional(),
  metrics: z.array(z.string().min(1)).optional(),
});

module.exports = {
  previewSyncSchema,
  backfillSyncSchema,
  incrementalSyncSchema,
};
