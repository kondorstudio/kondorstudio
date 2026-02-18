const { prisma } = require('../prisma');
const rawStoreService = require('../services/rawStoreService');

function safeLog(...args) {
  if (process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console
  console.log('[ga4PruneJob]', ...args);
}

async function pollOnce() {
  const now = new Date();

  let cacheDeleted = null;
  let callsDeleted = null;
  let rawDeleted = null;

  if (prisma?.ga4ApiCache) {
    const result = await prisma.ga4ApiCache.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    cacheDeleted = result.count || 0;
  }

  const retentionDays = Math.max(0, Number(process.env.GA4_API_CALL_LOG_RETENTION_DAYS || 90));
  if (prisma?.ga4ApiCall && retentionDays > 0) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await prisma.ga4ApiCall.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    callsDeleted = result.count || 0;
  }

  const rawPrune = await rawStoreService.purgeExpiredRawApiResponses();
  rawDeleted = rawPrune?.deleted ?? 0;

  safeLog('prune completed', { cacheDeleted, callsDeleted, rawDeleted, retentionDays });
  return { ok: true, cacheDeleted, callsDeleted, rawDeleted, retentionDays };
}

module.exports = {
  pollOnce,
};
