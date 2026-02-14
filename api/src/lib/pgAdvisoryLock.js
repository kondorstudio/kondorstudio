// api/src/lib/pgAdvisoryLock.js
// Postgres advisory locks for cross-process serialization.
//
// We lock by (tenantId, brandId) so that GA4 writes and GA4 property switches
// cannot race and leave residual facts.

async function acquireTenantBrandLock(db, tenantId, brandId) {
  if (!db || typeof db.$executeRaw !== 'function') return;
  if (!tenantId || !brandId) return;

  // hashtext(text) -> int4, lock key is (int4, int4)
  // pg_advisory_xact_lock holds until the current transaction ends.
  await db.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${String(tenantId)}),
      hashtext(${String(brandId)})
    )
  `;
}

module.exports = {
  acquireTenantBrandLock,
};
