process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLayoutForKondor,
  migrateReportsV2Kondor,
} = require('../scripts/migrate-reports-v2-kondor');

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildLayout({ brandColor = '#0B5ED7', withControls = true } = {}) {
  const globalFilters = {
    dateRange: { preset: 'last_7_days' },
    platforms: [],
    accounts: [],
    compareTo: null,
    autoRefreshSec: 0,
  };
  if (withControls) {
    globalFilters.controls = {
      showDateRange: true,
      showPlatforms: true,
      showAccounts: true,
    };
  }

  return {
    theme: {
      mode: 'light',
      brandColor,
      accentColor: '#22C55E',
      bg: '#FFFFFF',
      text: '#0F172A',
      mutedText: '#64748B',
      cardBg: '#FFFFFF',
      border: '#E2E8F0',
      radius: 16,
    },
    globalFilters,
    pages: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Página 1',
        widgets: [],
      },
    ],
  };
}

function createFakePrisma() {
  const state = {
    templates: [],
    versions: [],
  };

  const prismaClient = {
    reportTemplateV2: {
      findMany: async () =>
        state.templates.map((item) => ({
          id: item.id,
          layoutJson: deepClone(item.layoutJson),
        })),
      update: async ({ where, data }) => {
        const index = state.templates.findIndex((item) => item.id === where.id);
        if (index < 0) throw new Error('template not found');
        state.templates[index] = {
          ...state.templates[index],
          layoutJson: deepClone(data.layoutJson),
        };
        return deepClone(state.templates[index]);
      },
    },
    reportDashboardVersion: {
      findMany: async () =>
        state.versions.map((item) => ({
          id: item.id,
          layoutJson: deepClone(item.layoutJson),
        })),
      update: async ({ where, data }) => {
        const index = state.versions.findIndex((item) => item.id === where.id);
        if (index < 0) throw new Error('version not found');
        state.versions[index] = {
          ...state.versions[index],
          layoutJson: deepClone(data.layoutJson),
        };
        return deepClone(state.versions[index]);
      },
    },
  };

  return { prismaClient, state };
}

test('normalizeLayoutForKondor migrates legacy theme and ensures controls', () => {
  const legacyLayout = buildLayout({
    brandColor: '#B050F0',
    withControls: false,
  });

  const result = normalizeLayoutForKondor(legacyLayout);

  assert.equal(result.valid, true);
  assert.equal(result.changed, true);
  assert.equal(result.legacyThemeMigrated, true);
  assert.equal(result.layoutJson.theme.brandColor, '#0B5ED7');
  assert.deepEqual(result.layoutJson.globalFilters.controls, {
    showDateRange: true,
    showPlatforms: true,
    showAccounts: true,
  });
});

test('migrateReportsV2Kondor is idempotent across templates and dashboard versions', async () => {
  const { prismaClient, state } = createFakePrisma();
  state.templates.push(
    {
      id: 'tpl-legacy',
      layoutJson: buildLayout({ brandColor: '#B050F0', withControls: false }),
    },
    {
      id: 'tpl-modern',
      layoutJson: buildLayout({ brandColor: '#0B5ED7', withControls: true }),
    },
  );
  state.versions.push(
    {
      id: 'ver-legacy',
      layoutJson: buildLayout({ brandColor: '#B050F0', withControls: false }),
    },
    {
      id: 'ver-modern',
      layoutJson: buildLayout({ brandColor: '#0B5ED7', withControls: true }),
    },
  );

  const firstRun = await migrateReportsV2Kondor({ prismaClient });
  assert.equal(firstRun.templates.total, 2);
  assert.equal(firstRun.templates.updated, 1);
  assert.equal(firstRun.dashboardVersions.total, 2);
  assert.equal(firstRun.dashboardVersions.updated, 1);

  assert.equal(state.templates[0].layoutJson.theme.brandColor, '#0B5ED7');
  assert.equal(state.versions[0].layoutJson.theme.brandColor, '#0B5ED7');
  assert.deepEqual(state.templates[0].layoutJson.globalFilters.controls, {
    showDateRange: true,
    showPlatforms: true,
    showAccounts: true,
  });

  const secondRun = await migrateReportsV2Kondor({ prismaClient });
  assert.equal(secondRun.templates.updated, 0);
  assert.equal(secondRun.dashboardVersions.updated, 0);
});

