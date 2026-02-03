const { z } = require('zod');

const exportSchema = z
  .object({
    format: z.enum(['pdf', 'PDF']).default('pdf'),
    theme: z.enum(['light', 'dark']).optional(),
  })
  .strict();

module.exports = {
  exportSchema,
};
