const crypto = require('crypto');
const { prisma } = require('../../prisma');
const uploadsService = require('../../services/uploadsService');
const whatsappCloud = require('../../services/whatsappCloud');
const { computeDashboardHealth } = require('./dashboardHealth.service');

const EXPORT_RENDER_TIMEOUT_MS = Math.max(
  5_000,
  Number(process.env.REPORTS_EXPORT_RENDER_TIMEOUT_MS || 45_000),
);

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80) || 'dashboard';
}

function resolveFrontBaseUrl() {
  return (
    process.env.PUBLIC_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.APP_URL_FRONT ||
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_APP_BASE_URL ||
    'http://localhost:5173'
  );
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function generatePdfFromUrl(url) {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (err) {
    const error = new Error('Playwright não instalado. Rode npm install playwright.');
    error.code = 'PLAYWRIGHT_MISSING';
    throw error;
  }

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath,
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document?.body?.dataset?.exportReady === 'true',
      { timeout: 45000 },
    );
    await page.waitForTimeout(400);
    const buffer = await page.pdf({
      format: 'A4',
      landscape: false,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
    });
    await page.close();
    return buffer;
  } finally {
    await browser.close();
  }
}

async function generatePdfFromUrlWithOptions(url, options = {}) {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (err) {
    const error = new Error('Playwright não instalado. Rode npm install playwright.');
    error.code = 'PLAYWRIGHT_MISSING';
    throw error;
  }

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath,
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: options.orientation === 'landscape' ? 1600 : 1280,
        height: 900,
      },
    });
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: EXPORT_RENDER_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () => document?.body?.dataset?.exportReady === 'true',
      { timeout: EXPORT_RENDER_TIMEOUT_MS },
    );
    await page.waitForTimeout(400);
    const buffer = await page.pdf({
      format: 'A4',
      landscape: options.orientation === 'landscape',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });
    await page.close();
    return buffer;
  } catch (err) {
    const message = err?.message || '';
    const isTimeout =
      err?.name === 'TimeoutError' || /timeout/i.test(message);
    if (isTimeout) {
      const timeoutError = new Error(
        'Tempo limite ao preparar o dashboard para exportação. Tente novamente em instantes.',
      );
      timeoutError.code = 'EXPORT_RENDER_TIMEOUT';
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw err;
  } finally {
    await browser.close();
  }
}

function buildExportQueryString(options = {}) {
  const params = new URLSearchParams();
  params.set('export', '1');
  params.set('page', options.page === 'all' ? 'all' : 'current');
  params.set(
    'orientation',
    options.orientation === 'landscape' ? 'landscape' : 'portrait',
  );
  if (options.activePageId) {
    params.set('activePageId', options.activePageId);
  }
  const filters = options.filters && typeof options.filters === 'object'
    ? options.filters
    : {};
  params.set('filters', encodeURIComponent(JSON.stringify(filters)));
  return params.toString();
}

function buildPdfFileName(dashboardName) {
  const dateKey = new Date().toISOString().slice(0, 10);
  return `Relatório - ${String(dashboardName || 'Dashboard').trim() || 'Dashboard'} - ${dateKey}.pdf`;
}

function createServiceError(message, code, status = 500, details = null) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (details) err.details = details;
  return err;
}

function resolveUploadsPublicBaseUrl() {
  const base =
    process.env.UPLOADS_BASE_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.API_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    '';
  return String(base || '').replace(/\/+$/, '');
}

function buildPublicUploadUrl(key, fallbackUrl = null) {
  if (!key) return fallbackUrl || null;
  const base = resolveUploadsPublicBaseUrl();
  if (!base) return fallbackUrl || null;
  return `${base}/uploads/public/${encodeURIComponent(key)}`;
}

