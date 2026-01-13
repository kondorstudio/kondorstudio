const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const isoWeek = require("dayjs/plugin/isoWeek");
const { prisma } = require("../../prisma");
const { reportScheduleQueue } = require("../../queues");
const reportsService = require("./reports.service");
const reportingGeneration = require("./reportingGeneration.service");
const reportExportsService = require("./reportExports.service");
const emailService = require("../../services/emailService");

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const DEFAULT_TZ = "America/Sao_Paulo";

async function assertBrand(tenantId, brandId) {
  if (!brandId) return null;
  return prisma.client.findFirst({
    where: { id: brandId, tenantId },
    select: { id: true, name: true },
  });
}

async function assertGroup(tenantId, groupId) {
  if (!groupId) return null;
  return prisma.brandGroup.findFirst({
    where: { id: groupId, tenantId },
    select: { id: true, name: true },
  });
}

async function assertTemplate(tenantId, templateId) {
  if (!templateId) return null;
  return prisma.reportTemplate.findFirst({
    where: { id: templateId, tenantId },
    select: { id: true, name: true },
  });
}

function toDate(value, tz) {
  if (!value) return null;
  const parsed = dayjs.tz(value, tz || DEFAULT_TZ);
  if (!parsed.isValid()) return null;
  return parsed.toDate();
}

function normalizeRecipients(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((email) => String(email).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
  }
  return [];
}

function resolveScheduleConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  return { ...config };
}

function resolveTimezone(tz) {
  return tz && String(tz).trim() ? String(tz).trim() : DEFAULT_TZ;
}

function buildCron(schedule) {
  const config = resolveScheduleConfig(schedule.scheduleConfig);
  if (config.cron) return { cron: String(config.cron), tz: resolveTimezone(schedule.timezone) };

  const time = config.time || "09:00";
  const [hourRaw, minuteRaw] = String(time).split(":");
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  const safeHour = Number.isNaN(hour) ? 9 : hour;
  const safeMinute = Number.isNaN(minute) ? 0 : minute;

  if (schedule.frequency === "WEEKLY") {
    const dayOfWeek =
      Number.isFinite(Number(config.dayOfWeek)) ? Number(config.dayOfWeek) : 1;
    return {
      cron: `${safeMinute} ${safeHour} * * ${dayOfWeek}`,
      tz: resolveTimezone(schedule.timezone),
    };
  }

  const dayOfMonth =
    Number.isFinite(Number(config.dayOfMonth)) ? Number(config.dayOfMonth) : 1;
  return {
    cron: `${safeMinute} ${safeHour} ${dayOfMonth} * *`,
    tz: resolveTimezone(schedule.timezone),
  };
}

function buildScheduleJobId(scheduleId) {
  return `reporting-schedule:${scheduleId}`;
}

async function removeScheduleJob(scheduleId) {
  if (!reportScheduleQueue) return;
  const jobId = buildScheduleJobId(scheduleId);
  const repeatables = await reportScheduleQueue.getRepeatableJobs();
  const targets = repeatables.filter(
    (job) => job.id === jobId || (job.key && job.key.includes(jobId)),
  );

  await Promise.all(
    targets.map((job) => reportScheduleQueue.removeRepeatableByKey(job.key)),
  );

  try {
    await reportScheduleQueue.removeJobs(jobId);
  } catch (_) {
    // ignore
  }
}

