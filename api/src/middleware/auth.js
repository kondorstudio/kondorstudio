// api/src/middleware/auth.js
// Middleware de autenticação JWT e injeção do usuário/tenant no request

const jwt = require('jsonwebtoken');
const { prisma } = require('../prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_local_secret';

// Rotas que NÃO exigem autenticação mesmo que o middleware seja aplicado
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/health',
  '/api/healthz',
  '/api/tenants/register', // <- registro de tenant + admin deve ser público

  // ✅ Meta OAuth callback precisa ser público (Meta chama sem Bearer token)
  '/api/integrations/meta/callback',
];

// Suporte simples a token em header "Authorization: Bearer <token>"
// ou ?token=... (útil para testes)
function extractToken(req) {
  const authHeader = req.headers && req.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
  }
  // fallback: query param
  if (req.query && req.query.token) return req.query.token;
  return null;
}

/**
 * Middleware padrão de auth para USUÁRIOS internos (User).
 * Espera tokens com payload contendo userId/id/sub.
 */
async function authMiddleware(req, res, next) {
  try {
    const path = req.originalUrl || req.path || '';

    // Se a rota estiver na lista de públicas, não exige token
    if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
      req.isClientPortal = false;
      return next();
    }

    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // token expirado ou inválido
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    const principalId =
      payload.id ||
      payload.userId ||
      payload.sub ||
      payload.uid ||
      payload.clientId;

    if (!principalId) {
      const payloadKeys =
        payload && typeof payload === 'object' ? Object.keys(payload) : [];
      console.warn(
        'Auth middleware: payload sem identificador. keys:',
        payloadKeys
      );
      return res
        .status(401)
        .json({ error: 'Token sem identificação de usuário' });
    }

    const isClientToken =
      payload.type === 'client' &&
      Boolean(payload.clientId) &&
      (payload.tenantId || payload.tenant_id);

    if (isClientToken) {
      req.user = {
        id: principalId,
        role: payload.role || 'CLIENT',
        name: payload.name || null,
        email: payload.email || null,
        type: 'client',
        tenantId: payload.tenantId || payload.tenant_id || null,
      };
      req.clientId = payload.clientId;
      req.tenantId = payload.tenantId || payload.tenant_id || null;
      req.role = req.user.role;
      req.isClientPortal = true;
      return next();
    }

    // Busca usuário no banco (traz apenas campos necessários)
    const user = await prisma.user.findUnique({
      where: { id: principalId },
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        name: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    // Injeta dados úteis no request para uso posterior
    req.user = {
      id: principalId,
      email: user.email,
      role: payload.role || user.role,
      name: user.name,
    };
    req.role = req.user.role;
    req.tenantId = payload.tenantId || user.tenantId;
    req.isClientPortal = false;

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res
      .status(500)
      .json({ error: 'Erro no servidor ao validar token' });
  }
}

/**
 * Middleware específico para CLIENTE (portal do cliente).
 * Espera tokens com payload:
 *   { type: 'client', clientId, tenantId }
 */
async function requireClientAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    if (payload.type !== 'client' || !payload.clientId || !payload.tenantId) {
      return res
        .status(401)
        .json({ error: 'Token não é de cliente ou está incompleto' });
    }

    const client = await prisma.client.findFirst({
      where: {
        id: payload.clientId,
        tenantId: payload.tenantId,
      },
      select: {
        id: true,
        name: true,
        tenantId: true,
        portalEmail: true,
      },
    });

    if (!client) {
      return res.status(401).json({ error: 'Cliente não encontrado' });
    }

    req.client = {
      id: client.id,
      name: client.name,
      email: client.portalEmail || null,
    };
    req.user = {
      id: client.id,
      role: 'CLIENT',
      email: client.portalEmail || null,
      name: client.name || null,
      type: 'client',
    };
    req.role = req.user.role;
    req.clientId = client.id;
    req.tenantId = client.tenantId;
    req.isClientPortal = true;

    return next();
  } catch (error) {
    console.error('Client auth middleware error:', error);
    return res
      .status(500)
      .json({ error: 'Erro no servidor ao validar token do cliente' });
  }
}

/**
 * Middleware de autorização por ROLE para USUÁRIOS internos.
 * Exemplo de uso:
 *   const auth = require('../middleware/auth');
 *   router.get('/billing', auth, auth.requireRole('OWNER', 'ADMIN'), handler);
 */
function requireRole(...allowedRoles) {
  const normalizedAllowed = new Set(
    (allowedRoles || []).map((r) => String(r).toUpperCase())
  );

  return (req, res, next) => {
    const user = req.user;
    if (!user || !user.role) {
      return res.status(403).json({ error: 'Acesso não permitido' });
    }

    const currentRole = String(user.role).toUpperCase();
    if (!normalizedAllowed.has(currentRole)) {
      return res.status(403).json({ error: 'Acesso não permitido' });
    }

    return next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticação requerida' });
  }
  return next();
}

function requireTenant(req, res, next) {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'TenantId não definido no contexto da requisição' });
  }
  return next();
}

function requireClientPortal(req, res, next) {
  if (!req.isClientPortal || !req.clientId) {
    return res.status(403).json({ error: 'Acesso restrito ao portal do cliente' });
  }
  return next();
}

// Export padrão continua sendo o authMiddleware de usuário
module.exports = authMiddleware;

// Exports auxiliares para quem precisar de client portal / roles
module.exports.requireClientAuth = requireClientAuth;
module.exports.requireRole = requireRole;
module.exports.requireAuth = requireAuth;
module.exports.requireTenant = requireTenant;
module.exports.requireClientPortal = requireClientPortal;
