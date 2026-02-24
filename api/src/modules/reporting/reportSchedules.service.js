const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const isoWeek = require("dayjs/plugin/isoWeek");
const { prisma } = require("../../prisma");
const { reportScheduleQueue } = require("../../queues");
const reportsService = require("./reports.service");
const reportingGeneration = require("./reportingGeneration.service");
const reportExportsService = require("./reportExports.service");
const reportingSnapshotsService = require("./reportingSnapshots.service");
const emailService = require("../../services/emailService");
const whatsappCloud = require("../../services/whatsappCloud");
const { hasBrandScope, isBrandAllowed, assertBrandAccess } = require("./reportingScope.service");

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const DEFAULT_TZ = "America/Sao_Paulo";
const BIWEEKLY_INTERVAL_DAYS = 14;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWhatsAppSummaryEnabled() {
  return process.env.WHATSAPP_REPORT_SUMMARY_ENABLED !== "false";
}

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

function mergeScheduleConfig(existing, incoming) {
  const base = resolveScheduleConfig(existing);
  const patch = resolveScheduleConfig(incoming);
  const merged = { ...base, ...patch };

  if (isPlainObject(base.whatsapp) || isPlainObject(patch.whatsapp)) {
    merged.whatsapp = {
      ...(isPlainObject(base.whatsapp) ? base.whatsapp : {}),
      ...(isPlainObject(patch.whatsapp) ? patch.whatsapp : {}),
    };
  }

  return merged;
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

  if (schedule.frequency === "WEEKLY" || schedule.frequency === "BIWEEKLY") {
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

  if (schedule.frequency === "BIWEEKLY") {
    const start = end.subtract(BIWEEKLY_INTERVAL_DAYS - 1, "day");
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

function normalizeWhatsappConfig(rawConfig) {
  if (!isPlainObject(rawConfig)) return { enabled: false };
  const next = { ...rawConfig };
  const toMode =
    next.toMode === "override" || next.toMode === "client_whatsapp"
      ? next.toMode
      : "client_whatsapp";

  return {
    enabled: next.enabled === true,
    toMode,
    toOverride: next.toOverride ? String(next.toOverride).trim() : null,
    kpis: Array.isArray(next.kpis)
      ? next.kpis.map((item) => String(item).trim()).filter(Boolean)
      : [],
    nextSteps: next.nextSteps ? String(next.nextSteps).trim() : null,
    dashboardId: next.dashboardId ? String(next.dashboardId).trim() : null,
  };
}

function isBiweeklyDue(schedule, now = dayjs()) {
  if (schedule.frequency !== "BIWEEKLY") return true;
  const config = resolveScheduleConfig(schedule.scheduleConfig);
  const lastRunAt = config.lastRunAt ? dayjs(config.lastRunAt) : null;
  if (!lastRunAt || !lastRunAt.isValid()) return true;
  return now.diff(lastRunAt, "day") >= BIWEEKLY_INTERVAL_DAYS;
}

function parseMetricValue(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "string") {
    const normalized = value
      .replace(/\s+/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const asNumber = Number(normalized);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  return null;
}

function formatMetricValue(value) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
  }
  return String(value);
}

function resolveFrontendBaseUrl() {
  const base =
    process.env.APP_PUBLIC_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.PUBLIC_APP_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "";
  return String(base || "").replace(/\/+$/, "");
}

function buildDashboardLink(dashboardId) {
  if (!dashboardId) return null;
  const base = resolveFrontendBaseUrl();
  if (!base) return null;
  return `${base}/relatorios/v2/${dashboardId}`;
}

async function collectReportMetricsForSummary(tenantId, reportId, scope, preferredKeys = []) {
  const snapshots = await reportingSnapshotsService.listReportSnapshots(
    tenantId,
    reportId,
    scope,
  );
  const items = Array.isArray(snapshots?.items) ? snapshots.items : [];

  const metricMap = new Map();
  for (const item of items) {
    const totals = isPlainObject(item?.data?.totals) ? item.data.totals : null;
    if (!totals) continue;
    for (const [key, value] of Object.entries(totals)) {
      if (!key || metricMap.has(key)) continue;
      const parsedValue = parseMetricValue(value);
      metricMap.set(key, parsedValue !== null ? parsedValue : value);
    }
  }

  const keys = preferredKeys.length
    ? preferredKeys
    : Array.from(metricMap.keys()).slice(0, 4);

  return keys
    .filter((key) => metricMap.has(key))
    .map((key) => ({
      key,
      value: metricMap.get(key),
    }));
}

function buildWhatsappSummaryMessage({
  schedule,
  dateFrom,
  dateTo,
  metrics,
  nextSteps,
  dashboardLink,
  exportUrl,
}) {
  const lines = [];
  lines.push(`Relatorio ${schedule.name || "Kondor"}`.trim());
  lines.push(`Periodo: ${dayjs(dateFrom).format("DD/MM")} a ${dayjs(dateTo).format("DD/MM")}`);
  lines.push("");

  if (metrics.length) {
    lines.push("Principais indicadores:");
    for (const metric of metrics) {
      lines.push(`- ${metric.key}: ${formatMetricValue(metric.value)}`);
    }
    lines.push("");
  }

  if (nextSteps) {
    lines.push(`Proximos passos: ${nextSteps}`);
  }

  if (dashboardLink) {
    lines.push(`Dashboard completo: ${dashboardLink}`);
  } else if (exportUrl) {
    lines.push(`Relatorio completo: ${exportUrl}`);
  }

  return lines.filter(Boolean).join("\n");
}

function resolveWhatsappRecipient(schedule, whatsappConfig) {
  if (whatsappConfig.toMode === "override" && whatsappConfig.toOverride) {
    return whatsappCloud.normalizeE164(whatsappConfig.toOverride);
  }
  if (schedule.scope !== "BRAND") return null;
  return whatsappCloud.normalizeE164(schedule?.brand?.whatsappNumberE164 || null);
}

async function sendScheduleWhatsappSummary({
  schedule,
  report,
  dateFrom,
  dateTo,
  exportResult,
  scope,
}) {
  if (!isWhatsAppSummaryEnabled()) {
    return { ok: false, skipped: true, reason: "feature_disabled" };
  }

  const config = resolveScheduleConfig(schedule.scheduleConfig);
  const whatsappConfig = normalizeWhatsappConfig(config.whatsapp);
  if (!whatsappConfig.enabled) {
    return { ok: false, skipped: true, reason: "schedule_whatsapp_disabled" };
  }
  if (schedule.scope !== "BRAND") {
    return { ok: false, skipped: true, reason: "scope_not_supported" };
  }

  const destination = resolveWhatsappRecipient(schedule, whatsappConfig);
  const exportUrl = resolveFileUrl(exportResult?.url || exportResult?.file?.url);
  const dashboardLink = buildDashboardLink(whatsappConfig.dashboardId);
  const metrics = await collectReportMetricsForSummary(
    schedule.tenantId,
    report.id,
    scope,
    whatsappConfig.kpis,
  );
  const message = buildWhatsappSummaryMessage({
    schedule,
    dateFrom,
    dateTo,
    metrics,
    nextSteps: whatsappConfig.nextSteps,
    dashboardLink,
    exportUrl,
  });

  const delivery = await prisma.reportDelivery.create({
    data: {
      tenantId: schedule.tenantId,
      reportId: report.id,
      exportId: exportResult?.export?.id || null,
      brandId: schedule.brandId || null,
      channel: "WHATSAPP",
      status: "PENDING",
      to:
        destination ||
        whatsappConfig.toOverride ||
        schedule?.brand?.whatsappNumberE164 ||
        null,
      payload: {
        kind: "schedule_whatsapp_summary",
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        kpis: metrics,
        nextSteps: whatsappConfig.nextSteps || null,
        dashboardLink: dashboardLink || null,
      },
    },
  });

  if (!destination) {
    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        error: "destination_missing",
        providerResult: {
          provider: "WHATSAPP_META_CLOUD",
          mode: "summary_text",
          error: "destination_missing",
        },
      },
    });
    return {
      ok: false,
      skipped: false,
      reason: "destination_missing",
      deliveryId: delivery.id,
    };
  }

  let integration;
  try {
    integration = await whatsappCloud.getAgencyWhatsAppIntegration(schedule.tenantId);
  } catch (err) {
    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        error: err?.message || "integration_invalid",
        providerResult: {
          provider: "WHATSAPP_META_CLOUD",
          mode: "summary_text",
          error: err?.message || "integration_invalid",
        },
      },
    });
    return {
      ok: false,
      skipped: false,
      reason: "integration_invalid",
      deliveryId: delivery.id,
      error: err?.message || "integration_invalid",
    };
  }
  if (!integration || integration.incomplete || !integration.accessToken || !integration.phoneNumberId) {
    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        error: "integration_missing",
        providerResult: {
          provider: "WHATSAPP_META_CLOUD",
          mode: "summary_text",
          error: "integration_missing",
        },
      },
    });
    return {
      ok: false,
      skipped: false,
      reason: "integration_missing",
      deliveryId: delivery.id,
    };
  }

  try {
    const sendResult = await whatsappCloud.sendTextMessage({
      phoneNumberId: integration.phoneNumberId,
      accessToken: integration.accessToken,
      toE164: destination,
      text: message,
      tenantId: schedule.tenantId,
      postId: null,
    });

    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerResult: {
          provider: "WHATSAPP_META_CLOUD",
          mode: "summary_text",
          waMessageId: sendResult?.waMessageId || null,
          raw: sendResult?.raw || null,
        },
      },
    });

    return {
      ok: true,
      deliveryId: delivery.id,
      waMessageId: sendResult?.waMessageId || null,
      destination,
      metricsCount: metrics.length,
      dashboardLink: dashboardLink || null,
    };
  } catch (err) {
    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        error: err?.message || "whatsapp_send_failed",
        providerResult: {
          provider: "WHATSAPP_META_CLOUD",
          mode: "summary_text",
          error: err?.message || "whatsapp_send_failed",
        },
      },
    });

    return {
      ok: false,
      skipped: false,
      reason: "send_failed",
      deliveryId: delivery.id,
      error: err?.message || "whatsapp_send_failed",
    };
  }
}

