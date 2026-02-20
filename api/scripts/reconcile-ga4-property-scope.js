#!/usr/bin/env node

const { prisma } = require('../src/prisma');
const { ga4SyncQueue } = require('../src/queues');
const {
  setBrandGa4ActiveProperty,
  resolveBrandGa4ActivePropertyId,
  normalizeGa4PropertyId,
} = require('../src/services/brandGa4SettingsService');

function parseArgs(argv = []) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '').trim();
    if (!token.startsWith('--')) continue;
    const key = token.replace(/^--/, '');
    const next = argv[i + 1];
    if (!next || String(next).startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = String(next);
    i += 1;
  }
  return args;
}

function usageAndExit(code = 1) {
  // eslint-disable-next-line no-console
  console.log(
    [
      'Uso:',
      '  node scripts/reconcile-ga4-property-scope.js \\',
      '    --tenantId <uuid> --propertyId <ga4_property_id> [--days 30] [--includeCampaigns] [--noSync] [--dryRun]',
      '',
      'Exemplo:',
      '  node scripts/reconcile-ga4-property-scope.js --tenantId abc --propertyId 399573807 --days 30 --includeCampaigns',
    ].join('\n'),
  );
  process.exit(code);
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'y'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n'].includes(raw)) return false;
  return fallback;
}

function normalizeDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 30;
  return Math.max(1, Math.min(365, Math.floor(n)));
}

function buildJobId({ tenantId, brandId, propertyId }) {
  return `ga4-brand-facts-sync:${String(tenantId)}:${String(brandId)}:${String(propertyId)}`;
}

async function enqueueSync({ tenantId, brandId, propertyId, days, includeCampaigns }) {
  if (!ga4SyncQueue) {
    return { queued: false, skipped: true, reason: 'queue_unavailable', jobId: null };
  }

  const jobId = buildJobId({ tenantId, brandId, propertyId });
  const existing = await ga4SyncQueue.getJob(jobId);
  if (existing) {
    return { queued: false, skipped: true, reason: 'already_queued', jobId };
  }

  await ga4SyncQueue.add(
    'ga4-brand-facts-sync',
    {
      tenantId: String(tenantId),
      brandId: String(brandId),
      propertyId: String(propertyId),
      days,
      includeCampaigns,
      trigger: 'scope_reconcile_script',
    },
    {
      jobId,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
    },
  );

  return { queued: true, skipped: false, reason: null, jobId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tenantId = String(args.tenantId || args.tenant || '').trim();
  const targetPropertyId = normalizeGa4PropertyId(args.propertyId || args.property || '');

  if (!tenantId || !targetPropertyId) {
    usageAndExit(1);
    return;
  }

  const dryRun = toBool(args.dryRun, false);
  const includeCampaigns =
    args.includeCampaigns === true || toBool(args.includeCampaigns, false);
  const noSync = args.noSync === true || toBool(args.noSync, false);
  const enqueueSyncEnabled = !noSync;
  const syncDays = normalizeDays(args.days);

  const brands = await prisma.client.findMany({
    where: { tenantId: String(tenantId) },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  const report = [];
  let applied = 0;
  let unchanged = 0;
  let failed = 0;
  let syncQueued = 0;
  let syncSkipped = 0;

  for (const brand of brands) {
    const brandId = String(brand.id);
    const row = {
      brandId,
      brandName: brand.name || null,
      beforePropertyId: null,
      afterPropertyId: null,
      changed: false,
      sync: null,
      error: null,
    };

    try {
      let beforePropertyId = null;
      try {
        beforePropertyId = await resolveBrandGa4ActivePropertyId({ tenantId, brandId });
      } catch (_) {
        beforePropertyId = null;
      }

      row.beforePropertyId = beforePropertyId ? String(beforePropertyId) : null;

      const needsChange = String(row.beforePropertyId || '') !== String(targetPropertyId);
      if (needsChange && !dryRun) {
        await setBrandGa4ActiveProperty({
          tenantId,
          brandId,
          propertyId: targetPropertyId,
        });
      }

      row.afterPropertyId = needsChange && !dryRun
        ? String(targetPropertyId)
        : String(row.beforePropertyId || targetPropertyId || '');
      row.changed = Boolean(needsChange);

      if (needsChange) {
        applied += 1;
      } else {
        unchanged += 1;
      }

      if (enqueueSyncEnabled && !dryRun && (needsChange || row.afterPropertyId === String(targetPropertyId))) {
        const syncResult = await enqueueSync({
          tenantId,
          brandId,
          propertyId: targetPropertyId,
          days: syncDays,
          includeCampaigns,
        });
        row.sync = syncResult;
        if (syncResult.queued) {
          syncQueued += 1;
        } else {
          syncSkipped += 1;
        }
      }
    } catch (error) {
      failed += 1;
      row.error = {
        code: error?.code || null,
        message: error?.message || 'Failed to reconcile brand',
      };
    }

    report.push(row);
  }

  const summary = {
    tenantId: String(tenantId),
    targetPropertyId: String(targetPropertyId),
    dryRun,
    includeCampaigns,
    enqueueSync: enqueueSyncEnabled,
    syncDays,
    totals: {
      brands: report.length,
      applied,
      unchanged,
      failed,
      syncQueued,
      syncSkipped,
    },
    report,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[reconcile-ga4-property-scope] failed', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch (_) {}
    try {
      if (ga4SyncQueue) await ga4SyncQueue.close();
    } catch (_) {}
  });