async function exportDashboardPdf(tenantId, userId, dashboardId, options = {}) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
    include: { publishedVersion: true },
  });

  if (!dashboard) {
    const err = new Error('Dashboard não encontrado');
    err.code = 'DASHBOARD_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (dashboard.status !== 'PUBLISHED' || !dashboard.publishedVersionId || !dashboard.publishedVersion) {
    const err = new Error('Dashboard precisa estar publicado');
    err.code = 'DASHBOARD_NOT_PUBLISHED';
    err.status = 400;
    throw err;
  }

  const health = await computeDashboardHealth(dashboard);
  if (health?.status === 'BLOCKED') {
    const err = new Error(
      'Não é possível exportar este relatório enquanto houver pendências bloqueantes.',
    );
    err.code = 'DASHBOARD_BLOCKED';
    err.status = 422;
    err.details = health;
    throw err;
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const exportRecord = await prisma.reportDashboardExport.create({
    data: {
      tenantId,
      dashboardId: dashboard.id,
      status: 'PROCESSING',
      format: 'PDF',
      publicTokenHash: tokenHash,
      publicTokenExpiresAt: expiresAt,
      meta: {
        purpose: 'pdf_temp_export',
        expiresAt: expiresAt.toISOString(),
        page: options.page || 'current',
        orientation: options.orientation || 'portrait',
      },
    },
  });

  const startedAt = Date.now();
  try {
    const frontBase = resolveFrontBaseUrl().replace(/\/+$/, '');
    const queryString = buildExportQueryString(options);
    const url = `${frontBase}/public/reports/${token}?${queryString}`;
    const buffer = await generatePdfFromUrlWithOptions(url, options);

    await prisma.reportDashboardExport.update({
      where: { id: exportRecord.id },
      data: {
        status: 'READY',
        publicTokenHash: null,
        publicTokenExpiresAt: null,
        publicTokenUsedAt: new Date(),
        meta: {
          ...(exportRecord.meta || {}),
          purpose: 'pdf_temp_export',
          expiresAt: expiresAt.toISOString(),
          completedAt: new Date().toISOString(),
        },
      },
    });

    return {
      buffer,
      filename: buildPdfFileName(dashboard.name),
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error('[reports-v2:pdf-export-failed]', {
      dashboardId: dashboard.id,
      tenantId,
      durationMs,
      errorCode: err?.code || 'EXPORT_PDF_FAILED',
      message: err?.message || 'Falha ao exportar PDF',
    });
    await prisma.reportDashboardExport.update({
      where: { id: exportRecord.id },
      data: {
        status: 'ERROR',
        publicTokenHash: null,
        publicTokenExpiresAt: null,
        publicTokenUsedAt: new Date(),
        meta: {
          ...(exportRecord.meta || {}),
          purpose: 'pdf_temp_export',
          expiresAt: expiresAt.toISOString(),
          error: err?.message || 'Falha ao exportar PDF',
        },
      },
    });
    throw err;
  }
}

async function sendDashboardPdfToWhatsapp(tenantId, userId, dashboardId, options = {}) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
    include: {
      brand: {
        select: {
          id: true,
          name: true,
          whatsappNumberE164: true,
          whatsappOptIn: true,
        },
      },
    },
  });

  if (!dashboard) {
    throw createServiceError('Dashboard não encontrado', 'DASHBOARD_NOT_FOUND', 404);
  }
  if (!dashboard.brand) {
    throw createServiceError('Cliente da marca não encontrado', 'CLIENT_NOT_FOUND', 404);
  }

  const toE164 = whatsappCloud.normalizeE164(dashboard.brand.whatsappNumberE164);
  if (!toE164) {
    throw createServiceError(
      'Cliente sem WhatsApp válido em formato E.164 (+55...)',
      'INVALID_CLIENT_WHATSAPP',
      400,
    );
  }
  if (dashboard.brand.whatsappOptIn === false) {
    throw createServiceError(
      'Cliente não autorizou receber mensagens por WhatsApp',
      'CLIENT_OPT_OUT',
      400,
    );
  }

  let integrationBundle = null;
  try {
    integrationBundle = await whatsappCloud.getAgencyWhatsAppIntegration(tenantId);
  } catch (err) {
    throw createServiceError(
      'Integração WhatsApp da agência inválida ou incompleta',
      'INTEGRATION_INVALID',
      500,
      { message: err?.message || null },
    );
  }
  if (
    !integrationBundle ||
    integrationBundle.incomplete ||
    !integrationBundle.accessToken ||
    !integrationBundle.phoneNumberId
  ) {
    throw createServiceError(
      'Integração WhatsApp da agência inválida ou incompleta',
      'INTEGRATION_INVALID',
      500,
    );
  }

  const exportPdfResult = await exportDashboardPdf(tenantId, userId, dashboardId, options);
  const pdfBuffer = exportPdfResult?.buffer || null;
  if (!pdfBuffer) {
    throw createServiceError(
      'Não foi possível gerar o PDF para envio',
      'EXPORT_PDF_FAILED',
      500,
    );
  }

  const uploadFilename = `${slugify(dashboard.name)}-whatsapp-${Date.now()}.pdf`;
  const uploadKey = `${tenantId}/reports-v2/${dashboard.id}/whatsapp/${uploadFilename}`;
  const uploadResult = await uploadsService.uploadBuffer(
    pdfBuffer,
    uploadFilename,
    'application/pdf',
    {
      key: uploadKey,
      metadata: {
        dashboardId: dashboard.id,
        generatedBy: 'reportsV2Whatsapp',
      },
    },
  );

  const uploadRecord = await prisma.upload.create({
    data: {
      tenantId,
      key: uploadResult.key,
      url: uploadResult.url,
      filename: uploadFilename,
      size: pdfBuffer.length,
      mimeType: 'application/pdf',
      metadata: {
        dashboardId: dashboard.id,
        generatedBy: 'reportsV2Whatsapp',
      },
    },
  });

  const publicPdfUrl = buildPublicUploadUrl(uploadResult.key, uploadResult.url);
  if (!publicPdfUrl || !/^https?:\/\//i.test(String(publicPdfUrl))) {
    throw createServiceError(
      'Não foi possível gerar URL pública do PDF',
      'EXPORT_URL_UNAVAILABLE',
      500,
    );
  }

  const customMessage =
    typeof options?.message === 'string' && options.message.trim()
      ? options.message.trim()
      : null;
  const captionLines = [
    customMessage || `Relatório ${dashboard.name || 'Kondor'} pronto.`,
    'Segue o PDF completo.',
  ];
  const caption = captionLines.filter(Boolean).join('\n');

  let mode = 'document';
  let fallbackUsed = false;
  let waMessageId = null;
  let providerRaw = null;
  let documentError = null;

  try {
    const sendResult = await whatsappCloud.sendDocumentMessage({
      phoneNumberId: integrationBundle.phoneNumberId,
      accessToken: integrationBundle.accessToken,
      toE164,
      documentUrl: publicPdfUrl,
      caption,
      filename: buildPdfFileName(dashboard.name),
      tenantId,
      postId: null,
    });
    waMessageId = sendResult?.waMessageId || null;
    providerRaw = sendResult?.raw || null;
  } catch (err) {
    documentError = err;
    fallbackUsed = true;
    mode = 'text_link';

    const textFallback = [
      customMessage || `Relatório ${dashboard.name || 'Kondor'} pronto.`,
      'Não consegui enviar o anexo, segue o link do PDF:',
      publicPdfUrl,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const fallbackResult = await whatsappCloud.sendTextMessage({
        phoneNumberId: integrationBundle.phoneNumberId,
        accessToken: integrationBundle.accessToken,
        toE164,
        text: textFallback,
        tenantId,
        postId: null,
      });
      waMessageId = fallbackResult?.waMessageId || null;
      providerRaw = fallbackResult?.raw || null;
    } catch (fallbackError) {
      throw createServiceError(
        'Falha ao enviar relatório por WhatsApp',
        'CLOUD_API_SEND_FAILED',
        500,
        {
          documentError: documentError?.message || null,
          fallbackError: fallbackError?.message || null,
        },
      );
    }
  }

  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId || null,
        action: 'report.dashboard.whatsapp.sent',
        resource: 'report_dashboard',
        resourceId: dashboard.id,
        meta: {
          dashboardId: dashboard.id,
          clientId: dashboard.brand.id,
          to: toE164,
          waMessageId,
          mode,
          fallbackUsed,
          uploadId: uploadRecord.id,
          uploadKey: uploadResult.key,
        },
      },
    });
  } catch (_) {
    // observabilidade best-effort
  }

  return {
    ok: true,
    mode,
    fallbackUsed,
    waMessageId,
    to: toE164,
    clientId: dashboard.brand.id,
    dashboardId: dashboard.id,
    uploadId: uploadRecord.id,
    uploadUrl: publicPdfUrl,
    providerRaw,
  };
}

