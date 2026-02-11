const { z } = require('zod');

const DASHBOARD_SCOPES = ['BRAND', 'GROUP', 'TENANT'];

const dashboardSchema = z.object({
  name: z.string().trim().min(1, 'name obrigatorio'),
  scope: z.enum(DASHBOARD_SCOPES),
  brandId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  layoutSchema: z.array(z.any()).optional(),
  widgetsSchema: z.array(z.any()).optional(),
  globalFiltersSchema: z.record(z.string(), z.any()).optional(),
});

module.exports = {
  DASHBOARD_SCOPES,
  dashboardSchema,
};
