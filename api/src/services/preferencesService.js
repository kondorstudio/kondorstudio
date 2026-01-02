const { prisma } = require('../prisma');

function sanitizeString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeViewMode(value) {
  const raw = sanitizeString(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  return normalized === 'kanban' || normalized === 'calendar' ? normalized : null;
}

function normalizeCollapsedColumns(value) {
  if (value === null) return null;
  if (!isPlainObject(value)) return null;
  const next = {};
  Object.entries(value).forEach(([key, val]) => {
    if (!key) return;
    next[key] = Boolean(val);
  });
  return Object.keys(next).length ? next : {};
}

function normalizeLastFilters(value) {
  if (value === null) return null;
  if (!isPlainObject(value)) return null;

  const next = {};
  const clientId = sanitizeString(value.clientId || value.client_id);
  if (clientId) next.clientId = clientId;

  const dateStart = sanitizeString(value.dateStart || value.startDate);
  if (dateStart) next.dateStart = dateStart;

  const dateEnd = sanitizeString(value.dateEnd || value.endDate);
  if (dateEnd) next.dateEnd = dateEnd;

  const search = sanitizeString(value.search || value.q);
  if (search) next.search = search;

  const status = value.status || value.statuses;
  if (Array.isArray(status)) {
    const cleaned = status.map(sanitizeString).filter(Boolean);
    if (cleaned.length) next.status = cleaned;
  }

  return Object.keys(next).length ? next : {};
}

function buildPreferenceUpdate(payload = {}) {
  const update = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'postsViewMode')) {
    update.postsViewMode = normalizeViewMode(payload.postsViewMode);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'kanbanCollapsedColumns')) {
    update.kanbanCollapsedColumns = normalizeCollapsedColumns(
      payload.kanbanCollapsedColumns
    );
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'lastFilters')) {
    update.lastFilters = normalizeLastFilters(payload.lastFilters);
  }

  return update;
}

async function getPreferences(tenantId, userId) {
  if (!tenantId || !userId) return null;

  const preferences = await prisma.userPreference.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId,
      },
    },
  });

  if (!preferences) {
    return {
      postsViewMode: null,
      kanbanCollapsedColumns: null,
      lastFilters: null,
    };
  }

  return {
    postsViewMode: preferences.postsViewMode || null,
    kanbanCollapsedColumns: preferences.kanbanCollapsedColumns || null,
    lastFilters: preferences.lastFilters || null,
  };
}

async function updatePreferences(tenantId, userId, payload = {}) {
  if (!tenantId || !userId) return null;

  const update = buildPreferenceUpdate(payload);
  const hasUpdate = Object.keys(update).length > 0;

  if (!hasUpdate) {
    return getPreferences(tenantId, userId);
  }

  const preferences = await prisma.userPreference.upsert({
    where: {
      userId_tenantId: {
        userId,
        tenantId,
      },
    },
    create: {
      userId,
      tenantId,
      ...update,
    },
    update,
  });

  return {
    postsViewMode: preferences.postsViewMode || null,
    kanbanCollapsedColumns: preferences.kanbanCollapsedColumns || null,
    lastFilters: preferences.lastFilters || null,
  };
}

module.exports = {
  getPreferences,
  updatePreferences,
};
