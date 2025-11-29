// api/src/middleware/tenant.js
// Middleware para validar o tenant ativo e injetar no request
// Funciona junto com o authMiddleware (que já injeta req.tenantId do usuário)

const { prisma, useTenant } = require('../prisma');

// Extrai tenant de:
// - header X-Tenant
// - req.user.tenantId (quando autenticado)
// - query param ?tenantId=
// - body.tenantId
function resolveTenant(req) {
  // header tem prioridade
  if (req.headers['x-tenant']) return req.headers['x-tenant'];

  // se o authMiddleware já colocou
  if (req.tenantId) return req.tenantId;

  // query param opcional para testes
  if (req.query && req.query.tenantId) return req.query.tenantId;

  // body
  if (req.body && req.body.tenantId) return req.body.tenantId;

  return null;
}

module.exports = async function tenantMiddleware(req, res, next) {
  try {
    const tenantId = resolveTenant(req);

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
