const { prisma } = require("../../prisma");
const uploadsService = require("../../services/uploadsService");
const reportingSnapshots = require("./reportingSnapshots.service");

function escapeHtml(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function slugify(value) {
  return String(value || "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderTotals(totals = {}) {
  const entries = Object.entries(totals || {});
  if (!entries.length) return "<p class=\"muted\">Sem totais.</p>";
  return `
    <div class="totals">
      ${entries
        .map(
          ([key, val]) => `
            <div class="total-item">
              <span class="total-key">${escapeHtml(key)}</span>
              <span class="total-val">${escapeHtml(val)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTable(table = []) {
  if (!Array.isArray(table) || !table.length) {
    return "<p class=\"muted\">Sem tabela.</p>";
  }

  const rows = table.slice(0, 25);
  const columns = Object.keys(rows[0] || {});
  if (!columns.length) return "<p class=\"muted\">Sem colunas.</p>";

  return `
    <table class="table">
      <thead>
        <tr>${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
            <tr>
              ${columns
                .map((col) => `<td>${escapeHtml(row[col])}</td>`)
                .join("")}
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderWidget(widget, snapshot) {
  const title = widget.title || `Widget ${widget.id || ""}`.trim();
  const data = snapshot?.data || null;
  const totals = data?.totals || {};
  const table = data?.table || [];
  const series = data?.series || [];

  return `
    <section class="widget">
      <div class="widget-header">
        <div>
          <p class="widget-type">${escapeHtml(widget.widgetType || "WIDGET")}</p>
          <h3>${escapeHtml(title || "Widget")}</h3>
        </div>
        <div class="widget-meta">
          <span>${escapeHtml(widget.source || "N/A")}</span>
          <span>${escapeHtml(widget.level || "")}</span>
        </div>
      </div>
      <div class="widget-body">
        ${renderTotals(totals)}
        ${renderTable(table)}
        ${
          Array.isArray(series) && series.length
            ? `<p class="muted">Series: ${escapeHtml(series.length)} ponto(s).</p>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderReportHtml(report, snapshotItems) {
  const snapshotsByWidget = new Map();
  (snapshotItems || []).forEach((item) => {
    if (item?.widgetId) snapshotsByWidget.set(item.widgetId, item);
  });

  const widgets = Array.isArray(report.widgets) ? report.widgets : [];
  const dateFrom = formatDate(report.dateFrom);
  const dateTo = formatDate(report.dateTo);
  const scopeLabel =
    report.scope === "GROUP" ? "Grupo" : report.scope === "BRAND" ? "Marca" : "Tenant";
  const scopeName =
    report.brand?.name || report.group?.name || report.params?.brandId || report.params?.groupId;

  const widgetsHtml = widgets
    .map((widget) => renderWidget(widget, snapshotsByWidget.get(widget.id)))
    .join("");

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(report.name || "Relatorio")}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: "Manrope", "Helvetica Neue", Arial, sans-serif;
            color: #111827;
            margin: 0;
            padding: 32px;
            background: #f9fafb;
          }
          header {
            padding: 24px;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 16px;
            margin-bottom: 24px;
          }
          header h1 { margin: 0 0 8px; font-size: 24px; }
          header .meta {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            font-size: 12px;
            color: #6b7280;
          }
          .widgets {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
          }
          .widget {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            padding: 16px;
            page-break-inside: avoid;
          }
          .widget-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
          }
          .widget-header h3 {
            margin: 4px 0 0;
            font-size: 16px;
          }
          .widget-type {
            margin: 0;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.18em;
            color: #9ca3af;
          }
          .widget-meta {
            display: flex;
            flex-direction: column;
            text-align: right;
            font-size: 11px;
            color: #6b7280;
          }
          .widget-body { margin-top: 12px; }
          .totals {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            margin-bottom: 12px;
          }
          .total-item {
            padding: 8px 10px;
            border-radius: 10px;
            background: #f3f4f6;
            display: flex;
            justify-content: space-between;
            font-size: 12px;
          }
          .total-key { color: #6b7280; }
          .total-val { font-weight: 600; }
          .table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          .table th,
          .table td {
            padding: 6px 8px;
            border-bottom: 1px solid #e5e7eb;
            text-align: left;
          }
          .table th {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #6b7280;
          }
          .muted { color: #9ca3af; font-size: 11px; }
          @media print {
            body { background: #ffffff; }
            header, .widget { box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <header>
          <h1>${escapeHtml(report.name || "Relatorio")}</h1>
          <div class="meta">
            <span>Escopo: ${escapeHtml(scopeLabel)}</span>
            ${scopeName ? `<span>${escapeHtml(scopeName)}</span>` : ""}
            ${dateFrom || dateTo ? `<span>Periodo: ${escapeHtml(dateFrom)} a ${escapeHtml(dateTo)}</span>` : ""}
            <span>Status: ${escapeHtml(report.status || "DRAFT")}</span>
            <span>Gerado em: ${escapeHtml(new Date().toISOString())}</span>
          </div>
        </header>
        <main class="widgets">
          ${widgetsHtml || "<p class=\"muted\">Sem widgets.</p>"}
        </main>
      </body>
    </html>
  `;
}

async function generatePdfFromHtml(html) {
  let playwright;
  try {
    playwright = require("playwright");
  } catch (err) {
    const error = new Error("Playwright nao instalado. Rode npm install playwright.");
    error.code = "PLAYWRIGHT_MISSING";
    throw error;
  }

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "14mm", right: "14mm" },
    });
    await page.close();
    return buffer;
  } finally {
    await browser.close();
  }
}

async function createReportExport(tenantId, reportId) {
  const report = await prisma.report.findFirst({
    where: { id: reportId, tenantId },
    include: {
      widgets: true,
      brand: true,
      group: true,
    },
  });

  if (!report) {
    const err = new Error("Relatorio nao encontrado");
    err.statusCode = 404;
    throw err;
  }

  const exportRecord = await prisma.reportExport.create({
    data: {
      tenantId,
      reportId: report.id,
      status: "PROCESSING",
      format: "PDF",
    },
  });

  try {
    const snapshots = await reportingSnapshots.listReportSnapshots(tenantId, report.id);
    const html = renderReportHtml(report, snapshots?.items || []);
    const pdfBuffer = await generatePdfFromHtml(html);

    const exportSuffix = exportRecord.id.slice(0, 6);
    const filename = `${slugify(report.name || "relatorio")}-${report.id.slice(
      0,
      6,
    )}-${exportSuffix}.pdf`;
    const key = `${tenantId}/reports/${report.id}/${filename}`;

    const uploadResult = await uploadsService.uploadBuffer(pdfBuffer, filename, "application/pdf", {
      key,
      metadata: {
        reportId: report.id,
        exportId: exportRecord.id,
      },
    });

    const uploadRecord = await prisma.upload.create({
      data: {
        tenantId,
        key: uploadResult.key,
        url: uploadResult.url,
        filename,
        size: pdfBuffer.length,
        mimeType: "application/pdf",
        metadata: {
          reportId: report.id,
          exportId: exportRecord.id,
          generatedBy: "reportingExport",
        },
      },
    });

    const updated = await prisma.reportExport.update({
      where: { id: exportRecord.id },
      data: {
        status: "READY",
        fileId: uploadRecord.id,
        meta: {
          generatedAt: new Date().toISOString(),
          widgetCount: report.widgets?.length || 0,
          filename,
        },
      },
      include: { file: true },
    });

    return {
      export: updated,
      file: uploadRecord,
      url: uploadRecord.url,
    };
  } catch (err) {
    await prisma.reportExport.update({
      where: { id: exportRecord.id },
      data: {
        status: "ERROR",
        meta: {
          error: err?.message || "Falha ao gerar PDF",
        },
      },
    });
    throw err;
  }
}

async function listReportExports(tenantId, reportId) {
  return prisma.reportExport.findMany({
    where: { tenantId, reportId },
    orderBy: { createdAt: "desc" },
    include: { file: true },
  });
}

async function getReportExport(tenantId, exportId) {
  if (!exportId) return null;
  return prisma.reportExport.findFirst({
    where: { id: exportId, tenantId },
    include: { file: true },
  });
}

module.exports = {
  createReportExport,
  listReportExports,
  getReportExport,
};
