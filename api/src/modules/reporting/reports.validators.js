const { z } = require('zod');

const REPORT_SCOPES = ['BRAND', 'GROUP'];
const COMPARE_MODES = ['NONE', 'PREVIOUS_PERIOD', 'PREVIOUS_YEAR', 'CUSTOM'];

const createReportSchema = z.object({
  name: z.string().trim().optional(),
  scope: z.enum(REPORT_SCOPES),
  brandId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  templateId: z.string().uuid(),
  dateFrom: z.string().trim().min(1),
  dateTo: z.string().trim().min(1),
  compareMode: z.enum(COMPARE_MODES).optional(),
  compareDateFrom: z.string().trim().optional(),
  compareDateTo: z.string().trim().optional(),
});

const layoutSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
}).passthrough();

const updateLayoutSchema = z.object({
  widgets: z.array(
    z.object({
      id: z.string().uuid(),
      layout: layoutSchema,
    }),
  ).min(1),
});

module.exports = {
  REPORT_SCOPES,
  COMPARE_MODES,
  createReportSchema,
  updateLayoutSchema,
};
