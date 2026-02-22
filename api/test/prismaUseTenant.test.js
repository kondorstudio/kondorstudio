process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { prisma, useTenant } = require('../src/prisma');

test('useTenant exposes $transaction with bound prisma context', async () => {
  const original = prisma.$transaction;
  let seenThis = null;

  try {
    prisma.$transaction = function transactionSpy(handler) {
      seenThis = this;
      if (typeof handler === 'function') {
        return Promise.resolve(handler({}));
      }
      return Promise.resolve({ ok: true });
    };

    const db = useTenant('tenant-1');
    const result = await db.$transaction(async () => 'ok');

    assert.equal(result, 'ok');
    assert.equal(seenThis, prisma);
  } finally {
    prisma.$transaction = original;
  }
});

test.after(async () => {
  await prisma.$disconnect();
});
