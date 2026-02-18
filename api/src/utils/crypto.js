const { createCryptoAdapter } = require('../lib/cryptoCore');

const adapter = createCryptoAdapter(['CRYPTO_KEY', 'ENCRYPTION_KEY']);

exports.encrypt = adapter.encrypt;
exports.decrypt = adapter.decrypt;
