process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_REPORT_THEME,
  DEFAULT_FILTER_CONTROLS,
  reportLayoutSchema,
  normalizeLayout,
} = require('../src/shared/validators/reportLayout.js');

function buildBaseLayout(overrides = {}) {
  return {
    theme: {
      mode: 'light',
      brandColor: '#F59E0B',
      accentColor: '#22C55E',
      bg: '#FFFFFF',
      text: '#0F172A',
      mutedText: '#64748B',
      cardBg: '#FFFFFF',
      border: '#E2E8F0',
      radius: 16,
    },
    globalFilters: {
      dateRange: {
        preset: 'last_7_days',
      },
      platforms: ['META_ADS'],
      accounts: [{ platform: 'META_ADS', external_account_id: 'acc-1' }],
      compareTo: null,
      autoRefreshSec: 30,
    },
    widgets: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'kpi',
        title: 'Spend',
        layout: { x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
        query: {
          dimensions: [],
          metrics: ['spend'],
          filters: [],
        },
        viz: {
          variant: 'default',
          showLegend: true,
          format: 'auto',
          options: {},
        },
      },
    ],
    ...overrides,
  };
}

test('reportLayoutSchema accepts valid layout', () => {
  const result = reportLayoutSchema.safeParse(buildBaseLayout());
  assert.equal(result.success, true);
});

test('reportLayoutSchema accepts valid layout with pages', () => {
  const base = buildBaseLayout();
  const result = reportLayoutSchema.safeParse({
    theme: base.theme,
    globalFilters: base.globalFilters,
    pages: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        name: 'Pagina 1',
        widgets: base.widgets,
      },
    ],
  });
  assert.equal(result.success, true);
});

test('reportLayoutSchema accepts query sort and limit', () => {
  const base = buildBaseLayout({
    widgets: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        type: 'table',
        title: 'Tabela',
        layout: { x: 0, y: 0, w: 12, h: 6, minW: 4, minH: 3 },
        query: {
          dimensions: ['campaign_id'],
          metrics: ['spend'],
          filters: [],
          sort: { field: 'spend', direction: 'desc' },
          limit: 100,
        },
      },
    ],
  });
  const result = reportLayoutSchema.safeParse(base);
  assert.equal(result.success, true);
});

test('reportLayoutSchema accepts text widget and controls flags', () => {
  const base = buildBaseLayout({
    globalFilters: {
      dateRange: { preset: 'last_7_days' },
      platforms: [],
      accounts: [],
      compareTo: null,
      autoRefreshSec: 0,
      controls: {
        showDateRange: false,
        showPlatforms: true,
        showAccounts: false,
      },
    },
    widgets: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        type: 'text',
        title: 'Notas',
        layout: { x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 2 },
        content: {
          text: 'Resumo do dashboard',
          format: 'plain',
        },
      },
    ],
  });
  const result = reportLayoutSchema.safeParse(base);
  assert.equal(result.success, true);
});

test('reportLayoutSchema rejects text widget without content', () => {
  const base = buildBaseLayout({
    widgets: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        type: 'text',
        title: 'Notas',
        layout: { x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 2 },
      },
    ],
  });
  const result = reportLayoutSchema.safeParse(base);
  assert.equal(result.success, false);
});

test('normalizeLayout wraps legacy widgets into a page', () => {
  const base = buildBaseLayout();
  const parsed = reportLayoutSchema.parse(base);
  const normalized = normalizeLayout(parsed);
  assert.equal(Array.isArray(normalized.pages), true);
  assert.equal(normalized.pages.length, 1);
  assert.equal(normalized.pages[0].name, 'Pagina 1');
  assert.equal(normalized.pages[0].widgets.length, 1);
  assert.deepEqual(normalized.globalFilters.controls, DEFAULT_FILTER_CONTROLS);
});

