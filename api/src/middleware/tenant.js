// api/src/middleware/tenant.js
// Middleware para validar o tenant ativo e injetar no request
// Funciona junto com o authMiddleware (que já injeta req.tenantId do usuário)

const { prisma, useTenant } = require('../prisma');

// Rotas onde o tenantId NÃO é obrigatório
// (ex.: criação do primeiro tenant, health, auth público etc.)
const TENANT_OPTIONAL_PATHS = [
  '/api/tenants/register', // criação de tenant + admin (não existe tenant ainda)
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/health',
  '/api/healthz',
  '/api/public', // prefixo para rotas públicas (se existirem)
  '/api/admin', // painel mestre não exige tenantId fixo

  // ✅ Meta OAuth callback precisa ser público e sem X-Tenant
  '/api/integrations/meta/callback',
  '/api/integrations/ga4/oauth/callback',
];

function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

function canOverrideTenant(req, path) {
  const role = normalizeRole(req?.user?.role);
  if (role !== 'SUPER_ADMIN') return false;
  return Boolean(path && path.startsWith('/api/admin'));
}

function resolveTenant(req, path) {
  const userTenantId = req.tenantId || req.user?.tenantId || null;
  if (canOverrideTenant(req, path)) {
    const headerTenant =
      req.headers['x-tenant'] || req.headers['x-tenant-id'] || null;
    if (headerTenant) return String(headerTenant);
  }
  return userTenantId;
}

async function logTenantOverride({ tenantId, fromTenantId, req }) {
  try {
    if (!tenantId || !req?.user?.id) return;
    await prisma.auditLog.create({
      data: {
        tenantId: tenantId,
        userId: req.user.id,
        action: 'tenant.override',
        resource: 'tenant',
        resourceId: tenantId,
        ip: req.ip || req.headers['x-forwarded-for'] || null,
        meta: {
          fromTenantId: fromTenantId || null,
          toTenantId: tenantId,
          path: req.originalUrl || req.path || null,
          userAgent: req.headers['user-agent'] || null,
        },
      },
    });
  } catch (err) {
    console.warn('Falha ao registrar auditoria de tenant override:', err?.message || err);
  }
}

module.exports = async function tenantMiddleware(req, res, next) {
  try {
    if (req.method === 'OPTIONS') {
      return next();
    }
    const path = req.originalUrl || req.path || '';

    // Se a rota estiver na lista de rotas que não exigem tenantId, libera
    if (TENANT_OPTIONAL_PATHS.some((p) => path.startsWith(p))) {
      return next();
    }

    if (req.db && req.tenantId) {
      return next();
    }

    const tenantId = resolveTenant(req, path);

    if (!tenantId) {
      return res.status(400).json({
        error: 'TenantId não fornecido. Inclua no header X-Tenant ou no token JWT.',
      });
    }

    // Verifica se o tenant existe
    const tenantExists = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenantExists) {
      return res.status(404).json({
        error: 'Tenant não encontrado',
        tenantId,
      });
    }

    // Audita override quando SUPER_ADMIN troca o tenant via header
    const headerTenant =
      req.headers['x-tenant'] || req.headers['x-tenant-id'] || null;
    if (headerTenant && canOverrideTenant(req, path)) {
      const fromTenantId = req.tenantId || req.user?.tenantId || null;
      if (fromTenantId && String(headerTenant) !== String(fromTenantId)) {
        await logTenantOverride({
          tenantId: String(headerTenant),
          fromTenantId: String(fromTenantId),
          req,
        });
      }
    }

    // Injeta helpers multitenant
    req.tenantId = tenantId;
    req.tenant = tenantExists; // opcional
    req.db = useTenant(tenantId); // prisma especializado naquele tenant

    return next();
  } catch (err) {
    console.error('Tenant middleware error:', err);
    return res.status(500).json({ error: 'Erro ao validar tenant' });
  }
};
