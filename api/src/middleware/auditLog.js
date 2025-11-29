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

function summarizeBody(body = {}, maxLen = DEFAULT_BODY_MAX) {
  if (!body) return null;
  try {
    let s;
    if (typeof body === 'string') s = body;
    else s = JSON.stringify(body);
    if (s.length > maxLen) {
      return s.slice(0, maxLen) + '... (truncated)';
    }
    return s;
  } catch (e) {
    return String(body).slice(0, maxLen);
  }
}

function createAuditRecordSafe(audit) {
  // try to persist via prisma.auditLog if model exists; if not, fallback to console.log
  (async () => {
    try {
      if (prisma && prisma.auditLog && typeof prisma.auditLog.create === 'function') {
        // guard: remove huge fields if any
        const safe = Object.assign({}, audit);
        if (safe.body && typeof safe.body === 'string' && safe.body.length > DEFAULT_BODY_MAX) {
          safe.body = safe.body.slice(0, DEFAULT_BODY_MAX) + '... (truncated)';
        }
        await prisma.auditLog.create({ data: safe });
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
      if (skipRe && skipRe.test(req.path)) return next();

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

          const audit = {
            tenantId,
            userId,
            method,
            path,
            status,
            params: params ? JSON.stringify(params) : null,
            query: query ? JSON.stringify(query) : null,
            body: bodySummary,
            ip,
            userAgent,
            resource,
            action,
            durationMs: duration,
            createdAt: new Date(),
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
