// api/src/utils/hash.js
// Utilitários para hashing seguro de senhas usando bcrypt

const bcrypt = require('bcrypt');

// Custo padrão do hash (10 é bom para produção sem pesar CPU)
const SALT_ROUNDS = parseInt(process.env.HASH_ROUNDS || "10", 10);

/**
 * Gera hash seguro de uma senha.
 *
 * @param {String} password - senha pura
 * @returns {Promise<String>} hash
 */
async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error("Password inválido para hash");
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compara senha pura com hash armazenado.
 *
 * @param {String} password - senha enviada pelo usuário
 * @param {String} hash - senha criptografada no banco
 * @returns {Promise<Boolean>} true se coincidir
 */
async function comparePassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Wrapper síncrono (raro de usar, mas disponível caso precise)
 */
function comparePasswordSync(password, hash) {
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  comparePassword,
  comparePasswordSync,
  SALT_ROUNDS,
};
