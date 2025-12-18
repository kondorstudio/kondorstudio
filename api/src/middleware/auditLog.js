// api/src/middleware/auditLog.js
// Middleware para registrar Audit Logs automáticos por tenant/user/resource.
// - Usa prisma.auditLog.create se o model existir no schema
// - Fallback: console.warn (não bloqueia resposta)
// - Respeita env var AUDITLOG_SKIP_REGEX para pular rotas (ex: '^/health|^/metrics')
//
// Exemplo de uso: app.use(auditLog({ skip: '^/health|^/metrics' }))
//
// O registro padrão contém:
// { tenantId, userId, method, path, params, query, bodySummary, ip, userAgent, resource, action, createdAt }
// Onde resource/action são inferidos por heurística a partir do path/method (ex: POST /posts -> resource=post action=create)

const { prisma } = require('../prisma');

const DEFAULT_BODY_MAX = 2000; // bytes/characters to store
const DEFAULT_META_MAX = 5000;

const SENSITIVE_KEY_RE =
  /(pass(word)?|senha|token|refresh|secret|authorization|api[_-]?key|jwt)/i;

function inferResourceAndAction(method = 'GET', path = '') {
  // heuristics: /api/posts/:id -> resource=post, action=create/read/update/delete/list
  const parts = (path || '').split('/').filter(Boolean);
  let resource = parts.length ? parts[parts.length - 1] : 'unknown';
  // if last part is an id (uuid/number), pick previous
  if (resource && /^[0-9a-fA-F\-]{6,}$/.test(resource) && parts.length > 1) {
    resource = parts[parts.length - 2];
  }
  // normalize singular
  resource = String(resource).replace(/s$/i, '') || 'unknown';

  const methodMap = {
    POST: 'create',
    GET: 'read',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
  };
  const action = methodMap[method.toUpperCase()] || method.toLowerCase();

  return { resource, action };
}

function sanitizeValue(value, depth = 0) {
  if (depth > 4) return '[TRUNCATED_DEPTH]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    const entries = Object.entries(value).slice(0, 50);
    for (const [key, val] of entries) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = sanitizeValue(val, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function summarizeBody(body = {}, maxLen = DEFAULT_BODY_MAX) {
  if (!body) return null;
  try {
    let s;
    if (typeof body === 'string') s = body;
    else s = JSON.stringify(sanitizeValue(body));
    if (s.length > maxLen) {
      return s.slice(0, maxLen) + '... (truncated)';
    }
    return s;
  } catch (e) {
    return String(body).slice(0, maxLen);
  }
}

function extractResourceId(req, path) {
  const paramId = req?.params?.id || req?.params?.tenantId || req?.params?.clientId;
  if (paramId) return String(paramId);
  const parts = (path || '').split('?')[0].split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && /^[0-9a-fA-F\-]{6,}$/.test(last)) return last;
  return null;
}

function createAuditRecordSafe(audit) {
  // try to persist via prisma.auditLog if model exists; if not, fallback to console.log
  (async () => {
    try {
      if (
        audit?.tenantId &&
        prisma &&
        prisma.auditLog &&
        typeof prisma.auditLog.create === 'function'
      ) {
        const metaJson = sanitizeValue(audit.meta || {});
        const metaString = JSON.stringify(metaJson);
        const safeMeta =
          metaString.length > DEFAULT_META_MAX
            ? { truncated: true, preview: metaString.slice(0, DEFAULT_META_MAX) }
            : metaJson;

        await prisma.auditLog.create({
          data: {
            tenantId: audit.tenantId,
            userId: audit.userId || null,
            action: audit.action,
            resource: audit.resource || null,
            resourceId: audit.resourceId || null,
            ip: audit.ip || null,
            meta: safeMeta,
          },
        });
        return;
      }
    } catch (err) {
      // fallthrough to console
      console.warn('auditLog: prisma write failed, falling back to console:', err && err.message ? err.message : err);
    }

    // fallback: non-blocking console output
    try {
      console.info('AUDIT (fallback):', JSON.stringify(audit));
    } catch (e) {
      console.info('AUDIT (fallback):', audit);
    }
  })();
}

/**
 * auditLog middleware factory
 * opts:
 *  - skip: regex string to skip paths (default from ENV AUDITLOG_SKIP_REGEX)
 *  - bodyMax: max chars stored from body
 */
function auditLog(opts = {}) {
  const skipRegexStr = opts.skip || process.env.AUDITLOG_SKIP_REGEX || '^/health|^/metrics|^/static';
  const skipRe = new RegExp(skipRegexStr);

  const bodyMax = Number(opts.bodyMax || process.env.AUDITLOG_BODY_MAX || DEFAULT_BODY_MAX);

  return function (req, res, next) {
    try {
      const start = Date.now();
      // skip if path matches
      const fullPathForSkip = req.originalUrl || req.url || req.path || '';
      if (skipRe && skipRe.test(fullPathForSkip)) return next();

      // After response finishes, record outcome (non-blocking)
      res.on('finish', () => {
        try {
          const duration = Date.now() - start;
          const method = req.method || 'GET';
          const path = req.originalUrl || req.url || req.path || '';
          const status = res.statusCode || 0;
          const tenantId = req.tenantId || (req.tenant && req.tenant.id) || null;
          const userId = (req.user && (req.user.id || req.user.userId)) || null;

          const ip = req.ip || req.headers['x-forwarded-for'] || (req.connection && req.connection.remoteAddress) || null;
          const userAgent = req.headers['user-agent'] || null;

          const params = req.params && Object.keys(req.params).length ? req.params : null;
          const query = req.query && Object.keys(req.query).length ? req.query : null;
          const bodySummary = summarizeBody(req.body, bodyMax);

          const { resource, action } = inferResourceAndAction(method, path);
          const resourceId = extractResourceId(req, path);

          const audit = {
            tenantId,
            userId,
            ip,
            userAgent,
            resource,
            action,
            resourceId,
            meta: {
              method,
              path,
              status,
              durationMs: duration,
              params: params ? sanitizeValue(params) : null,
              query: query ? sanitizeValue(query) : null,
              body: bodySummary,
              userAgent,
            },
          };

          // non-blocking persistence
          createAuditRecordSafe(audit);
        } catch (e) {
          // never break response flow
          console.warn('auditLog: post-response handler error', e && e.message ? e.message : e);
        }
      });
    } catch (err) {
      // middleware failed to init — do not block
      console.warn('auditLog middleware init error', err && err.message ? err.message : err);
    } finally {
      return next();
    }
  };
}

module.exports = auditLog;
