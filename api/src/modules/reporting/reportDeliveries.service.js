const { prisma } = require("../../prisma");
const { hasBrandScope, isBrandAllowed } = require("./reportingScope.service");

const CHANNELS = new Set(["WHATSAPP", "EMAIL"]);

function normalizeChannel(value) {
  const channel = String(value || "WHATSAPP").toUpperCase();
  if (!CHANNELS.has(channel)) {
    const err = new Error("Canal invalido para envio do relatorio");
    err.statusCode = 400;
    throw err;
  }
  return channel;
}

function normalizeScheduledAt(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const err = new Error("scheduledAt invalido");
    err.statusCode = 400;
    throw err;
  }
  return date;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildPayload(input = {}, actor) {
  if (!input || typeof input !== "object") return null;
  const omit = new Set([
    "channel",
    "via",
    "to",
    "phone",
    "email",
    "exportId",
    "reportExportId",
    "status",
    "scheduledAt",
  ]);
  const payload = {};
  Object.entries(input).forEach(([key, value]) => {
    if (omit.has(key)) return;
    if (value === undefined) return;
    payload[key] = value;
  });
  if (actor && actor.id) {
    payload.requestedBy = {
      id: actor.id,
      name: actor.name || null,
      role: actor.role || null,
      type: actor.type || null,
    };
  }
  return Object.keys(payload).length ? payload : null;
}

async function getReportOrFail(tenantId, reportId, scope) {
  const report = await prisma.report.findFirst({
    where: { id: reportId, tenantId },
    select: { id: true, brandId: true },
  });
  if (!report) {
    const err = new Error("Relatorio nao encontrado");
    err.statusCode = 404;
    throw err;
  }
  if (hasBrandScope(scope) && !isBrandAllowed(scope, report.brandId)) {
    const err = new Error("Acesso negado para este cliente");
    err.statusCode = 403;
    throw err;
  }
  return report;
}

async function listReportDeliveries(tenantId, reportId, scope) {
  await getReportOrFail(tenantId, reportId, scope);
  const where = { tenantId, reportId };
  if (hasBrandScope(scope)) {
    where.brandId = { in: scope.allowedBrandIds };
  }
  const rows = await prisma.reportDelivery.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => {
    const payload = isPlainObject(row.payload) ? row.payload : {};
    const providerResult = isPlainObject(row.providerResult) ? row.providerResult : {};
    const interactionsFromPayload = Array.isArray(payload.interactions)
      ? payload.interactions
      : [];
    const interactionsFromProvider = Array.isArray(providerResult.responses)
      ? providerResult.responses
      : [];

    const interactions = [...interactionsFromPayload, ...interactionsFromProvider]
      .filter((item) => item && typeof item === "object")
      .sort((a, b) => {
        const aTs = new Date(a.at || a.createdAt || 0).getTime();
        const bTs = new Date(b.at || b.createdAt || 0).getTime();
        return aTs - bTs;
      });

    return {
      ...row,
      interactions,
    };
  });
}

async function createReportDelivery(tenantId, reportId, payload = {}, scope, actor) {
  const report = await getReportOrFail(tenantId, reportId, scope);
  const channel = normalizeChannel(payload.channel || payload.via);
  const to = payload.to || payload.phone || payload.email || null;
  const exportId = payload.exportId || payload.reportExportId || null;
  const scheduledAt = normalizeScheduledAt(payload.scheduledAt);
  const deliveryPayload = buildPayload(payload, actor);

  return prisma.reportDelivery.create({
    data: {
      tenantId,
      reportId: report.id,
      exportId,
      brandId: report.brandId || null,
      channel,
      status: "PENDING",
      to,
      payload: deliveryPayload,
      scheduledAt,
    },
  });
}

module.exports = {
  listReportDeliveries,
  createReportDelivery,
};