async function runSchedule(tenantId, scheduleId, scope) {
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
  if (hasBrandScope(scope)) {
    if (schedule.scope !== "BRAND" || !isBrandAllowed(scope, schedule.brandId)) {
      const err = new Error("Acesso negado para este cliente");
      err.statusCode = 403;
      throw err;
    }
  }

  if (!schedule.isActive) {
    return { ok: false, skipped: true, reason: "inactive" };
  }
  if (!isBiweeklyDue(schedule, dayjs())) {
    return { ok: false, skipped: true, reason: "biweekly_not_due" };
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

  const report = await reportsService.createReport(
    tenantId,
    {
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
    },
    scope,
  );

  const generation = await reportingGeneration.generateReportData(
    tenantId,
    report.id,
  );

  const exportResult = await reportExportsService.createReportExport(
    tenantId,
    report.id,
    scope,
  );

  let emailResult = { ok: false, skipped: true };
  try {
    emailResult = await sendScheduleEmails({ schedule, report, exportResult });
  } catch (err) {
    emailResult = { ok: false, error: err?.message || "email_error" };
  }

  let whatsappResult = { ok: false, skipped: true };
  try {
    whatsappResult = await sendScheduleWhatsappSummary({
      schedule,
      report,
      dateFrom,
      dateTo,
      exportResult,
      scope,
    });
  } catch (err) {
    whatsappResult = {
      ok: false,
      skipped: false,
      reason: "whatsapp_error",
      error: err?.message || "whatsapp_error",
    };
  }

  const nextConfig = resolveScheduleConfig(schedule.scheduleConfig);
  nextConfig.lastRunAt = new Date().toISOString();
  nextConfig.lastReportId = report.id;
  nextConfig.lastExportId = exportResult?.export?.id || null;
  nextConfig.lastExportUrl = resolveFileUrl(exportResult?.url || exportResult?.file?.url);
  nextConfig.lastRunStatus = generation?.status || "READY";
  nextConfig.lastEmailStatus = emailResult?.ok ? "sent" : "skipped";
  nextConfig.lastWhatsappStatus = whatsappResult?.ok
    ? "sent"
    : whatsappResult?.skipped
      ? "skipped"
      : "failed";
  nextConfig.lastWhatsappReason =
    whatsappResult?.reason ||
    (whatsappResult?.ok ? null : whatsappResult?.error || null);

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
    whatsappResult,
  };
}

