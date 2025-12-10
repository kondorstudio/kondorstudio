// path: api/scripts/createSuperAdmin.js
/**
 * Script utilitário para criar ou promover um usuário SUPER_ADMIN.
 *
 * Uso:
 *   cd api
 *   node scripts/createSuperAdmin.js <email> <senha> [tenantSlug]
 *
 * Se o tenant (slug) não existir, será criado como "Control Center".
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { prisma } = require('../src/prisma');
const { hashPassword } = require('../src/utils/hash');

async function ensureTenant(slug) {
  const normalizedSlug = (slug || 'kondor-control-center').toLowerCase();

  let tenant = await prisma.tenant.findFirst({ where: { slug: normalizedSlug } });
  if (tenant) return tenant;

  tenant = await prisma.tenant.create({
    data: {
      name: 'Kondor Control Center',
      slug: normalizedSlug,
    },
  });
  return tenant;
}

async function main() {
  const [, , emailArg, passwordArg, tenantSlugArg] = process.argv;
  const email = emailArg || process.env.SUPER_ADMIN_EMAIL;
  const password = passwordArg || process.env.SUPER_ADMIN_PASSWORD;
  const tenantSlug = tenantSlugArg || process.env.SUPER_ADMIN_TENANT_SLUG || 'kondor-control-center';

  if (!email || !password) {
    console.error('Uso: node scripts/createSuperAdmin.js <email> <senha> [tenantSlug]');
    process.exit(1);
  }

  const tenant = await ensureTenant(tenantSlug);
  const passwordHash = await hashPassword(password);

  const existing = await prisma.user.findFirst({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: 'SUPER_ADMIN',
        tenantId: existing.tenantId || tenant.id,
        isActive: true,
      },
    });
    console.log(`✅ Usuário ${email} promovido/atualizado como SUPER_ADMIN.`);
  } else {
    await prisma.user.create({
      data: {
        email,
        name: 'Super Admin',
        passwordHash,
        tenantId: tenant.id,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });
    console.log(`✅ SUPER_ADMIN criado com sucesso (${email}).`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Falha ao criar SUPER_ADMIN:', err);
  await prisma.$disconnect();
  process.exit(1);
});
