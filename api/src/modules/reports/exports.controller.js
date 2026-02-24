const {
  exportSchema,
  exportPdfSchema,
  sendWhatsappPdfSchema,
} = require('./exports.validators');
const exportsService = require('./exports.service');

function formatValidationError(error) {
  return error.flatten ? error.flatten() : error.errors || error;
}

function handleError(res, err) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Erro inesperado';
  const details = err.details || null;
  return res.status(status).json({
    error: {
      code,
      message,
      details,
    },
  });
}

async function create(req, res) {
  const parsed = exportSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: formatValidationError(parsed.error),
      },
    });
  }

  try {
    const result = await exportsService.createDashboardExport(
      req.tenantId,
      req.params.id,
      parsed.data,
    );
    const downloadUrl = `${req.protocol}://${req.get('host')}/api/reports/exports/${
      result.export.id
    }/download`;
    return res.status(201).json({
      id: result.export.id,
      status: result.export.status,
      downloadUrl,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function download(req, res) {
  try {
    const record = await exportsService.getDashboardExport(
      req.tenantId,
      req.params.exportId,
    );
    if (!record) {
      return res.status(404).json({
        error: { code: 'EXPORT_NOT_FOUND', message: 'Exportação não encontrada', details: null },
      });
    }
    if (record.status !== 'READY' || !record.file?.url) {
      return res.status(409).json({
        error: {
          code: 'EXPORT_NOT_READY',
          message: 'Exportação ainda não está pronta',
          details: { status: record.status },
        },
      });
    }
    return res.redirect(record.file.url);
  } catch (err) {
    return handleError(res, err);
  }
}

async function exportPdf(req, res) {
  const parsed = exportPdfSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: formatValidationError(parsed.error),
      },
    });
  }

  try {
    const result = await exportsService.exportDashboardPdf(
      req.tenantId,
      req.user?.id,
      req.params.id,
      parsed.data,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(result.buffer);
  } catch (err) {
    return handleError(res, err);
  }
}

async function sendWhatsapp(req, res) {
  const parsed = sendWhatsappPdfSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: formatValidationError(parsed.error),
      },
    });
  }

  try {
    const result = await exportsService.sendDashboardPdfToWhatsapp(
      req.tenantId,
      req.user?.id,
      req.params.id,
      parsed.data,
    );
    return res.status(200).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  create,
  download,
  exportPdf,
  sendWhatsapp,
};
