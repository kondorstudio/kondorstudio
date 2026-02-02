process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

function mockModule(path, exports) {
  const resolved = require.resolve(path);
  require.cache[resolved] = { exports };
}

function resetModule(path) {
  const resolved = require.resolve(path);
  delete require.cache[resolved];
}

mockModule('../src/prisma', { prisma: {}, useTenant: () => ({}) });
resetModule('../src/services/ga4DataService');
const { normalizeRunReportPayload } = require('../src/services/ga4DataService');

test('normalizeRunReportPayload enforces metrics limit', () => {
  const metrics = Array.from({ length: 11 }, (_, idx) => `m${idx}`);
  assert.throws(() =>
    normalizeRunReportPayload({ metrics, dimensions: [] })
  );
});

test('normalizeRunReportPayload enforces dimensions limit', () => {
  const dimensions = Array.from({ length: 11 }, (_, idx) => `d${idx}`);
  assert.throws(() =>
    normalizeRunReportPayload({ metrics: ['sessions'], dimensions })
  );
});

test('normalizeRunReportPayload enforces limit max', () => {
  assert.throws(() =>
    normalizeRunReportPayload({
      metrics: ['sessions'],
      dimensions: [],
      limit: 999999,
    })
  );
});
