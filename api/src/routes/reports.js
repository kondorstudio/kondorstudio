// api/src/routes/reports.js
// DEPRECATED (legado PDF/TXT): mantido apenas por compatibilidade.
// TODO: remover após migração total para Reports V2.
// Rotas para relatórios (PDF, métricas, etc.) do KONDOR STUDIO.
// Multi-tenant e protegidas por auth.

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const reportsService = require('../services/reportsService');
const automationEngine = require('../services/automationEngine');
const { prisma } = require('../prisma');
let whatsappProvider = null;
let uploadsService = null;

try {
  // uploadsService é opcional, mas se existir usamos para gerar URL segura de download
  // eslint-disable-next-line global-require
  uploadsService = require('../services/uploadsService');
} catch (err) {
  // se não existir, apenas logamos em dev
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.warn('[reports.routes] uploadsService não disponível:', err && err.message ? err.message : err);
  }
}

try {
  // provider é opcional, mas se existir usamos para envio via WhatsApp
  // eslint-disable-next-line global-require
  whatsappProvider = require('../services/whatsappProvider');
} catch (e) {
  whatsappProvider = null;
}

// Protegido e multi-tenant
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * GET /reports
 * Lista relatórios do tenant.
 * Query params:
 *  - clientId (opcional)
 *  - type (opcional)
 */
router.get('/', async (req, res) => {
  try {
    const { clientId, type } = req.query;
    const reports = await reportsService.list(req.tenantId, {
      clientId: clientId || undefined,
      type: type || undefined,
    });
    return res.json(reports);
  } catch (err) {
    console.error('GET /reports error:', err);
    return res.status(500).json({ error: 'Erro ao listar relatórios' });
  }
});

/**
 * POST /reports/generate
 * Enfileira geração de relatório e cria o registro inicial.
 * Body:
 *  - name (opcional)
 *  - type (opcional)
 *  - clientId (opcional)
 *  - integrationId (opcional)
 *  - provider (opcional)
 *  - metricTypes (array opcional)
 *  - rangeFrom / rangeTo / rangeDays
 *  - sendWhatsApp (boolean)
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      name,
      type,
      clientId,
      integrationId,
      provider,
      metricTypes,
      rangeFrom,
      rangeTo,
      rangeDays,
      sendWhatsApp,
    } = req.body || {};

    let effectiveClientId = clientId || null;

    if (integrationId) {
      const integration = await prisma.integration.findFirst({
        where: { id: integrationId, tenantId: req.tenantId },
        select: { id: true, clientId: true },
      });

      if (!integration) {
        return res.status(404).json({ error: 'Integração não encontrada' });
      }

      if (clientId && integration.clientId && integration.clientId !== clientId) {
        return res
          .status(400)
          .json({ error: 'Integração não pertence ao cliente informado' });
      }

      if (!effectiveClientId) {
        effectiveClientId = integration.clientId || null;
      }
    }

    const report = await reportsService.create(req.tenantId, req.user?.id || null, {
      name,
      type,
      status: 'pending',
      params: {
        clientId: effectiveClientId,
        integrationId: integrationId || null,
        provider: provider || null,
        metricTypes: Array.isArray(metricTypes) ? metricTypes : null,
        rangeFrom: rangeFrom || null,
        rangeTo: rangeTo || null,
        rangeDays: rangeDays || null,
        sendWhatsApp: !!sendWhatsApp,
      },
    });

    const job = await automationEngine.enqueueJob(req.tenantId, {
      jobType: 'report_generation',
      name: 'report_generation',
      referenceId: report.id,
      payload: {
        reportId: report.id,
        clientId: effectiveClientId,
        integrationId: integrationId || null,
        provider: provider || null,
        metricTypes: Array.isArray(metricTypes) ? metricTypes : undefined,
        rangeFrom: rangeFrom || undefined,
        rangeTo: rangeTo || undefined,
        rangeDays: rangeDays || undefined,
        sendWhatsApp: !!sendWhatsApp,
      },
    });

    return res.status(201).json({ ok: true, report, job });
  } catch (err) {
    console.error('POST /reports/generate error:', err);
    return res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

/**
 * GET /reports/:id
 * Recupera um relatório específico.
 */
router.get('/:id', async (req, res) => {
  try {
    const report = await reportsService.getById(req.tenantId, req.params.id);
    if (!report) return res.status(404).json({ error: 'Relatório não encontrado' });
    return res.json(report);
  } catch (err) {
    console.error('GET /reports/:id error:', err);
    return res.status(500).json({ error: 'Erro ao buscar relatório' });
  }
});

/**
 * PUT /reports/:id
 * Atualiza um relatório (patch-like).
 */
