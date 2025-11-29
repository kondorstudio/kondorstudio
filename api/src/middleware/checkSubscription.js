// api/src/middleware/checkSubscription.js
// Middleware: verifica se o tenant possui assinatura válida/ativa.
// Substitua o arquivo existente por este conteúdo.

const billingService = require('../services/billingService');

/**
 * Middleware que bloqueia acesso se a assinatura do tenant estiver expirada.
 * Requisitos:
 * - espera que req.tenantId esteja definido (middleware de tenant já rodou antes).
 * - usa billingService.isBlocked(tenantId) -> boolean (true = bloqueado).
 *
 * Respostas padronizadas usadas no projeto:
 * - 401 -> tenant não identificado
 * - 402 -> cobrança/assinatura vencida (SUBSCRIPTION_EXPIRED)
 * - 500 -> erro interno
 */
module.exports = async function checkSubscription(req, res, next) {
  try {
    const tenantId = req.tenantId || (req.tenant && req.tenant.id) || req.headers['x-tenant-id'];

    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant não identificado' });
    }

    // billingService.isBlocked deve retornar true se o acesso deve ser bloqueado
    // (ex: sem assinatura, assinatura expirada, pagamento falhou).
    const blocked = await billingService.isBlocked(tenantId);

    if (blocked) {
      return res.status(402).json({
        error: 'Acesso bloqueado — assinatura expirada ou sem pagamento',
        code: 'SUBSCRIPTION_EXPIRED',
      });
    }

    // se não bloqueado, segue normalmente
    return next();
  } catch (err) {
    // mantemos o padrão do projeto de log com console.error para debugging local.
    console.error('checkSubscription error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Erro interno na verificação de assinatura' });
  }
};
