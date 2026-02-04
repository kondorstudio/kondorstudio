const crypto = require('crypto');
const { prisma } = require('../../prisma');
const uploadsService = require('../../services/uploadsService');
const { computeDashboardHealth } = require('./dashboardHealth.service');

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
    const error = new Error('Playwright nao instalado. Rode npm install playwright.');
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
    const error = new Error('Playwright nao instalado. Rode npm install playwright.');
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
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document?.body?.dataset?.exportReady === 'true',
      { timeout: 45000 },
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
  return `Relatorio - ${String(dashboardName || 'Dashboard').trim() || 'Dashboard'} - ${dateKey}.pdf`;
}

async function exportDashboardPdf(tenantId, userId, dashboardId, options = {}) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
    include: { publishedVersion: true },
  });

  if (!dashboard) {
    const err = new Error('Dashboard nao encontrado');
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
      'Nao e possivel exportar este relatorio enquanto houver conexoes pendentes.',
    );
    err.code = 'DASHBOARD_INVALID';
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

async function createDashboardExport(tenantId, dashboardId, options = {}) {
  const dashboard = await prisma.reportDashboard.findFirst({
    where: { id: dashboardId, tenantId },
    include: { publishedVersion: true },
  });

  if (!dashboard) {
    const err = new Error('Dashboard nao encontrado');
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
  getDashboardExport,
  hashToken,
};
