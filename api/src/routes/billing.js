// api/src/routes/billing.js
// Rotas de billing: expõe endpoints para planos, subscribe, status, invoices e webhook de pagamento.
// Requisitos: authMiddleware e tenantMiddleware já aplicados no app antes do uso.
// Substitua o arquivo atual por este conteúdo.

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant');
const billingService = require('../services/billingService');

// Garantir que as rotas aqui sejam protegidas por auth + tenant
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * GET /billing/plans
 * Lista planos públicos
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = await billingService.listPlans();
    return res.status(200).json({ ok: true, plans });
  } catch (err) {
    console.error('GET /billing/plans error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao listar planos' });
  }
});

/**
 * POST /billing/subscribe
 * Body: { planId: string }
 * Usa req.tenantId (injetado pelo tenantMiddleware) e req.user (do authMiddleware)
 */
router.post('/subscribe', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.tenant && req.tenant.id);
    const userId = (req.user && req.user.id) || null;
    const { planId } = req.body || {};

    if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado' });
    if (!planId) return res.status(400).json({ error: 'planId é obrigatório' });

    const subscription = await billingService.subscribe(tenantId, planId, userId);
    return res.status(200).json({ ok: true, subscription });
  } catch (err) {
    console.error('POST /billing/subscribe error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao assinar plano' });
  }
});

/**
 * GET /billing/status
 * Retorna overview do billing do tenant (blocked, plan, subscription)
 */
router.get('/status', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.tenant && req.tenant.id);
    if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado' });

    const overview = await billingService.status(tenantId);
    return res.status(200).json({ ok: true, ...overview });
  } catch (err) {
    console.error('GET /billing/status error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao obter status do billing' });
  }
});

/**
 * POST /billing/invoice
 * Body: { amountCents, dueDate?, description?, metadata?, reference?, items? }
 * Cria invoice simples no contexto do tenant.
 */
router.post('/invoice', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.tenant && req.tenant.id);
    const payload = req.body || {};

    if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado' });
    if (!payload.amountCents) return res.status(400).json({ error: 'amountCents é obrigatório' });

    const invoice = await billingService.createInvoice(tenantId, payload);
    return res.status(200).json({ ok: true, invoice });
  } catch (err) {
    console.error('POST /billing/invoice error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao criar invoice' });
  }
});

/**
 * POST /billing/webhook
 * Simples webhook para receber eventos do provedor (ex.: pagamento confirmado).
 * Espera payload com { type: 'payment.succeeded'|'invoice.paid'|..., tenantId?, data }
 * Para segurança: ideal validar assinatura do provedor aqui (omisso por simplicidade).
 */
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body || {};

    // Se o provedor enviar tenantId no payload, usamos; caso contrário, ignoramos (webhook genérico)
    const tenantId = payload.tenantId || (req.tenant && req.tenant.id) || req.headers['x-tenant-id'] || null;

    // Ex: tipo de evento de pagamento
    const type = payload.type || payload.event || null;

    if (type === 'payment.succeeded' || type === 'invoice.paid' || type === 'payment.created') {
      // Esperamos dados mínimos: amount (em cents) e reference
      const amountCents = payload.amountCents || (payload.data && payload.data.amountCents) || null;
      const reference = payload.reference || (payload.data && payload.data.reference) || null;
      const provider = payload.provider || null;
      const invoiceId = payload.invoiceId || (payload.data && payload.data.invoiceId) || null;
      const subscriptionId = payload.subscriptionId || (payload.data && payload.data.subscriptionId) || null;

      if (!tenantId || !amountCents) {
        // Ainda assim retornamos 200 para não spam de retry do provedor,
        // mas logamos para investigação.
        console.warn('billing webhook: missing tenantId or amountCents', { tenantId, amountCents, payloadType: type });
        return res.status(200).json({ ok: false, warning: 'payload incompleto' });
      }

      await billingService.markPayment(tenantId, amountCents, reference, {
        provider,
        invoiceId,
        subscriptionId,
        extendByDays: payload.extendByDays || (payload.data && payload.data.extendByDays) || null,
      });

      // opcional: tratar invoice.paid com create/update de subscription se necessário
      return res.status(200).json({ ok: true });
    }

    // eventos que não processamos explicitamente
    console.info('billing webhook: evento não tratado', { type });
    return res.status(200).json({ ok: true, ignored: true });
  } catch (err) {
    console.error('POST /billing/webhook error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

module.exports = router;
