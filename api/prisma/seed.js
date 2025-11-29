// prisma/seed.js
// Seeder minimal para o schema atual do KONDOR STUDIO
// - Cria os planos iniciais: Starter, Pro, Agency
// - Compatível com o model `Plan` do schema.prisma (campo priceCents Int, interval BillingInterval)
// - Execute com: `npx prisma db seed` (ou `node prisma/seed.js` se preferir)
// - Não altera tenants/assinaturas — isso é intencional: seed apenas insere os planos.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function upsertPlan(data) {
  // tenta por key (único)
  const existing = await prisma.plan.findUnique({ where: { key: data.key } });
  if (existing) {
    // atualiza alguns campos caso tenha mudado o seed
    await prisma.plan.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        description: data.description,
        priceCents: data.priceCents,
        currency: data.currency || 'BRL',
        interval: data.interval,
        features: data.features || null,
        active: data.active === undefined ? true : Boolean(data.active),
        updatedAt: new Date(),
      },
    });
    console.log(`Plan updated: ${data.key}`);
    return existing;
  }

  const created = await prisma.plan.create({ data });
  console.log(`Plan created: ${data.key}`);
  return created;
}

async function main() {
  console.log('Starting seed: plans');

  const plans = [
    {
      key: 'starter_monthly',
      name: 'Starter',
      description:
        'Plano Starter – freelancers: até 15 clientes, 1 usuário interno, integrações básicas (Meta Ads).',
      priceCents: 9700, // R$97,00
      currency: 'BRL',
      interval: 'MONTHLY',
      features: {
        clients_limit: 15,
        users: 1,
        integrations: ['meta'],
        reports: 'basic',
        automation: 'limited',
      },
      active: true,
    },
    {
      key: 'pro_monthly',
      name: 'Pro',
      description:
        'Plano Pro – social media/gestores: até 40 clientes, 3 usuários internos, integrações completas.',
      priceCents: 14700, // R$147,00
      currency: 'BRL',
      interval: 'MONTHLY',
      features: {
        clients_limit: 40,
        users: 3,
        integrations: ['meta', 'google', 'tiktok'],
        reports: 'weekly',
        automation: 'whatsapp',
      },
      active: true,
    },
    {
      key: 'agency_monthly',
      name: 'Agency',
      description:
        'Plano Agency – agências: até 100 clientes, equipe ilimitada, dash avançado e automações completas.',
      priceCents: 24700, // R$247,00
      currency: 'BRL',
      interval: 'MONTHLY',
      features: {
        clients_limit: 100,
        users: 'unlimited',
        integrations: ['meta', 'google', 'tiktok', 'youtube'],
        reports: 'custom',
        automation: 'full',
      },
      active: true,
    },
  ];

  for (const p of plans) {
    // normaliza JSON para o prisma (já aceita objetos)
    await upsertPlan(p);
  }

  console.log('Plans seed finished');

  // Opcional: você pode criar um plano gratuito de teste se quiser
  // await upsertPlan({
  //   key: 'free_trial',
  //   name: 'Trial',
  //   description: 'Plano de teste grátis',
  //   priceCents: 0,
  //   currency: 'BRL',
  //   interval: 'MONTHLY',
  //   features: { clients_limit: 3, users: 1 },
  //   active: true,
  // });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
