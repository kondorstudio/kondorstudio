const { prisma } = require('../../prisma');

const usageCache = new Map();

function normalizeMode(value) {
  const mode = String(value || 'warn').trim().toLowerCase();
  return mode === 'block' ? 'block' : 'warn';
}

function parseBooleanEnv(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function resolveSunsetHeader() {
  const raw = process.env.LEGACY_ROUTES_SUNSET_AT || process.env.REPORTS_LEGACY_SUNSET_AT;
  if (!raw) return null;
  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toUTCString();
  }
  return String(raw).trim();
}

function isLegacyRouteEnabled(kind) {
  if (kind === 'reporting-v1') {
    return parseBooleanEnv(process.env.REPORTING_V1_ENABLED, true);
  }
  if (kind === 'reports-legacy') {
    return parseBooleanEnv(process.env.REPORTS_LEGACY_ENABLED, true);
  }
  return true;
}

function getLegacyRoutesMode() {
  return normalizeMode(process.env.LEGACY_ROUTES_MODE || 'warn');
}

function shouldWriteUsageLog(cacheKey, throttleMs) {
  const now = Date.now();
  const lastAt = usageCache.get(cacheKey) || 0;
  if (now - lastAt < throttleMs) return false;
  usageCache.set(cacheKey, now);

  // Prevent unbounded growth in long-running workers.
  if (usageCache.size > 10000) {
    const cutoff = now - throttleMs * 3;
    for (const [key, value] of usageCache.entries()) {
      if (value < cutoff) usageCache.delete(key);
    }
  }

  return true;
}

async function logLegacyUsage({ kind, req, blocked, successorPath }) {
  const throttleMs = Math.max(1000, Number(process.env.LEGACY_ROUTE_LOG_TTL_MS || 60000));
  const tenantId = req.tenantId || req.user?.tenantId || null;
  const key = [kind, tenantId || 'tenant:none', req.method, req.path].join('|');

  if (!shouldWriteUsageLog(key, throttleMs)) return;

  try {
    await prisma.systemLog.create({
      data: {
        level: 'WARN',
        source: 'LEGACY_ROUTE',
        message: `Legacy route accessed: ${kind}`,
        tenantId,
        metadata: {
          routeKind: kind,
          blocked: Boolean(blocked),
          method: req.method,
          path: req.originalUrl || req.url,
          successorPath: successorPath || null,
          userId: req.user?.id || null,
          ip: req.ip || req.headers['x-forwarded-for'] || null,
        },
      },
    });
  } catch (_err) {
    // Never break request flow because of observability logs.
  }
}

function legacyRouteGuard({ kind, successorPath }) {
  if (!kind) {
    throw new Error('legacy route kind is required');
  }

  return async (req, res, next) => {
    const sunsetHeader = resolveSunsetHeader();
    const mode = getLegacyRoutesMode();
    const enabled = isLegacyRouteEnabled(kind);
    const blocked = mode === 'block' || !enabled;

    res.setHeader('Deprecation', 'true');
    res.setHeader('X-Kondor-Legacy-Route', kind);
    if (sunsetHeader) {
      res.setHeader('Sunset', sunsetHeader);
    }
    if (successorPath) {
      res.setHeader('Link', `<${successorPath}>; rel="successor-version"`);
    }

    await logLegacyUsage({ kind, req, blocked, successorPath });

    if (blocked) {
      return res.status(410).json({
        error: 'Endpoint legado desativado',
        code: 'LEGACY_ROUTE_DISABLED',
        route: kind,
        successor: successorPath || null,
      });
    }

    return next();
  };
}

module.exports = {
  legacyRouteGuard,
};
