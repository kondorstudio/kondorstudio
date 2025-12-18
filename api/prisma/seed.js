
/* eslint-disable no-console */
// api/prisma/seed.js
// Seed idempotente para desenvolvimento/ambientes vazios.
//
// Cria:
// - Planos base (starter/pro/agencia) se não existirem
// - 1 tenant + 1 usuário ADMIN
// - (opcional) 1 usuário SUPER_ADMIN para o painel mestre
//
// Variáveis opcionais:
// - SEED_TENANT_NAME, SEED_TENANT_SLUG
// - SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
// - SEED_CREATE_SUPERADMIN=true|false
// - SEED_SUPERADMIN_EMAIL, SEED_SUPERADMIN_PASSWORD

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { hashPassword } = require("../src/utils/hash");

const prisma = new PrismaClient();

function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return String(raw).toLowerCase() === "true";
}

function requiredString(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return String(value);
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function upsertPlans() {
  const plans = [
    {
      key: "starter_monthly",
      name: "Starter",
      description: "Plano inicial",
      priceCents: 0,
      interval: "MONTHLY",
      active: true,
      features: {
        clients: 15,
        users: 1,
      },
    },
    {
      key: "pro_monthly",
      name: "Pro",
      description: "Plano intermediário",
      priceCents: 19900,
      interval: "MONTHLY",
      active: true,
      features: {
        clients: 40,
        users: 3,
      },
    },
    {
      key: "agency_monthly",
      name: "Agency",
      description: "Plano agência",
      priceCents: 49900,
      interval: "MONTHLY",
      active: true,
      features: {
        clients: 100,
        users: 999,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      create: {
        key: plan.key,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        interval: plan.interval,
        active: plan.active,
        features: plan.features,
      },
      update: {
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        interval: plan.interval,
        active: plan.active,
        features: plan.features,
      },
    });
  }

  const starter = await prisma.plan.findUnique({ where: { key: "starter_monthly" } });
  return starter;
}

async function ensureTenantAndAdmin(starterPlan) {
  const tenantName = requiredString("SEED_TENANT_NAME", "Kondor Demo");
  const tenantSlug = requiredString("SEED_TENANT_SLUG", "kondor-demo");

  const adminName = requiredString("SEED_ADMIN_NAME", "Admin");
  const adminEmail = normalizeEmail(
    requiredString("SEED_ADMIN_EMAIL", "admin@kondor.local")
  );
  const adminPassword = requiredString("SEED_ADMIN_PASSWORD", "admin123");

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    create: {
      name: tenantName,
      slug: tenantSlug,
      settings: {
        agency_name: tenantName,
        primary_color: "#A78BFA",
        accent_color: "#39FF14",
        logo_url: null,
      },
      planId: starterPlan?.id || null,
      status: "ACTIVE",
    },
    update: {
      name: tenantName,
      planId: starterPlan?.id || undefined,
      settings: {
        agency_name: tenantName,
        primary_color: "#A78BFA",
        accent_color: "#39FF14",
        logo_url: null,
      },
    },
  });

  const adminPasswordHash = await hashPassword(adminPassword);

  const existingAdmin = await prisma.user.findFirst({
    where: {
      tenantId: tenant.id,
      email: adminEmail,
    },
    select: { id: true },
  });

  const admin = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          name: adminName,
          passwordHash: adminPasswordHash,
          role: "ADMIN",
          isActive: true,
        },
      })
    : await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: adminEmail,
          name: adminName,
          passwordHash: adminPasswordHash,
          role: "ADMIN",
          isActive: true,
        },
      });

  if (starterPlan?.id) {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const latest = await prisma.subscription.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!latest) {
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: starterPlan.id,
          status: "SUCCEEDED",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
    }
  }

  return { tenant, admin, adminPassword };
}

async function ensureSuperAdmin() {
  const create = envBool("SEED_CREATE_SUPERADMIN", true);
  if (!create) return null;

  const email = normalizeEmail(
    requiredString("SEED_SUPERADMIN_EMAIL", "superadmin@kondor.local")
  );
  const password = requiredString("SEED_SUPERADMIN_PASSWORD", "superadmin123");
  const passwordHash = await hashPassword(password);

  // SUPER_ADMIN é global por tenant (o schema é multi-tenant), então criamos em um tenant "control".
  // Se você preferir outro tenant, defina SEED_SUPERADMIN_TENANT_SLUG.
  const tenantSlug = requiredString("SEED_SUPERADMIN_TENANT_SLUG", "kondor-control");
  const tenantName = requiredString("SEED_SUPERADMIN_TENANT_NAME", "Kondor Control");

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    create: {
      name: tenantName,
      slug: tenantSlug,
      settings: { agency_name: tenantName },
      status: "ACTIVE",
    },
    update: { name: tenantName },
  });

  const existing = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email },
    select: { id: true },
  });

  try {
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: "Super Admin",
            passwordHash,
            role: "SUPER_ADMIN",
            isActive: true,
          },
        })
      : await prisma.user.create({
          data: {
            tenantId: tenant.id,
            email,
            name: "Super Admin",
            passwordHash,
            role: "SUPER_ADMIN",
            isActive: true,
          },
        });

    return { tenant, user, password };
  } catch (err) {
    console.warn(
      "[seed] Não foi possível criar SUPER_ADMIN (talvez o enum Role no banco ainda não tenha SUPER_ADMIN).",
      err?.message || err
    );
    return null;
  }
}

async function main() {
  console.log("[seed] Iniciando seed...");

  const starterPlan = await upsertPlans();
  const { tenant, admin, adminPassword } = await ensureTenantAndAdmin(starterPlan);
  const superAdmin = await ensureSuperAdmin();

  console.log("[seed] OK.");
  console.log("[seed] Tenant:", { id: tenant.id, slug: tenant.slug, name: tenant.name });
  console.log("[seed] Admin:", { id: admin.id, email: admin.email, role: admin.role });
  console.log("[seed] Admin senha (dev):", adminPassword);
  if (superAdmin) {
    console.log("[seed] SuperAdmin:", {
      id: superAdmin.user.id,
      email: superAdmin.user.email,
      tenantSlug: superAdmin.tenant.slug,
    });
    console.log("[seed] SuperAdmin senha (dev):", superAdmin.password);
  }
}

main()
  .catch((err) => {
    console.error("[seed] Falhou:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

