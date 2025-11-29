// api/src/services/reportBuilder.js
// ReportBuilder: gera PDF (ou fallback TXT) com layout do tenant, KPIs e meta.
// Exporta:
//  - buildPdfBuffer(tenant, title, meta) => { buffer, filename, contentType }
//  - buildTextBuffer(tenant, title, meta) => { buffer, filename, contentType }
//  - buildAndPersistReport(tenantId, options)
//
// Mantido conforme arquitetura original, somente com ajustes da FASE 3:
//  - buildTextBuffer implementado
//  - Fallback TXT REAL dentro de buildAndPersistReport
//  - Export atualizado

const { prisma } = require('../prisma');

let PDFDocument;
try {
  PDFDocument = require('pdfkit');
} catch (e) {
  PDFDocument = null;
}

let uploadsService;
try {
  uploadsService = require('./uploadsService');
} catch (e) {
  uploadsService = null;
}

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  console.log('[ReportBuilder]', ...args);
}

function filenameFor(tenant, slug = 'report') {
  const tpart =
    tenant && (tenant.slug || tenant.id || tenant.name)
      ? String(tenant.slug || tenant.id || tenant.name)
      : 'tenant';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = slug || 'report';
  return `${base}-${tpart}-${stamp}.pdf`;
}

/* ------------------------------------------------------------
   buildPdfBuffer
------------------------------------------------------------ */
async function buildPdfBuffer(tenant = {}, title = 'Relatório', meta = {}) {
  const safeTitle = title || 'Relatório';
  const filename = filenameFor(tenant, safeTitle.replace(/\s+/g, '-').toLowerCase());

  if (PDFDocument) {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      const endPromise = new Promise((resolve) => doc.on('end', resolve));

      // Header
      doc.fontSize(18).text(safeTitle, { align: 'left' });
      doc.moveDown(0.2);
      doc.fontSize(10).text(`Tenant: ${tenant.name || tenant.slug || tenant.id || 'unknown'}`);
      doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString()}`);
      doc.moveDown();

      // Linha divisória
      doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
      doc.moveDown();

      // KPIs
      const kpis = meta.kpis || meta.metrics || {};
      if (Object.keys(kpis).length) {
        doc.fontSize(12).text('Visão geral', { underline: true });
        doc.moveDown(0.3);
        Object.keys(kpis).forEach((key) => {
          doc.fontSize(10).text(`${key}: ${kpis[key]}`);
        });
        doc.moveDown();
      }

      // Contagens
      if (meta.postsCount != null || meta.tasksCount != null) {
        doc.fontSize(12).text('Resumo operacional', { underline: true });
        doc.moveDown(0.3);
        if (meta.postsCount != null) doc.fontSize(10).text(`Posts no período: ${meta.postsCount}`);
        if (meta.tasksCount != null) doc.fontSize(10).text(`Tasks no período: ${meta.tasksCount}`);
        doc.moveDown();
      }

      // Período
      if (meta.range && (meta.range.from || meta.range.to)) {
        doc.fontSize(12).text('Período considerado', { underline: true });
        doc.moveDown(0.3);
        if (meta.range.from) doc.fontSize(10).text(`De: ${meta.range.from}`);
        if (meta.range.to) doc.fontSize(10).text(`Até: ${meta.range.to}`);
        doc.moveDown();
      }

      // Breakdown
      const breakdown = meta.breakdown || {};
      doc.fontSize(12).text('Breakdown por tipo', { underline: true });
      doc.moveDown(0.3);
      const keys = Object.keys(breakdown);
      if (!keys.length) {
        doc.fontSize(10).text('Nenhum dado de breakdown disponível.');
      } else {
        keys.forEach((k) => {
          const v = breakdown[k] || {};
          doc.fontSize(10).text(`${k}: count=${v.count || 0} — sum=${v.sum || 0}`);
        });
      }
      doc.moveDown();

      // Detalhes (JSON)
      doc.fontSize(12).text('Detalhes (JSON resumido)', { underline: true });
      doc.moveDown(0.3);
      const metaJson = JSON.stringify(meta, null, 2);
      const metaLines = metaJson.split('\n');
      const maxLines = 120;
      for (let i = 0; i < Math.min(metaLines.length, maxLines); i++) {
        doc.fontSize(8).text(metaLines[i]);
      }
      if (metaLines.length > maxLines) {
        doc.fontSize(8).text('... (output truncado)');
      }

      doc.moveDown();
      doc.fontSize(8).text('KONDOR STUDIO — relatório automático', {
        align: 'center',
      });

      doc.end();
      await endPromise;

      const buffer = Buffer.concat(chunks);
      return { buffer, contentType: 'application/pdf', filename };
    } catch (err) {
      safeLog('buildPdfBuffer: erro ao gerar PDF, fallback TXT', err?.message || err);
    }
  }

  // Falha no PDF ⇒ TXT
  return buildTextBuffer(tenant, title, meta);
}

/* ------------------------------------------------------------
   buildTextBuffer (NOVO - obrigatório na Fase 3)
------------------------------------------------------------ */
function buildTextBuffer(tenant = {}, title = 'Relatório', meta = {}) {
  const safeTitle = title || 'Relatório';
  let filename = filenameFor(tenant, safeTitle.replace(/\s+/g, '-').toLowerCase());
  filename = filename.replace('.pdf', '.txt');

  const txt = [
    safeTitle,
    `Tenant: ${tenant.name || tenant.slug || tenant.id || 'unknown'}`,
    `Gerado em: ${new Date().toLocaleString()}`,
    '',
    'Resumo (fallback TXT):',
    JSON.stringify(meta, null, 2),
  ].join('\n');

  return {
    buffer: Buffer.from(txt, 'utf-8'),
    contentType: 'text/plain',
    filename,
  };
}

/* ------------------------------------------------------------
   buildAndPersistReport
------------------------------------------------------------ */
async function buildAndPersistReport(tenantId, arg1, arg2, arg3) {
  if (!tenantId) throw new Error('tenantId required for buildAndPersistReport');

  let title, meta, options;
  if (typeof arg1 === 'string' || arg1 == null) {
    title = arg1 || 'Relatório';
    meta = arg2 || {};
    options = arg3 || {};
  } else {
    options = arg1 || {};
    title = options.title || options.name || 'Relatório';
    meta = options.meta || options.summary || {};
  }

  const name = options.name || title || 'Relatório';
  const type = options.type || 'custom';

  const baseParams =
    options.params && typeof options.params === 'object' ? options.params : {};

  const summary = options.summary || meta.summary || null;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const tenantCtx = tenant || { id: tenantId };

  const metaForPdf = {
    ...meta,
    summary,
    type,
    name,
    params: baseParams,
    range: options.range || meta.range || null,
    generatedAt: new Date().toISOString(),
  };

  // -------------------------------
  // Geração do PDF com fallback TXT
  // -------------------------------
  let pdfResult;
  try {
    pdfResult = await buildPdfBuffer(tenantCtx, title, metaForPdf);
  } catch (err) {
    safeLog('Erro no buildPdfBuffer ⇒ fallback TXT', err?.message || err);
    pdfResult = buildTextBuffer(tenantCtx, title, metaForPdf);
  }

  const { buffer, contentType, filename } = pdfResult;

  // -------------------------------
  // Upload
  // -------------------------------
  let uploadRecord = null;
  if (uploadsService && typeof uploadsService.uploadBuffer === 'function') {
    try {
      const uploadResult = await uploadsService.uploadBuffer(
        buffer,
        filename,
        contentType,
        {
          metadata: {
            generatedBy: 'reportBuilder',
            tenantId,
            type,
          },
        }
      );

      uploadRecord = await prisma.upload.create({
        data: {
          tenantId,
          key: uploadResult.key,
          url: uploadResult.url,
          filename,
          size: buffer.length,
          mimeType: contentType,
          metadata: {
            generatedBy: 'reportBuilder',
            type,
            params: baseParams,
          },
        },
      });
    } catch (err) {
      safeLog('Erro ao fazer upload (continuando sem fileId)', err?.message || err);
    }
  }

  const now = new Date();
  const fileId = uploadRecord ? uploadRecord.id : null;

  // -------------------------------
  // Criação ou atualização do Report
  // -------------------------------
  let report = null;
  const reportId =
    options.reportId || options.existingReportId || (options.report && options.report.id);

  if (reportId) {
    const existing = await prisma.report.findFirst({
      where: { id: reportId, tenantId },
    });

    if (existing) {
      report = await prisma.report.update({
        where: { id: existing.id },
        data: {
          name: name || existing.name,
          type: type || existing.type,
          params: {
            ...(existing.params || {}),
            ...baseParams,
            ...(summary ? { summary } : {}),
          },
          status: 'ready',
          generatedAt: now,
          fileId,
        },
      });
    }
  }

  if (!report) {
    report = await prisma.report.create({
      data: {
        tenantId,
        name,
        type,
        params: {
          ...baseParams,
          ...(summary ? { summary } : {}),
        },
        status: 'ready',
        generatedAt: now,
        fileId,
      },
    });
  }

  return {
    ok: true,
    report,
    upload: uploadRecord,
    filename,
  };
}

/* ------------------------------------------------------------
   EXPORTS
------------------------------------------------------------ */
module.exports = {
  buildPdfBuffer,
  buildTextBuffer,
  buildAndPersistReport,
};
