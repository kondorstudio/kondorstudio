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
resetModule('../src/services/postsService');
const postsService = require('../src/services/postsService');

const { _internal } = postsService;

const {
  normalizeWorkflowStatus,
  resolveWorkflowStatusFromPost,
  normalizeStatusFilters,
  applyWorkflowStatusFilter,
  resolvePostDate,
} = _internal;

test('normalizeWorkflowStatus maps legacy values', () => {
  assert.equal(normalizeWorkflowStatus('PENDING_APPROVAL'), 'CLIENT_APPROVAL');
  assert.equal(normalizeWorkflowStatus('approved'), 'SCHEDULING');
  assert.equal(normalizeWorkflowStatus('done'), 'DONE');
});

test('resolveWorkflowStatusFromPost honors metadata and feedback', () => {
  const withMetadata = {
    status: 'DRAFT',
    metadata: { workflowStatus: 'CONTENT' },
  };
  assert.equal(resolveWorkflowStatusFromPost(withMetadata), 'CONTENT');

  const withFeedback = {
    status: 'DRAFT',
    clientFeedback: 'ajustar titulo',
  };
  assert.equal(resolveWorkflowStatusFromPost(withFeedback), 'CHANGES');
});

test('applyWorkflowStatusFilter uses workflow status map', () => {
  const items = [
    { id: '1', status: 'DRAFT' },
    { id: '2', status: 'PUBLISHED' },
    { id: '3', status: 'PENDING_APPROVAL' },
  ];

  const filtered = applyWorkflowStatusFilter(items, [
    'DRAFT',
    'CLIENT_APPROVAL',
  ]);

  const ids = filtered.map((item) => item.id).sort();
  assert.deepEqual(ids, ['1', '3']);
});

test('resolvePostDate prefers scheduled then published', () => {
  const now = new Date();
  const scheduled = new Date('2025-01-10T10:00:00Z');
  const published = new Date('2025-01-09T10:00:00Z');

  assert.equal(
    resolvePostDate({ scheduledDate: scheduled, publishedDate: published, createdAt: now }),
    scheduled
  );

  assert.equal(
    resolvePostDate({ scheduledDate: null, publishedDate: published, createdAt: now }),
    published
  );
});

test('normalizeStatusFilters ignores invalid entries', () => {
  const result = normalizeStatusFilters('draft, ,invalid,done');
  assert.deepEqual(result, ['DRAFT', 'DONE']);
});
