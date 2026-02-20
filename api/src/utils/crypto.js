const { createCryptoAdapter } = require('../lib/cryptoCore');

const adapter = createCryptoAdapter(['ENCRYPTION_KEY', 'CRYPTO_KEY']);

exports.encrypt = adapter.encrypt;
exports.decrypt = adapter.decrypt;
