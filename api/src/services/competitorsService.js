// api/src/services/competitorsService.js
// CRUD e snapshots de concorrentes (multi-tenant)

const { prisma } = require("../prisma");

function sanitizeString(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function normalizeHandle(value) {
  const sanitized = sanitizeString(value);
  if (!sanitized) return null;
  return sanitized.replace(/^@/, "");
}

function normalizePlatform(value) {
  const sanitized = sanitizeString(value);
  if (!sanitized) return "instagram";
  return sanitized.toLowerCase();
}

function toInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toFloat(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mergeCollectedAtRange(startDate, endDate) {
  const range = {};
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (start) range.gte = start;
  if (end) range.lte = end;
  return Object.keys(range).length ? range : null;
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  return { ...metadata };
}

function sanitizeCompetitor(record) {
  if (!record) return null;
  const { snapshots, ...rest } = record;
  const latestSnapshot = Array.isArray(snapshots) && snapshots.length ? snapshots[0] : null;
  return { ...rest, latestSnapshot };
}

module.exports = {
  async list(tenantId, opts = {}) {
    const {
      clientId,
      platform,
      status,
      q,
      page = 1,
      perPage = 50,
    } = opts;

    const where = { tenantId };

    if (clientId) where.clientId = clientId;
    if (platform) where.platform = normalizePlatform(platform);
    if (status) where.status = status;

    if (q) {
      const query = String(q).trim();
      if (query) {
        where.OR = [
          { name: { contains: query, mode: "insensitive" } },
          { username: { contains: query.replace(/^@/, ""), mode: "insensitive" } },
        ];
      }
    }

    const skip = (Math.max(1, page) - 1) * perPage;

    const [items, total] = await Promise.all([
      prisma.competitor.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: perPage,
        include: {
          snapshots: {
            orderBy: { collectedAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.competitor.count({ where }),
    ]);

    return {
      items: items.map(sanitizeCompetitor),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  },

  async getById(tenantId, id) {
    if (!id) return null;
    const record = await prisma.competitor.findFirst({
      where: { id, tenantId },
      include: {
        snapshots: {
          orderBy: { collectedAt: "desc" },
          take: 1,
        },
      },
    });
    return sanitizeCompetitor(record);
  },

  async create(tenantId, data = {}) {
    const username = normalizeHandle(data.username || data.handle);
    if (!username) {
      throw new Error("Username do concorrente é obrigatório");
    }

    return prisma.competitor.create({
      data: {
        tenantId,
        clientId: sanitizeString(data.clientId || data.client_id),
        platform: normalizePlatform(data.platform),
        username,
        name: sanitizeString(data.name),
        profileUrl: sanitizeString(data.profileUrl || data.profile_url),
        avatarUrl: sanitizeString(data.avatarUrl || data.avatar_url),
        status: sanitizeString(data.status) || "ACTIVE",
        notes: sanitizeString(data.notes),
        metadata: normalizeMetadata(data.metadata),
      },
    });
  },

  async update(tenantId, id, data = {}) {
    const existing = await prisma.competitor.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return null;

    const updateData = {};
    if (data.clientId !== undefined || data.client_id !== undefined) {
      updateData.clientId = sanitizeString(data.clientId || data.client_id);
    }
    if (data.platform !== undefined) updateData.platform = normalizePlatform(data.platform);
    if (data.username !== undefined || data.handle !== undefined) {
      updateData.username = normalizeHandle(data.username || data.handle);
    }
    if (data.name !== undefined) updateData.name = sanitizeString(data.name);
    if (data.profileUrl !== undefined || data.profile_url !== undefined) {
      updateData.profileUrl = sanitizeString(data.profileUrl || data.profile_url);
    }
    if (data.avatarUrl !== undefined || data.avatar_url !== undefined) {
      updateData.avatarUrl = sanitizeString(data.avatarUrl || data.avatar_url);
    }
    if (data.status !== undefined) updateData.status = sanitizeString(data.status);
    if (data.notes !== undefined) updateData.notes = sanitizeString(data.notes);
    if (data.metadata !== undefined) updateData.metadata = normalizeMetadata(data.metadata);

    await prisma.competitor.update({
      where: { id },
      data: updateData,
    });

    return this.getById(tenantId, id);
  },

  async remove(tenantId, id) {
    const existing = await prisma.competitor.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return false;

    await prisma.competitor.delete({ where: { id } });
    return true;
  },

  async listSnapshots(tenantId, competitorId, opts = {}) {
    if (!competitorId) return [];
    const { startDate, endDate, order = "desc", limit = 60 } = opts;
    const range = mergeCollectedAtRange(startDate, endDate);
    const where = { tenantId, competitorId };
    if (range) where.collectedAt = range;

    return prisma.competitorSnapshot.findMany({
      where,
      orderBy: { collectedAt: order === "asc" ? "asc" : "desc" },
      take: Number.isFinite(Number(limit)) ? Number(limit) : 60,
    });
  },

  async createSnapshot(tenantId, competitorId, data = {}) {
    if (!competitorId) {
      throw new Error("competitorId é obrigatório");
    }

    const competitor = await prisma.competitor.findFirst({
      where: { id: competitorId, tenantId },
    });
    if (!competitor) {
      throw new Error("Concorrente não encontrado");
    }

    return prisma.competitorSnapshot.create({
      data: {
        tenantId,
        competitorId,
        platform: sanitizeString(data.platform) || competitor.platform,
        followers: toInt(data.followers),
        postsCount: toInt(data.postsCount || data.posts_count),
        engagementRate: toFloat(data.engagementRate || data.engagement_rate),
        interactions: toInt(data.interactions),
        likes: toInt(data.likes),
        comments: toInt(data.comments),
        rangeFrom: toDate(data.rangeFrom || data.range_from),
        rangeTo: toDate(data.rangeTo || data.range_to),
        collectedAt: toDate(data.collectedAt || data.collected_at) || new Date(),
        meta: normalizeMetadata(data.meta || data.metadata),
      },
    });
  },

  async markSyncRequested(tenantId, competitorId) {
    const competitor = await prisma.competitor.findFirst({
      where: { id: competitorId, tenantId },
    });
    if (!competitor) return null;
    const metadata = normalizeMetadata(competitor.metadata) || {};
    metadata.lastSyncRequestedAt = new Date().toISOString();

    return prisma.competitor.update({
      where: { id: competitorId },
      data: { metadata },
    });
  },
};