test('reportLayoutSchema applies default theme when theme is missing', () => {
  const base = buildBaseLayout();
  const result = reportLayoutSchema.safeParse({
    globalFilters: base.globalFilters,
    widgets: base.widgets,
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.theme, DEFAULT_REPORT_THEME);

  const normalized = normalizeLayout(result.data);
  assert.deepEqual(normalized.theme, DEFAULT_REPORT_THEME);
});

test('reportLayoutSchema rejects duplicate widget ids', () => {
  const base = buildBaseLayout();
  const duplicate = {
    ...base,
    widgets: [
      ...base.widgets,
      {
        ...base.widgets[0],
        title: 'Clicks',
      },
    ],
  };
  const result = reportLayoutSchema.safeParse(duplicate);
  assert.equal(result.success, false);
});

test('reportLayoutSchema rejects duplicate widget ids across pages', () => {
  const base = buildBaseLayout();
  const result = reportLayoutSchema.safeParse({
    theme: base.theme,
    globalFilters: base.globalFilters,
    pages: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        name: 'Pagina 1',
        widgets: base.widgets,
      },
      {
        id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
        name: 'Pagina 2',
        widgets: base.widgets,
      },
    ],
  });
  assert.equal(result.success, false);
});

test('reportLayoutSchema rejects pages without name', () => {
  const base = buildBaseLayout();
  const result = reportLayoutSchema.safeParse({
    theme: base.theme,
    globalFilters: base.globalFilters,
    pages: [
      {
        id: 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
        name: '',
        widgets: base.widgets,
      },
    ],
  });
  assert.equal(result.success, false);
});

test('reportLayoutSchema rejects duplicate page ids', () => {
  const base = buildBaseLayout();
  const result = reportLayoutSchema.safeParse({
    theme: base.theme,
    globalFilters: base.globalFilters,
    pages: [
      {
        id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
        name: 'Pagina 1',
        widgets: base.widgets,
      },
      {
        id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
        name: 'Pagina 2',
        widgets: [],
      },
    ],
  });
  assert.equal(result.success, false);
});

test('reportLayoutSchema rejects empty pages list', () => {
  const base = buildBaseLayout();
  const result = reportLayoutSchema.safeParse({
    theme: base.theme,
    globalFilters: base.globalFilters,
    pages: [],
  });
  assert.equal(result.success, false);
});

test('reportLayoutSchema rejects kpi with non-date dimension', () => {
  const base = buildBaseLayout({
    widgets: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        type: 'kpi',
        title: 'CTR',
        layout: { x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
        query: {
          dimensions: ['platform'],
          metrics: ['ctr'],
          filters: [],
        },
      },
    ],
  });
  const result = reportLayoutSchema.safeParse(base);
  assert.equal(result.success, false);
});

test('reportLayoutSchema rejects timeseries without date dimension', () => {
  const base = buildBaseLayout({
    widgets: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        type: 'timeseries',
        title: 'Spend Over Time',
        layout: { x: 0, y: 0, w: 6, h: 4, minW: 2, minH: 2 },
        query: {
          dimensions: ['platform'],
          metrics: ['spend'],
          filters: [],
        },
      },
    ],
  });
  const result = reportLayoutSchema.safeParse(base);
  assert.equal(result.success, false);
});

test('reportLayoutSchema rejects bar with date dimension', () => {
  const base = buildBaseLayout({
    widgets: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        type: 'bar',
        title: 'Spend by Date',
        layout: { x: 0, y: 0, w: 6, h: 4, minW: 2, minH: 2 },
        query: {
          dimensions: ['date'],
          metrics: ['spend'],
          filters: [],
        },
      },
    ],
  });
  const result = reportLayoutSchema.safeParse(base);
  assert.equal(result.success, false);
});

test('reportLayoutSchema rejects invalid autoRefreshSec', () => {
  const base = buildBaseLayout({
    globalFilters: {
      dateRange: { preset: 'last_30_days' },
      platforms: [],
      accounts: [],
      compareTo: null,
      autoRefreshSec: 15,
    },
  });
  const result = reportLayoutSchema.safeParse(base);
  assert.equal(result.success, false);
});

test('reportLayoutSchema rejects theme radius above max', () => {
  const current = buildBaseLayout();
  const base = buildBaseLayout({
    theme: {
      ...current.theme,
      radius: 99,
    },
  });
  const result = reportLayoutSchema.safeParse(base);
  assert.equal(result.success, false);
});
