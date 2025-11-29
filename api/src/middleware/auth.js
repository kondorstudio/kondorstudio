// api/src/middleware/auth.js
// Middleware de autenticação JWT e injeção do usuário/tenant no request

const jwt = require('jsonwebtoken');
const { prisma } = require('../prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_local_secret';

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

module.exports = async function authMiddleware(req, res, next) {
  try {
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

    // O payload pode conter userId ou sub dependendo de como o token foi gerado
    const userId = payload.userId || payload.id || payload.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Token sem identificação de usuário' });
    }

    // Busca usuário no banco (traz apenas campos necessários)
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
    req.tenantId = user.tenantId;

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Erro no servidor ao validar token' });
  }
};
