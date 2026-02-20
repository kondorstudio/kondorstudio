#!/usr/bin/env node
require('dotenv').config();

const { assertCryptoKeyConfiguration } = require('../src/lib/cryptoCore');

try {
  const result = assertCryptoKeyConfiguration();
  // eslint-disable-next-line no-console
  console.log('[crypto] configuration ok', result);
  process.exit(0);
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('[crypto] invalid configuration', {
    code: error?.code || null,
    message: error?.message || String(error),
  });
  process.exit(1);
}
