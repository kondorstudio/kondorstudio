// api/src/utils/jwt.js
// Helpers para criação e verificação de JWTs
// Usa jsonwebtoken e variáveis de ambiente para configurar tempos e secret

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_local_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // token de acesso
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d'; // refresh token

/**
 * Gera um token de acesso (JWT) com payload informado.
 * Recomenda-se incluir apenas claims mínimas (userId, role, tenantId).
 *
 * @param {Object} payload - objeto com os dados que irão para o token (ex: { userId, role, tenantId })
 * @param {String|Number} [expiresIn] - override do tempo de expiração (ex: '1h', '7d')
 * @returns {String} token JWT
 */
function createAccessToken(payload = {}, expiresIn = JWT_EXPIRES_IN) {
  // não inclua informações sensíveis no payload
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Gera um refresh token seguro (string aleatória) para ser guardado no banco.
 * Separar refresh token do JWT é mais seguro em muitos fluxos.
 *
 * @returns {String} refresh token (hex)
 */
function createRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Verifica um access token e retorna o payload ou lança erro.
 *
 * @param {String} token
 * @returns {Object} payload
 */
function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Decodifica um token sem validar (útil para inspeção), retorna payload ou null.
 * NÃO USE para autorizar — apenas para leitura.
 *
 * @param {String} token
 * @returns {Object|null}
 */
function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch (err) {
    return null;
  }
}

/**
 * Middleware exemplo simples que pode ser reutilizado nas rotas se quiser.
 * (Alternativa ao authMiddleware que já está no projeto)
 */
function expressJwtMiddleware(options = {}) {
  const secret = options.secret || JWT_SECRET;
  return (req, res, next) => {
    const authHeader = req.headers && req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) return res.status(401).json({ error: 'Token inválido' });
    const token = parts[1];
    try {
      const payload = jwt.verify(token, secret);
      req.jwt = payload;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
  };
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  decodeToken,
  expressJwtMiddleware,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
};
