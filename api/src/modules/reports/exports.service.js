const crypto = require('crypto');
const { prisma } = require('../../prisma');
const uploadsService = require('../../services/uploadsService');

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
    await page.waitForTimeout(1000);
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
    });
    await page.close();
    return buffer;
  } finally {
    await browser.close();
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

  const exportRecord = await prisma.reportDashboardExport.create({
    data: {
      tenantId,
      dashboardId: dashboard.id,
      status: 'PROCESSING',
      format: String(options.format || 'PDF').toUpperCase(),
      publicTokenHash: tokenHash,
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
  getDashboardExport,
  hashToken,
};
