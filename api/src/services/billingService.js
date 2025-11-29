// api/src/services/billingService.js
// Service central de Billing (versão compatível).
// Mantém funções novas e adiciona compatibilidade com APIs antigas:
//  - listPlans()
//  - subscribe(tenantId, planId, userId)
//  - status(tenantId)
// e mantém:
//  - isBlocked()
//  - getBillingOverview()
//  - markPayment()
//  - findSubscriptionById()
//
// Observação: as implementações de subscribe/listPlans/status são seguras e
// simples — adapte se precisar comportamentos específicos de cobrança.

const { prisma, useTenant } = require('../prisma');

function normalizeStatus(s) {
  if (!s) return null;
  return String(s).toLowerCase();
}
function isActiveStatus(statusNormalized) {
  return ['succeeded', 'active', 'paid', 'trial'].includes(statusNormalized);
}

async function isBlocked(tenantId) {
  if (!tenantId) throw new Error('tenantId required for billing.isBlocked');
  const t = useTenant(tenantId);
  const subscription = await t.getCurrentSubscription();
  if (!subscription) return true;
  const status = normalizeStatus(subscription.status);
  const now = new Date();
  const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  if (isActiveStatus(status) && periodEnd && periodEnd > now) return false;
  if (status === 'trial') return false;
  return true;
}

async function getBillingOverview(tenantId) {
  if (!tenantId) throw new Error('tenantId required for billing.getBillingOverview');
  const t = useTenant(tenantId);
  const [subscription, tenant] = await Promise.all([
    t.getCurrentSubscription(),
    prisma.tenant.findUnique({ where: { id: tenantId } }),
  ]);
  const blocked = await isBlocked(tenantId);

  let plan = null;
  try {
    if (tenant && tenant.planId) {
      plan = await prisma.plan.findUnique({ where: { id: tenant.planId } });
    } else if (tenant && tenant.plan) {
      plan = await prisma.plan.findFirst({ where: { slug: tenant.plan } });
    }
  } catch (err) {
    plan = null;
  }

  return { blocked, plan, subscription };
}

async function markPayment(tenantId, amountCents, reference = null, opts = {}) {
  if (!tenantId) throw new Error('tenantId required for billing.markPayment');
  if (!amountCents) throw new Error('amountCents required for billing.markPayment');

  const t = useTenant(tenantId);

  const paymentData = {
    amountCents,
    reference,
    provider: opts.provider || null,
    status: 'SUCCEEDED',
    metadata: opts.metadata || null,
  };

  const payment = await t.payment.create({ data: paymentData });

  if (opts.invoiceId) {
    try {
      await t.invoice.update({
        where: { id: opts.invoiceId },
        data: {
          paidAt: new Date(),
          status: 'PAID',
          payments: { connect: { id: payment.id } },
        },
      });
    } catch (err) {
      // não trava o fluxo se invoice não existir
      console.warn('markPayment: invoice update failed', err && err.message);
    }
  }

  if (opts.subscriptionId && opts.extendByDays) {
    const sub = await t.subscription.findUnique({ where: { id: opts.subscriptionId } });
    if (sub) {
      const currentEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : new Date();
      const newEnd = new Date(currentEnd.getTime() + opts.extendByDays * 24 * 60 * 60 * 1000);
      await t.subscription.update({
        where: { id: sub.id },
        data: {
          currentPeriodEnd: newEnd,
          status: 'SUCCEEDED',
        },
      });
    }
  }

  return payment;
}

async function findSubscriptionById(tenantId, subscriptionId) {
  const t = useTenant(tenantId);
  return t.subscription.findFirst({ where: { id: subscriptionId } });
}

/**
 * Compatibilidade: listPlans
 * Retorna planos públicos ordenados pelo preço (se existir priceCents).
 */
async function listPlans() {
  const plans = await prisma.plan.findMany({
    orderBy: [{ priceCents: 'asc' }, { createdAt: 'asc' }],
  });
  return plans;
}

/**
 * Compatibilidade: subscribe(tenantId, planId, userId)
 * Cria ou atualiza uma subscription simples para o tenant.
 * - Se já existir uma subscription ativa, atualiza o plan e extende currentPeriodEnd
 * - Se não existir, cria uma nova subscription com status 'SUCCEEDED' e currentPeriodEnd baseado no plan (se price === 0 -> trial)
 *
 * Nota: Este é um comportamento simplificado. Para cobrança real/recorrente, integrar com provider.
 */
async function subscribe(tenantId, planId, userId = null) {
  if (!tenantId) throw new Error('tenantId required for billing.subscribe');
  if (!planId) throw new Error('planId required for billing.subscribe');

  const t = useTenant(tenantId);

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error('Plan not found');

  // define extensão padrão: 30 dias caso plan.monthlyDays não exista
  const extendDays = plan.billingCycleDays || 30;
  const now = new Date();

  // busca subscription atual (se houver)
  let subscription = await t.getCurrentSubscription();

  if (subscription) {
    // atualiza plan e estende período
    const currentEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : now;
    const newEnd = new Date(Math.max(currentEnd.getTime(), now.getTime()) + extendDays * 24 * 60 * 60 * 1000);
    subscription = await t.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: plan.id,
        currentPeriodEnd: newEnd,
        status: 'SUCCEEDED',
      },
    });
  } else {
    // cria nova subscription
    const isFree = (plan.priceCents || 0) === 0;
    // se plano gratuito, marcar como SUCCEEDED e currentPeriodEnd longo (ou null)
    const created = await t.subscription.create({
      data: {
        planId: plan.id,
        tenantId,
        userId,
        status: isFree ? 'SUCCEEDED' : 'PENDING',
        // se gratuito setamos um periodo longo (365 dias) para evitar bloqueio
        currentPeriodEnd: isFree ? new Date(Date.now() + 365 * 24 * 3600 * 1000) : new Date(Date.now() + extendDays * 24 * 3600 * 1000),
        startedAt: now,
      },
    });
    subscription = created;
  }

  // atualiza tenant.plan/planId para refletir o novo plano
  try {
    await prisma.tenant.update({ where: { id: tenantId }, data: { planId: plan.id, plan: plan.slug || plan.name } });
  } catch (err) {
    // não trava se tenant não puder ser atualizado
    console.warn('subscribe: could not update tenant plan', err && err.message);
  }

  return subscription;
}

/**
 * Compatibilidade: status(tenantId)
 * Retorna um objeto com blocked, plan, subscription (mesma forma que getBillingOverview).
 */
async function status(tenantId) {
  return getBillingOverview(tenantId);
}

module.exports = {
  // compat
  listPlans,
  subscribe,
  status,

  // core
  isBlocked,
  getBillingOverview,
  markPayment,
  findSubscriptionById,
};