router.put('/:id', async (req, res) => {
  try {
    const updated = await reportsService.update(req.tenantId, req.params.id, (req.body || {}));
    if (!updated) return res.status(404).json({ error: 'Relatório não encontrado' });
    return res.json(updated);
  } catch (err) {
    console.error('PUT /reports/:id error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar relatório' });
  }
});

/**
 * DELETE /reports/:id
 * Remove relatório.
 */
router.delete('/:id', async (req, res) => {
  try {
    const removed = await reportsService.remove(req.tenantId, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Relatório não encontrado' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /reports/:id error:', err);
    return res.status(500).json({ error: 'Erro ao remover relatório' });
  }
});

/**
 * POST /reports/:id/send
 * Gatilho para enviar relatório por email/whatsapp.
 * Body: { via: 'email'|'whatsapp', to?: '...', message?: '...' }
 *
 * Regras:
 * - via === 'whatsapp' -> tenta disparar via whatsappProvider (se configurado).
 * - via === 'email'    -> placeholder (a ser ligado a serviço de email).
 */
router.post('/:id/send', async (req, res) => {
  try {
    const { via, to } = req.body || {};
    if (!via) {
      return res.status(400).json({ error: "Campo 'via' é obrigatório ('email' ou 'whatsapp')." });
    }

    const report = await reportsService.getById(req.tenantId, req.params.id);
    if (!report) return res.status(404).json({ error: 'Relatório não encontrado' });

    const updatePayload = {};
    const delivery = { via, attempted: false, ok: false };

    if (via === 'whatsapp') {
      if (!whatsappProvider || typeof whatsappProvider.send !== 'function') {
        return res.status(500).json({ error: 'WhatsApp provider não configurado' });
      }
      if (!to) {
        return res.status(400).json({ error: "Campo 'to' é obrigatório para envio via WhatsApp." });
      }

      delivery.attempted = true;
      const message =
        req.body.message ||
        `Seu relatório está pronto: ${report.title || report.name || report.id}`;

      const result = await whatsappProvider.send(
        req.tenantId,
        to,
        message,
        {
          template: 'report_ready',
          referenceId: report.id,
          vars: {
            reportId: report.id,
            reportType: report.type || null,
          },
        },
      );

      delivery.ok = !!(result && result.ok);
      delivery.providerResult = result || null;
      updatePayload.sentWhatsapp = delivery.ok;
    } else if (via === 'email') {
      // Placeholder: apenas marca como "enviado por email".
      updatePayload.sentEmail = true;
    } else {
      return res.status(400).json({ error: "Valor inválido para 'via'. Use 'email' ou 'whatsapp'." });
    }

    if (Object.keys(updatePayload).length > 0) {
      await reportsService.update(req.tenantId, req.params.id, updatePayload);
    }

    return res.json({
      ok: true,
      via,
      to: to || null,
      delivery,
    });
  } catch (err) {
    console.error('POST /reports/:id/send error:', err);
    return res.status(500).json({ error: 'Erro ao enviar relatório' });
  }
});

/**
 * GET /reports/:id/download
 * Retorna uma URL de download para o arquivo do relatório (Upload).
 * Regras da Fase 3:
 *  - 404 se não existir relatório
 *  - 400 se não houver arquivo vinculado
 *  - 500 se não conseguir gerar URL
 *  - 200 { ok: true, url, filename, mimeType }
 */
router.get('/:id/download', async (req, res) => {
  try {
    const report = await reportsService.getById(req.tenantId, req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Relatório não encontrado' });
    }

    if (!report.fileId || !report.file) {
      // Fase 3: status 400 e mensagem específica
      return res.status(400).json({ error: 'Report ainda não possui arquivo gerado' });
    }

    const upload = report.file;
    let url = upload.url || null;

    // Se não houver URL salva, tenta gerar via uploadsService.getUrlForKey
    if (!url && uploadsService && typeof uploadsService.getUrlForKey === 'function' && upload.key) {
      try {
        // 1h de validade por padrão
        url = await uploadsService.getUrlForKey(upload.key, 60 * 60);
      } catch (err) {
        console.error('GET /reports/:id/download getUrlForKey error:', err);
      }
    }

    if (!url) {
      return res.status(500).json({ error: 'URL de download não disponível' });
    }

    return res.json({
      ok: true,
      url,
      filename: upload.filename || null,
      // Caso não tenha mimeType salvo, assume PDF por padrão (Fase 3)
      mimeType: upload.mimeType || 'application/pdf',
    });
  } catch (err) {
    console.error('GET /reports/:id/download error:', err);
    return res.status(500).json({ error: 'Erro ao gerar URL de download do relatório' });
  }
});

module.exports = router;