async function enqueueScheduleRun(tenantId, scheduleId, scope) {
  if (!reportScheduleQueue) {
    return runSchedule(tenantId, scheduleId, scope);
  }
  if (hasBrandScope(scope)) {
    await getSchedule(tenantId, scheduleId, scope);
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

async function listSchedules(tenantId, filters = {}, scope) {
  const where = { tenantId };
  if (filters.scope) where.scope = filters.scope;
  if (filters.brandId) where.brandId = filters.brandId;
  if (filters.groupId) where.groupId = filters.groupId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (hasBrandScope(scope)) {
    where.scope = "BRAND";
    where.brandId = { in: scope.allowedBrandIds };
  }

  return prisma.reportSchedule.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

async function getSchedule(tenantId, id, scope) {
  if (!id) return null;
  const schedule = await prisma.reportSchedule.findFirst({
    where: { id, tenantId },
  });
  if (!schedule) return null;
  if (hasBrandScope(scope) && !isBrandAllowed(scope, schedule.brandId)) {
    const err = new Error("Acesso negado para este cliente");
    err.statusCode = 403;
    throw err;
  }
  return schedule;
}

async function createSchedule(tenantId, payload, scope) {
  if (hasBrandScope(scope)) {
    if (payload.scope !== "BRAND") {
      const err = new Error("Escopo invalido para este cliente");
      err.statusCode = 403;
      throw err;
    }
    assertBrandAccess(payload.brandId, scope);
  }
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

async function updateSchedule(tenantId, id, payload, scope) {
  const existing = await prisma.reportSchedule.findFirst({
    where: { id, tenantId },
  });
  if (!existing) return null;
  if (hasBrandScope(scope)) {
    if (existing.scope !== "BRAND" || !isBrandAllowed(scope, existing.brandId)) {
      const err = new Error("Acesso negado para este cliente");
      err.statusCode = 403;
      throw err;
    }
  }

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
          ? mergeScheduleConfig(existing.scheduleConfig, payload.scheduleConfig)
          : existing.scheduleConfig,
      isActive:
        payload.isActive !== undefined ? payload.isActive : existing.isActive,
    },
  });

  await upsertScheduleJob(schedule);
  return schedule;
}

async function removeSchedule(tenantId, id, scope) {
  const existing = await prisma.reportSchedule.findFirst({
    where: { id, tenantId },
  });
  if (!existing) return false;
  if (hasBrandScope(scope)) {
    if (existing.scope !== "BRAND" || !isBrandAllowed(scope, existing.brandId)) {
      const err = new Error("Acesso negado para este cliente");
      err.statusCode = 403;
      throw err;
    }
  }

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
