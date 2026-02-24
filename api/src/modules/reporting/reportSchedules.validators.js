const { z } = require("zod");

const REPORT_SCOPES = ["BRAND", "GROUP"];
const REPORT_FREQUENCIES = ["WEEKLY", "MONTHLY", "BIWEEKLY"];
const COMPARE_MODES = ["NONE", "PREVIOUS_PERIOD", "PREVIOUS_YEAR", "CUSTOM"];

const scheduleWhatsappSchema = z
  .object({
    enabled: z.boolean().optional(),
    toMode: z.enum(["client_whatsapp", "override"]).optional(),
    toOverride: z.string().optional(),
    kpis: z.array(z.string()).optional(),
    nextSteps: z.string().optional(),
    dashboardId: z.string().optional(),
  })
  .partial();

const scheduleConfigSchema = z
  .object({
    recipients: z.array(z.string().email()).optional(),
    emails: z.union([z.array(z.string().email()), z.string()]).optional(),
    email: z.string().email().optional(),
    compareMode: z.enum(COMPARE_MODES).optional(),
    compareDateFrom: z.string().optional(),
    compareDateTo: z.string().optional(),
    rangeDays: z.number().int().min(1).max(365).optional(),
    cron: z.string().optional(),
    time: z.string().optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    subject: z.string().optional(),
    message: z.string().optional(),
    whatsapp: scheduleWhatsappSchema.optional(),
  })
  .partial();

const createScheduleSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(REPORT_SCOPES),
  brandId: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  templateId: z.string().min(1),
  frequency: z.enum(REPORT_FREQUENCIES),
  timezone: z.string().optional(),
  scheduleConfig: scheduleConfigSchema.optional(),
  isActive: z.boolean().optional(),
});

const updateScheduleSchema = createScheduleSchema.partial();

module.exports = {
  REPORT_SCOPES,
  REPORT_FREQUENCIES,
  COMPARE_MODES,
  createScheduleSchema,
  updateScheduleSchema,
  scheduleConfigSchema,
};