async function upsertScheduleJob(schedule) {
  if (!reportScheduleQueue) return null;
  await removeScheduleJob(schedule.id);

  if (!schedule.isActive) return null;

  const { cron, tz } = buildCron(schedule);
  return reportScheduleQueue.add(
    "report_schedule",
    {
      tenantId: schedule.tenantId,
      scheduleId: schedule.id,
    },
    {
      jobId: buildScheduleJobId(schedule.id),
      repeat: { cron, tz },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

function buildDateRange(schedule, now = dayjs()) {
  const tz = resolveTimezone(schedule.timezone);
  const config = resolveScheduleConfig(schedule.scheduleConfig);
  const current = now.tz(tz);
  const end = current.startOf("day").subtract(1, "day");

  if (config.rangeDays && Number(config.rangeDays) > 0) {
    const rangeDays = Number(config.rangeDays);
    const start = end.subtract(rangeDays - 1, "day");
    return { dateFrom: start.toDate(), dateTo: end.toDate() };
  }

  if (schedule.frequency === "WEEKLY") {
    const start = end.startOf("isoWeek");
    return { dateFrom: start.toDate(), dateTo: end.toDate() };
  }

  const start = end.startOf("month");
  return { dateFrom: start.toDate(), dateTo: end.toDate() };
}

function buildCompareRange(dateFrom, dateTo, compareMode, tz) {
  if (!compareMode || compareMode === "NONE") {
    return { compareMode: "NONE", compareDateFrom: null, compareDateTo: null };
  }

  const start = dayjs(dateFrom).tz(tz);
  const end = dayjs(dateTo).tz(tz);
  if (!start.isValid() || !end.isValid()) {
    return { compareMode: "NONE", compareDateFrom: null, compareDateTo: null };
  }

  if (compareMode === "PREVIOUS_PERIOD") {
    const days = end.diff(start, "day") + 1;
    const compareEnd = start.subtract(1, "day");
    const compareStart = compareEnd.subtract(days - 1, "day");
    return {
      compareMode,
      compareDateFrom: compareStart.toDate(),
      compareDateTo: compareEnd.toDate(),
    };
  }

  if (compareMode === "PREVIOUS_YEAR") {
    return {
      compareMode,
      compareDateFrom: start.subtract(1, "year").toDate(),
      compareDateTo: end.subtract(1, "year").toDate(),
    };
  }

  return { compareMode: "CUSTOM", compareDateFrom: null, compareDateTo: null };
}

function resolveFileUrl(fileUrl) {
  if (!fileUrl) return "";
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const base =
    process.env.PUBLIC_APP_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.API_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "";
  if (!base) return fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`;
  return `${String(base).replace(/\/+$/, "")}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

async function sendScheduleEmails({ schedule, report, exportResult }) {
  const config = resolveScheduleConfig(schedule.scheduleConfig);
  const recipients = [
    ...normalizeRecipients(config.recipients),
    ...normalizeRecipients(config.emails),
    ...normalizeRecipients(config.email),
  ];

  if (!recipients.length) return { ok: false, skipped: true };

  const fileUrl = resolveFileUrl(exportResult?.url || exportResult?.file?.url);
  const subject =
    config.subject ||
    `Relatorio ${schedule.name || report?.name || "Kondor"}`.trim();
  const message =
    config.message ||
    `Seu relatorio esta pronto. Acesse o PDF em: ${fileUrl}`;

  const results = await Promise.all(
    recipients.map((to) =>
      emailService.sendEmail({
        to,
        subject,
        text: message,
        html: `<p>${message}</p>`,
      }),
    ),
  );

  return { ok: true, results, recipients };
}

async function runSchedule(tenantId, scheduleId) {
  const schedule = await prisma.reportSchedule.findFirst({
    where: { id: scheduleId, tenantId },
    include: {
      template: true,
      brand: true,
      group: true,
    },
  });

  if (!schedule) {
    const err = new Error("Agendamento nao encontrado");
    err.statusCode = 404;
    throw err;
  }

  if (!schedule.isActive) {
    return { ok: false, skipped: true, reason: "inactive" };
  }

  const tz = resolveTimezone(schedule.timezone);
  const { dateFrom, dateTo } = buildDateRange(schedule);
  const config = resolveScheduleConfig(schedule.scheduleConfig);

  const compareMode = config.compareMode || "NONE";
  let compareDateFrom = null;
  let compareDateTo = null;

  if (compareMode === "CUSTOM") {
    compareDateFrom = toDate(config.compareDateFrom, tz);
    compareDateTo = toDate(config.compareDateTo, tz);
  } else {
    const compare = buildCompareRange(dateFrom, dateTo, compareMode, tz);
    compareDateFrom = compare.compareDateFrom;
    compareDateTo = compare.compareDateTo;
  }

  const reportName = `${schedule.name} - ${dayjs(dateFrom).format("YYYY-MM-DD")} a ${dayjs(
    dateTo,
  ).format("YYYY-MM-DD")}`;

  const report = await reportsService.createReport(tenantId, {
    name: reportName,
    scope: schedule.scope,
    brandId: schedule.brandId || null,
    groupId: schedule.groupId || null,
    templateId: schedule.templateId,
    dateFrom,
    dateTo,
    compareMode,
    compareDateFrom,
    compareDateTo,
  });

  const generation = await reportingGeneration.generateReportData(
    tenantId,
    report.id,
  );

  const exportResult = await reportExportsService.createReportExport(
    tenantId,
    report.id,
  );

  let emailResult = { ok: false, skipped: true };
  try {
    emailResult = await sendScheduleEmails({ schedule, report, exportResult });
  } catch (err) {
    emailResult = { ok: false, error: err?.message || "email_error" };
  }

  const nextConfig = resolveScheduleConfig(schedule.scheduleConfig);
  nextConfig.lastRunAt = new Date().toISOString();
  nextConfig.lastReportId = report.id;
  nextConfig.lastExportId = exportResult?.export?.id || null;
  nextConfig.lastExportUrl = resolveFileUrl(exportResult?.url || exportResult?.file?.url);
  nextConfig.lastRunStatus = generation?.status || "READY";
  nextConfig.lastEmailStatus = emailResult?.ok ? "sent" : "skipped";

  await prisma.reportSchedule.update({
    where: { id: schedule.id },
    data: { scheduleConfig: nextConfig },
  });

  return {
    ok: true,
    reportId: report.id,
    exportId: exportResult?.export?.id || null,
    exportUrl: resolveFileUrl(exportResult?.url || exportResult?.file?.url),
    generation,
    emailResult,
  };
}

async function enqueueScheduleRun(tenantId, scheduleId) {
  if (!reportScheduleQueue) {
    return runSchedule(tenantId, scheduleId);
  }
  return reportScheduleQueue.add(
    "report_schedule_run",
    { tenantId, scheduleId },
    {
      jobId: `reporting-schedule-run:${scheduleId}:${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

async function listSchedules(tenantId, filters = {}) {
  const where = { tenantId };
  if (filters.scope) where.scope = filters.scope;
  if (filters.brandId) where.brandId = filters.brandId;
  if (filters.groupId) where.groupId = filters.groupId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  return prisma.reportSchedule.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

async function getSchedule(tenantId, id) {
  if (!id) return null;
  return prisma.reportSchedule.findFirst({
    where: { id, tenantId },
  });
}

async function createSchedule(tenantId, payload) {
  const template = await assertTemplate(tenantId, payload.templateId);
  if (!template) {
    const err = new Error("Template nao encontrado");
    err.statusCode = 404;
    throw err;
  }

  if (payload.scope === "BRAND") {
    const brand = await assertBrand(tenantId, payload.brandId);
    if (!brand) {
      const err = new Error("Marca nao encontrada");
      err.statusCode = 404;
      throw err;
    }
  }

  if (payload.scope === "GROUP") {
    const group = await assertGroup(tenantId, payload.groupId);
    if (!group) {
      const err = new Error("Grupo nao encontrado");
      err.statusCode = 404;
      throw err;
    }
  }

  const schedule = await prisma.reportSchedule.create({
    data: {
      tenantId,
      name: payload.name,
      scope: payload.scope,
      brandId: payload.brandId || null,
      groupId: payload.groupId || null,
      templateId: payload.templateId,
      frequency: payload.frequency,
      timezone: payload.timezone || DEFAULT_TZ,
      scheduleConfig: resolveScheduleConfig(payload.scheduleConfig),
      isActive: payload.isActive !== false,
    },
  });

  await upsertScheduleJob(schedule);
  return schedule;
}

async function updateSchedule(tenantId, id, payload) {
  const existing = await prisma.reportSchedule.findFirst({
    where: { id, tenantId },
  });
  if (!existing) return null;

  const nextScope = payload.scope !== undefined ? payload.scope : existing.scope;
  const nextBrandId =
    payload.brandId !== undefined ? payload.brandId : existing.brandId;
  const nextGroupId =
    payload.groupId !== undefined ? payload.groupId : existing.groupId;
  const nextTemplateId =
    payload.templateId !== undefined ? payload.templateId : existing.templateId;

  const template = await assertTemplate(tenantId, nextTemplateId);
  if (!template) {
    const err = new Error("Template nao encontrado");
    err.statusCode = 404;
    throw err;
  }

  if (nextScope === "BRAND") {
    const brand = await assertBrand(tenantId, nextBrandId);
    if (!brand) {
      const err = new Error("Marca nao encontrada");
      err.statusCode = 404;
      throw err;
    }
  }

  if (nextScope === "GROUP") {
    const group = await assertGroup(tenantId, nextGroupId);
    if (!group) {
      const err = new Error("Grupo nao encontrado");
      err.statusCode = 404;
      throw err;
    }
  }

  const schedule = await prisma.reportSchedule.update({
    where: { id },
    data: {
      name: payload.name !== undefined ? payload.name : existing.name,
      scope: nextScope,
      brandId: nextBrandId,
      groupId: nextGroupId,
      templateId: nextTemplateId,
      frequency:
        payload.frequency !== undefined ? payload.frequency : existing.frequency,
      timezone:
        payload.timezone !== undefined ? payload.timezone : existing.timezone,
      scheduleConfig:
        payload.scheduleConfig !== undefined
          ? {
              ...resolveScheduleConfig(existing.scheduleConfig),
              ...resolveScheduleConfig(payload.scheduleConfig),
            }
          : existing.scheduleConfig,
      isActive:
        payload.isActive !== undefined ? payload.isActive : existing.isActive,
    },
  });

  await upsertScheduleJob(schedule);
  return schedule;
}

async function removeSchedule(tenantId, id) {
  const existing = await prisma.reportSchedule.findFirst({
    where: { id, tenantId },
  });
  if (!existing) return false;

  await prisma.reportSchedule.delete({ where: { id } });
  await removeScheduleJob(id);
  return true;
}

async function syncActiveSchedules() {
  if (!reportScheduleQueue) return { ok: false, skipped: true };
  const schedules = await prisma.reportSchedule.findMany({
    where: { isActive: true },
  });
  for (const schedule of schedules) {
    await upsertScheduleJob(schedule);
  }
  return { ok: true, total: schedules.length };
}

module.exports = {
  listSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  removeSchedule,
  runSchedule,
  enqueueScheduleRun,
  upsertScheduleJob,
  removeScheduleJob,
  syncActiveSchedules,
};