async function createDashboardExport(tenantId, dashboardId, options = {}) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
    include: { publishedVersion: true },
  });

  if (!dashboard) {
    const err = new Error('Dashboard não encontrado');
    err.code = 'DASHBOARD_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (!dashboard.publishedVersionId || !dashboard.publishedVersion) {
    const err = new Error('Dashboard precisa estar publicado');
    err.code = 'DASHBOARD_NOT_PUBLISHED';
    err.status = 400;
    throw err;
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const exportRecord = await prisma.reportDashboardExport.create({
    data: {
      tenantId,
      dashboardId: dashboard.id,
      status: 'PROCESSING',
      format: String(options.format || 'PDF').toUpperCase(),
      publicTokenHash: tokenHash,
      publicTokenExpiresAt: expiresAt,
    },
  });

  try {
    const frontBase = resolveFrontBaseUrl().replace(/\/+$/, '');
    const url = `${frontBase}/public/reports/${token}?pdf=1`;
    const pdfBuffer = await generatePdfFromUrl(url);

    const filename = `${slugify(dashboard.name)}-${dashboard.id.slice(0, 6)}-${exportRecord.id.slice(0, 6)}.pdf`;
    const key = `${tenantId}/reports-v2/${dashboard.id}/${filename}`;

    const uploadResult = await uploadsService.uploadBuffer(
      pdfBuffer,
      filename,
      'application/pdf',
      {
        key,
        metadata: {
          dashboardId: dashboard.id,
          exportId: exportRecord.id,
        },
      },
    );

    const uploadRecord = await prisma.upload.create({
      data: {
        tenantId,
        key: uploadResult.key,
        url: uploadResult.url,
        filename,
        size: pdfBuffer.length,
        mimeType: 'application/pdf',
        metadata: {
          dashboardId: dashboard.id,
          exportId: exportRecord.id,
          generatedBy: 'reportsV2Export',
        },
      },
    });

    const updated = await prisma.reportDashboardExport.update({
      where: { id: exportRecord.id },
      data: {
        status: 'READY',
        fileId: uploadRecord.id,
        publicTokenHash: null,
        publicTokenExpiresAt: null,
        publicTokenUsedAt: new Date(),
        meta: {
          generatedAt: new Date().toISOString(),
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
    await prisma.reportDashboardExport.update({
      where: { id: exportRecord.id },
      data: {
        status: 'ERROR',
        publicTokenHash: null,
        publicTokenExpiresAt: null,
        publicTokenUsedAt: new Date(),
        meta: {
          error: err?.message || 'Falha ao gerar PDF',
        },
      },
    });
    throw err;
  }
}

async function getDashboardExport(tenantId, exportId) {
  if (!exportId) return null;
  return prisma.reportDashboardExport.findFirst({
    where: { id: exportId, tenantId },
    include: { file: true },
  });
}

module.exports = {
  createDashboardExport,
  exportDashboardPdf,
  sendDashboardPdfToWhatsapp,
  getDashboardExport,
  hashToken,
};
