#!/usr/bin/env node

const { prisma } = require('../src/prisma');
const {
  reportLayoutSchema,
  normalizeLayout,
  DEFAULT_REPORT_THEME,
  DEFAULT_FILTER_CONTROLS,
} = require('../src/shared/validators/reportLayout');

const LEGACY_BRAND_COLORS = new Set(['#B050F0', '#9515EA']);
const LEGACY_ACCENT_COLORS = new Set(['#B050F0', '#9515EA']);

function normalizeHexColor(value) {
  if (typeof value !== 'string') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return null;
  if (raw.length === 4) {
    return (
      `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase()
    );
  }
  return raw.toUpperCase();
}

function stableStringify(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `"${key}":${stableStringify(value[key])}`)
    .join(',')}}`;
}

function isLegacyTheme(theme = {}) {
  const brandColor = normalizeHexColor(theme?.brandColor);
  const accentColor = normalizeHexColor(theme?.accentColor);
  return (
    (brandColor && LEGACY_BRAND_COLORS.has(brandColor)) ||
    (accentColor && LEGACY_ACCENT_COLORS.has(accentColor))
  );
}

function normalizeLayoutForKondor(layoutJson) {
  const parsed = reportLayoutSchema.safeParse(layoutJson);
  if (!parsed.success) {
    return {
      changed: false,
      layoutJson,
      legacyThemeMigrated: false,
      valid: false,
    };
  }

  const normalized = normalizeLayout(parsed.data);
  const legacyThemeMigrated = isLegacyTheme(normalized.theme);

  const nextLayout = {
    ...normalized,
    theme: legacyThemeMigrated
      ? {
          ...normalized.theme,
          ...DEFAULT_REPORT_THEME,
        }
      : normalized.theme,
    globalFilters: {
      ...normalized.globalFilters,
      controls: {
        ...DEFAULT_FILTER_CONTROLS,
        ...(normalized.globalFilters?.controls || {}),
      },
    },
  };

  const changed =
    stableStringify(nextLayout) !== stableStringify(layoutJson);

  return {
    changed,
    layoutJson: nextLayout,
    legacyThemeMigrated,
    valid: true,
  };
}

async function migrateReportsV2Kondor({ prismaClient = prisma } = {}) {
  const summary = {
    templates: {
      total: 0,
      updated: 0,
      legacyThemeMigrated: 0,
      invalidLayoutSkipped: 0,
    },
    dashboardVersions: {
      total: 0,
      updated: 0,
      legacyThemeMigrated: 0,
      invalidLayoutSkipped: 0,
    },
  };

  const templates = await prismaClient.reportTemplateV2.findMany({
    select: { id: true, layoutJson: true },
  });
  summary.templates.total = templates.length;

  for (const template of templates) {
    const result = normalizeLayoutForKondor(template.layoutJson);
    if (!result.valid) {
      summary.templates.invalidLayoutSkipped += 1;
      continue;
    }
    if (result.legacyThemeMigrated) {
      summary.templates.legacyThemeMigrated += 1;
    }
    if (!result.changed) continue;

    await prismaClient.reportTemplateV2.update({
      where: { id: template.id },
      data: { layoutJson: result.layoutJson },
    });
    summary.templates.updated += 1;
  }

  const versions = await prismaClient.reportDashboardVersion.findMany({
    select: { id: true, layoutJson: true },
  });
  summary.dashboardVersions.total = versions.length;

  for (const version of versions) {
    const result = normalizeLayoutForKondor(version.layoutJson);
    if (!result.valid) {
      summary.dashboardVersions.invalidLayoutSkipped += 1;
      continue;
    }
    if (result.legacyThemeMigrated) {
      summary.dashboardVersions.legacyThemeMigrated += 1;
    }
    if (!result.changed) continue;

    await prismaClient.reportDashboardVersion.update({
      where: { id: version.id },
      data: { layoutJson: result.layoutJson },
    });
    summary.dashboardVersions.updated += 1;
  }

  return summary;
}

async function main() {
  const summary = await migrateReportsV2Kondor({ prismaClient: prisma });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[reports:v2:migrate-kondor] failed', error?.message || error);
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await prisma.$disconnect();
      } catch (_) {}
    });
}

module.exports = {
  LEGACY_BRAND_COLORS,
  normalizeLayoutForKondor,
  migrateReportsV2Kondor,
  isLegacyTheme,
};

