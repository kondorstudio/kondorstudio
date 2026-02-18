const { createCryptoAdapter } = require('./cryptoCore');

const adapter = createCryptoAdapter(['ENCRYPTION_KEY', 'CRYPTO_KEY']);

module.exports = {
  encrypt: adapter.encrypt,
  decrypt: adapter.decrypt,
};
