/* eslint-disable no-console */
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("[metric-catalog] Sync stub. Implement provider adapters to refresh fields.");

  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true },
  });

  for (const tenant of tenants) {
    console.log(`[metric-catalog] tenant=${tenant.slug} id=${tenant.id}`);
  }
}

main()
  .catch((err) => {
    console.error("[metric-catalog] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
