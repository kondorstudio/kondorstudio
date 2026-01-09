const { z } = require('zod');
const { DATA_SOURCES } = require('./connections.validators');

const METRIC_CATALOG_TYPES = ['METRIC', 'DIMENSION'];

const createMetricSchema = z.object({
  source: z.enum(DATA_SOURCES),
  level: z.string().trim().min(1),
  metricKey: z.string().trim().min(1),
  dimensionKey: z.string().trim().optional(),
  label: z.string().trim().min(1),
  type: z.enum(METRIC_CATALOG_TYPES),
  supportedCharts: z.array(z.string().trim().min(1)).optional(),
  supportedBreakdowns: z.array(z.string().trim().min(1)).optional(),
  isDefault: z.boolean().optional(),
});

module.exports = {
  METRIC_CATALOG_TYPES,
  createMetricSchema,
};
