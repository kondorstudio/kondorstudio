const { z } = require('zod');

const instantiateTemplateSchema = z
  .object({
    brandId: z.string().uuid(),
    groupId: z.string().uuid().optional().nullable(),
    nameOverride: z.string().min(1).optional(),
  })
  .strict();

const createTemplateSchema = z
  .object({
    name: z.string().min(1).max(120),
    category: z.string().min(1).max(80).optional(),
    layoutJson: z.record(z.string(), z.any()),
  })
  .strict();

module.exports = {
  instantiateTemplateSchema,
  createTemplateSchema,
};
