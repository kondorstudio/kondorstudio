// api/src/routes/admin.js
// Namespace /api/admin responsável pelo painel mestre (Control Center)

const express = require('express');
const ensureAdminAccess = require('../middleware/ensureAdminAccess');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const { prisma } = require('../prisma');
const { createAccessToken } = require('../utils/jwt');
const { hashPassword } = require('../utils/hash');
const stripeService = require('../services/stripeService');
const syncObservabilityService = require('../modules/observability/syncObservability.service');
const credentialsComplianceService = require('../modules/compliance/credentialsCompliance.service');
const crypto = require('crypto');

const router = express.Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const STATUS_LABELS = {
  TRIAL: 'Trial',
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  CANCELLED: 'Cancelado',
};

const PT_BR_TO_STATUS = {
  TRIAL: 'TRIAL',
  ATIVO: 'ACTIVE',
  ATIVA: 'ACTIVE',
  ACTIVE: 'ACTIVE',
  SUSPENSO: 'SUSPENDED',
  SUSPENSA: 'SUSPENDED',
  SUSPENSOS: 'SUSPENDED',
  INATIVO: 'SUSPENDED',
  INATIVA: 'SUSPENDED',
  CANCELADO: 'CANCELLED',
  CANCELADA: 'CANCELLED',
  CANCELLED: 'CANCELLED',
};

const LOG_LEVELS = new Set(['ERROR', 'WARN', 'INFO']);
const JOB_STATUS = new Set(['FAILED', 'COMPLETED', 'RETRYING']);
const NOTE_SEVERITIES = new Set(['LOW', 'MEDIUM', 'HIGH']);

const ROLE_LABELS = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Membro',
  CLIENT: 'Cliente',
  GUEST: 'Convidado',
  SUPER_ADMIN: 'Super Admin',
  SUPPORT: 'Suporte',
  FINANCE: 'Financeiro',
  TECH: 'Técnico',
};

const ROLE_ALIASES = {
  DONO: 'OWNER',
  PROPRIETARIO: 'OWNER',
  PROPRIETÁRIO: 'OWNER',
  ADMINISTRADOR: 'ADMIN',
  ADMINISTRADORA: 'ADMIN',
  ADMINISTRATOR: 'ADMIN',
  MEMBRO: 'MEMBER',
  MEMBROS: 'MEMBER',
  CLIENTE: 'CLIENT',
  CLIENTES: 'CLIENT',
  CONVIDADO: 'GUEST',
  CONVIDADA: 'GUEST',
  SUPERADMIN: 'SUPER_ADMIN',
  SUPERADMINISTRADOR: 'SUPER_ADMIN',
  SUPORTE: 'SUPPORT',
  SUPORTE_TECNICO: 'SUPPORT',
  FINANCEIRO: 'FINANCE',
  FINANCAS: 'FINANCE',
  TECNICO: 'TECH',
  TÉCNICO: 'TECH',
  TECHNICAL: 'TECH',
};

const USER_STATUS_ALIASES = {
  ACTIVE: true,
  ATIVO: true,
  ATIVA: true,
  TRUE: true,
  '1': true,
  INACTIVE: false,
  INATIVO: false,
  INATIVA: false,
  DESATIVADO: false,
  DESATIVADA: false,
  FALSE: false,
  '0': false,
};

const IMPERSONATION_TOKEN_EXPIRES_IN = process.env.IMPERSONATION_TOKEN_EXPIRES_IN || '1h';
const IMPERSONATION_SESSION_TTL_MINUTES = Number(
  process.env.IMPERSONATION_SESSION_TTL_MINUTES || 90
);

function calcSessionExpiresAt() {
  const minutes = Number.isFinite(IMPERSONATION_SESSION_TTL_MINUTES)
    ? IMPERSONATION_SESSION_TTL_MINUTES
    : 90;
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + minutes);
  return expires;
}

function buildTokenHash(prefix = 'session') {
  return `${prefix}:${crypto.randomBytes(24).toString('hex')}`;
}

function computeExpiryDateFromString(expiresIn) {
  try {
    const lower = String(expiresIn || '').toLowerCase().trim();
    if (!lower) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d;
    }
    if (lower.endsWith('d')) {
      const days = parseInt(lower.slice(0, -1), 10);
      const d = new Date();
      d.setDate(d.getDate() + (Number.isFinite(days) ? days : 1));
      return d;
    }
    if (lower.endsWith('h')) {
      const hours = parseInt(lower.slice(0, -1), 10);
      const d = new Date();
      d.setHours(d.getHours() + (Number.isFinite(hours) ? hours : 1));
      return d;
    }
    if (lower.endsWith('m')) {
      const mins = parseInt(lower.slice(0, -1), 10);
      const d = new Date();
      d.setMinutes(d.getMinutes() + (Number.isFinite(mins) ? mins : 30));
      return d;
    }
  } catch (err) {}

  const fallback = new Date();
  fallback.setHours(fallback.getHours() + 1);
  return fallback;
}

function normalizeStatus(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  if (STATUS_LABELS[normalized]) return normalized;
  if (PT_BR_TO_STATUS[normalized]) return PT_BR_TO_STATUS[normalized];
  return null;
}

function normalizeRole(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  if (ROLE_LABELS[normalized]) return normalized;
  if (ROLE_ALIASES[normalized]) return ROLE_ALIASES[normalized];
  return null;
}

function normalizeUserStatus(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toUpperCase();
  if (USER_STATUS_ALIASES.hasOwnProperty(normalized)) {
    return USER_STATUS_ALIASES[normalized];
  }
  return null;
}

function normalizeSource(value) {
  if (!value) return null;
  return String(value).trim().toUpperCase();
}

function normalizeLogLevel(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  return LOG_LEVELS.has(normalized) ? normalized : null;
}

function normalizeJobStatus(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  return JOB_STATUS.has(normalized) ? normalized : null;
}

function parseDateParam(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeSeverity(value) {
  if (!value) return 'MEDIUM';
  const normalized = String(value).trim().toUpperCase();
  return NOTE_SEVERITIES.has(normalized) ? normalized : 'MEDIUM';
}

async function fetchPrimaryContacts(tenantIds) {
  if (!tenantIds.length) return {};
  const users = await prisma.user.findMany({
    where: {
      tenantId: { in: tenantIds },
      role: { in: ['OWNER', 'ADMIN'] },
      isActive: true,
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, email: true, role: true, tenantId: true, createdAt: true },
  });

  const priority = { OWNER: 1, ADMIN: 2 };
  return users.reduce((acc, user) => {
    const existing = acc[user.tenantId];
    if (!existing) {
      acc[user.tenantId] = user;
      return acc;
    }

    const existingPriority = priority[existing.role] || 99;
    const currentPriority = priority[user.role] || 99;

    if (currentPriority < existingPriority) {
      acc[user.tenantId] = user;
    }

    return acc;
  }, {});
}

async function fetchLatestSubscriptions(tenantIds) {
  if (!tenantIds.length) return {};

  const subscriptions = await prisma.subscription.findMany({
    where: { tenantId: { in: tenantIds } },
    orderBy: [{ tenantId: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      tenantId: true,
      status: true,
      currentPeriodEnd: true,
      currentPeriodStart: true,
      planId: true,
    },
  });

  const map = {};
  for (const sub of subscriptions) {
    if (!map[sub.tenantId]) {
      map[sub.tenantId] = sub;
    }
  }
  return map;
}

function serializeTenant(tenant, contact, subscription) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    statusLabel: STATUS_LABELS[tenant.status] || tenant.status,
    billingCustomerId: tenant.billingCustomerId,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    plan: tenant.plan
      ? {
          id: tenant.plan.id,
          key: tenant.plan.key,
          name: tenant.plan.name,
          priceCents: tenant.plan.priceCents,
          interval: tenant.plan.interval,
        }
      : null,
    primaryContact: contact
      ? {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          role: contact.role,
        }
      : null,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
  };
}

function serializeUser(user, lastLoginAt) {
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || user.role,
    isActive: user.isActive,
    mfaEnabled: user.mfaEnabled || false,
    lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// Garante que todo endpoint abaixo exija acesso ao painel mestre
router.use(ensureAdminAccess);

// GET /api/admin/overview
router.get('/overview', requireAdminPermission('tenants.read'), async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      activeUsers,
      totalUsers,
      activeSubscriptions,
      connectedIntegrations,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.tenant.count({ where: { status: 'TRIAL' } }),
      prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.subscription.findMany({
        where: {
          status: 'SUCCEEDED',
          currentPeriodEnd: { gte: now },
        },
        include: { plan: true },
      }),
      prisma.integration.count({ where: { status: 'CONNECTED' } }),
    ]);

    const mrrCents = activeSubscriptions.reduce((sum, sub) => {
      const priceCents = sub.plan?.priceCents || 0;
      const interval = String(sub.plan?.interval || '').toUpperCase();
      if (interval === 'YEARLY') {
        return sum + Math.round(priceCents / 12);
      }
      return sum + priceCents;
    }, 0);

    const churnedTenants = await prisma.tenant.count({
      where: {
        status: 'CANCELLED',
        updatedAt: { gte: thirtyDaysAgo },
      },
    });

    let recentErrorLogs = [];
    let recentFailedJobs = [];

    try {
      [recentErrorLogs, recentFailedJobs] = await Promise.all([
        prisma.systemLog.findMany({
          where: {
            level: 'ERROR',
            tenantId: { not: null },
            createdAt: { gte: twentyFourHoursAgo },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
          include: {
            tenant: { select: { id: true, name: true, status: true } },
          },
        }),
        prisma.jobLog.findMany({
          where: {
            status: 'FAILED',
            createdAt: { gte: twentyFourHoursAgo },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ]);
    } catch (highlightError) {
      console.warn('[ADMIN] overview highlights fallback:', highlightError?.message || highlightError);
    }

    const churnRate =
      activeTenants + churnedTenants > 0
        ? Number(((churnedTenants / (activeTenants + churnedTenants)) * 100).toFixed(2))
        : 0;

    const tenantErrorMap = recentErrorLogs.reduce((acc, log) => {
      if (!log.tenantId) return acc;
      if (!acc[log.tenantId]) {
        acc[log.tenantId] = {
          id: log.tenant?.id || log.tenantId,
          tenantId: log.tenantId,
          name: log.tenant?.name || 'Tenant',
          status: log.tenant?.status || null,
          statusLabel: STATUS_LABELS[log.tenant?.status] || log.tenant?.status || null,
          totalErrors: 0,
          lastErrorAt: null,
        };
      }
      acc[log.tenantId].totalErrors += 1;
      if (
        !acc[log.tenantId].lastErrorAt ||
        new Date(log.createdAt) > new Date(acc[log.tenantId].lastErrorAt)
      ) {
        acc[log.tenantId].lastErrorAt = log.createdAt;
      }
      return acc;
    }, {});

    const tenantsWithErrors = Object.values(tenantErrorMap)
      .sort((a, b) => b.totalErrors - a.totalErrors)
      .slice(0, 8);

    const queueFailureMap = recentFailedJobs.reduce((acc, job) => {
      const key = `${job.queue || 'unknown'}::${job.status || 'FAILED'}`;
      if (!acc[key]) {
        acc[key] = {
          queue: job.queue || 'unknown',
          status: job.status || 'FAILED',
          totalFailures: 0,
          tenantId: job.tenantId || null,
          lastFailureAt: null,
        };
      }
      acc[key].totalFailures += 1;
      if (
        !acc[key].lastFailureAt ||
        new Date(job.createdAt) > new Date(acc[key].lastFailureAt)
      ) {
        acc[key].lastFailureAt = job.createdAt;
      }
      return acc;
    }, {});

    const failingQueues = Object.values(queueFailureMap)
      .sort((a, b) => b.totalFailures - a.totalFailures)
      .slice(0, 8);

    return res.json({
      overview: {
        tenants: {
          total: totalTenants,
          ativos: activeTenants,
          trial: trialTenants,
          suspensos: suspendedTenants,
          cancelados30d: churnedTenants,
        },
        usuarios: {
          total: totalUsers,
          ativos: activeUsers,
        },
        billing: {
          mrrCents,
          mrr: mrrCents / 100,
          churnRate,
          activeSubscriptions: activeSubscriptions.length,
        },
        integrations: {
          connected: connectedIntegrations,
        },
      },
      highlights: {
        tenantsWithErrors,
        failingQueues,
      },
      status: 'ok',
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('[ADMIN] GET /overview error', error);
    return res.status(500).json({ error: 'Erro ao carregar overview' });
  }
});

// GET /api/admin/tenants
router.get('/tenants', requireAdminPermission('tenants.read'), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const search = req.query.search ? String(req.query.search).trim() : null;
    const status = normalizeStatus(req.query.status);

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [total, tenants] = await prisma.$transaction([
      prisma.tenant.count({ where }),
      prisma.tenant.findMany({
        where,
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const tenantIds = tenants.map((tenant) => tenant.id);
    const [contactMap, subscriptionMap] = await Promise.all([
      fetchPrimaryContacts(tenantIds),
      fetchLatestSubscriptions(tenantIds),
    ]);

    const serialized = tenants.map((tenant) =>
      serializeTenant(tenant, contactMap[tenant.id], subscriptionMap[tenant.id])
    );

    return res.json({
      tenants: serialized,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: pageSize ? Math.ceil(total / pageSize) : 0,
      },
      filters: {
        status: status || null,
        search: search || null,
      },
    });
  } catch (error) {
    console.error('[ADMIN] GET /tenants error', error);
    return res.status(500).json({ error: 'Erro ao listar tenants' });
  }
});

// GET /api/admin/tenants/:id
router.get('/tenants/:id', requireAdminPermission('tenants.read'), async (req, res) => {
  try {
    const { id } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        plan: true,
        _count: {
          select: {
            users: true,
            clients: true,
            projects: true,
            posts: true,
          },
        },
      },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    const [contactMap, subscription] = await Promise.all([
      fetchPrimaryContacts([tenant.id]),
      prisma.subscription.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const response = serializeTenant(tenant, contactMap[tenant.id], subscription);

    return res.json({
      tenant: {
        ...response,
        settings: tenant.settings || {},
        counts: tenant._count,
      },
    });
  } catch (error) {
    console.error('[ADMIN] GET /tenants/:id error', error);
    return res.status(500).json({ error: 'Erro ao carregar tenant' });
  }
});

// GET /api/admin/tenants/:id/users
router.get('/tenants/:id/users', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const { id } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const search = req.query.search ? String(req.query.search).trim() : null;
    const roleFilter = req.query.role ? normalizeRole(req.query.role) : null;
    const statusFilter = normalizeUserStatus(req.query.status);

    const where = { tenantId: id };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (roleFilter) {
      where.role = roleFilter;
    }

    if (statusFilter !== null) {
      where.isActive = statusFilter;
    }

    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          tenantId: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mfaEnabled: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const userIds = users.map((user) => user.id);
    const lastLoginMap = {};

    if (userIds.length) {
      const sessions = await prisma.sessionToken.findMany({
        where: { userId: { in: userIds } },
        orderBy: { createdAt: 'desc' },
        take: userIds.length * 3,
        select: { userId: true, createdAt: true, meta: true },
      });

      sessions.forEach((session) => {
        if (!lastLoginMap[session.userId]) {
          lastLoginMap[session.userId] = session.meta?.isImpersonation
            ? null
            : session.createdAt;
        }
      });
    }

    const serializedUsers = users.map((user) =>
      serializeUser(user, lastLoginMap[user.id] || null)
    );

    return res.json({
      tenant,
      users: serializedUsers,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: pageSize ? Math.ceil(total / pageSize) : 0,
      },
      filters: {
        search: search || null,
        role: roleFilter || null,
        status:
          statusFilter === null
            ? null
            : statusFilter
            ? 'ACTIVE'
            : 'INACTIVE',
      },
    });
  } catch (error) {
    console.error('[ADMIN] GET /tenants/:id/users error', error);
    return res.status(500).json({ error: 'Erro ao listar usuários do tenant' });
  }
});

// PATCH /api/admin/tenants/:id
router.patch('/tenants/:id', requireAdminPermission('tenants.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status: statusPayload, planKey, planId } = req.body || {};

    const updateData = {};
    let normalizedStatus = null;

    if (statusPayload) {
      normalizedStatus = normalizeStatus(statusPayload);
      if (!normalizedStatus) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      updateData.status = normalizedStatus;
    }

    if (planKey || planId) {
      const planWhere = planId ? { id: planId } : { key: String(planKey).trim() };
      const plan = await prisma.plan.findFirst({ where: planWhere });
      if (!plan) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }
      updateData.planId = plan.id;
    }

    if (!Object.keys(updateData).length) {
      return res.status(400).json({ error: 'Nenhuma alteração enviada' });
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data: updateData,
      include: { plan: true },
    });

    const [contactMap, subscription] = await Promise.all([
      fetchPrimaryContacts([updated.id]),
      prisma.subscription.findFirst({
        where: { tenantId: updated.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return res.json({
      tenant: serializeTenant(updated, contactMap[updated.id], subscription),
    });
  } catch (error) {
    console.error('[ADMIN] PATCH /tenants/:id error', error);
    return res.status(500).json({ error: 'Erro ao atualizar tenant' });
  }
});

// GET /api/admin/users
router.get('/users', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const search = req.query.search ? String(req.query.search).trim() : null;
    const roleFilter = req.query.role ? normalizeRole(req.query.role) : null;
    const statusFilter = normalizeUserStatus(req.query.status);
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : null;

    const where = {};
    if (tenantId) where.tenantId = tenantId;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (roleFilter) {
      where.role = roleFilter;
    }

    if (statusFilter !== null) {
      where.isActive = statusFilter;
    }

    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          tenantId: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mfaEnabled: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return res.json({
      users: users.map((user) => serializeUser(user, null)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: pageSize ? Math.ceil(total / pageSize) : 0,
      },
      filters: {
        search: search || null,
        role: roleFilter || null,
        status:
          statusFilter === null
            ? null
            : statusFilter
            ? 'ACTIVE'
            : 'INACTIVE',
        tenantId: tenantId || null,
      },
    });
  } catch (error) {
    console.error('[ADMIN] GET /users error', error);
    return res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', requireAdminPermission('users.update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { role: rolePayload, isActive, mfaEnabled } = req.body || {};

    if (
      typeof rolePayload === 'undefined' &&
      typeof isActive === 'undefined' &&
      typeof mfaEnabled === 'undefined'
    ) {
      return res.status(400).json({ error: 'Nenhuma alteração enviada' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (user.role === 'SUPER_ADMIN') {
      return res
        .status(403)
        .json({ error: 'Usuários SUPER_ADMIN não podem ser alterados por este painel' });
    }

    const updateData = {};

    if (typeof isActive === 'boolean') {
      updateData.isActive = isActive;
    }

    if (typeof mfaEnabled === 'boolean') {
      updateData.mfaEnabled = mfaEnabled;
    }

    if (typeof rolePayload !== 'undefined') {
      const normalizedRole = normalizeRole(rolePayload);
      if (!normalizedRole) {
        return res.status(400).json({ error: 'Role inválida' });
      }
      if (normalizedRole === 'SUPER_ADMIN') {
        return res
          .status(403)
          .json({ error: 'Atribuição de SUPER_ADMIN não é permitida por esta rota' });
      }
      updateData.role = normalizedRole;
    }

    if (!Object.keys(updateData).length) {
      return res.status(400).json({ error: 'Nenhuma modificação aplicada' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const lastSession = await prisma.sessionToken.findFirst({
      where: { userId: updated.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return res.json({
      user: serializeUser(updated, lastSession ? lastSession.createdAt : null),
    });
  } catch (error) {
    console.error('[ADMIN] PATCH /users/:id error', error);
    return res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', requireAdminPermission('users.update'), async (req, res) => {
  try {
    const { id } = req.params;
    const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, tenantId: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Não é permitido resetar senha de SUPER_ADMIN por esta rota' });
    }

    const passwordHash = await hashPassword(tempPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailVerified: false,
      },
    });

    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revoked: true },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: req.user?.id || null,
        action: 'ADMIN_RESET_PASSWORD',
        resource: 'user',
        resourceId: user.id,
        ip: req.ip || null,
        meta: { email: user.email },
      },
    });

    return res.json({
      ok: true,
      userId: user.id,
      tempPassword,
    });
  } catch (error) {
    console.error('[ADMIN] POST /users/:id/reset-password error', error);
    return res.status(500).json({ error: 'Erro ao resetar senha' });
  }
});

// POST /api/admin/users/:id/force-logout
router.post('/users/:id/force-logout', requireAdminPermission('users.update'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revoked: true },
    });
    await prisma.sessionToken.deleteMany({
      where: { userId: user.id },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: req.user?.id || null,
        action: 'ADMIN_FORCE_LOGOUT',
        resource: 'user',
        resourceId: user.id,
        ip: req.ip || null,
      },
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error('[ADMIN] POST /users/:id/force-logout error', error);
    return res.status(500).json({ error: 'Erro ao forçar logout' });
  }
});

// POST /api/admin/impersonate
router.post('/impersonate', requireAdminPermission('impersonate'), async (req, res) => {
  try {
    const { userId } = req.body || {};

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        tenantId: true,
        tenant: { select: { id: true, name: true } },
      },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!targetUser.isActive) {
      return res.status(400).json({ error: 'Usuário está inativo' });
    }

    if (targetUser.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Não é permitido impersonar SUPER_ADMIN' });
    }

    const sessionExpiresAt = calcSessionExpiresAt();
    const sessionRecord = await prisma.sessionToken.create({
      data: {
        userId: targetUser.id,
        tokenHash: buildTokenHash('impersonation'),
        meta: {
          isImpersonation: true,
          superAdminId: req.user.id,
          superAdminEmail: req.user.email || null,
          startedAt: new Date().toISOString(),
        },
        expiresAt: sessionExpiresAt,
      },
    });

    const tokenExpiresAt = computeExpiryDateFromString(IMPERSONATION_TOKEN_EXPIRES_IN);

    const impersonationToken = createAccessToken(
      {
        sub: targetUser.id,
        userId: targetUser.id,
        tenantId: targetUser.tenantId,
        role: targetUser.role,
        impersonated: true,
        superAdminId: req.user.id,
        impersonationSessionId: sessionRecord.id,
      },
      IMPERSONATION_TOKEN_EXPIRES_IN
    );

    await prisma.auditLog.create({
      data: {
        tenantId: targetUser.tenantId,
        userId: req.user.id,
        action: 'IMPERSONATE_START',
        resource: 'user',
        resourceId: targetUser.id,
        ip: req.ip || null,
        meta: {
          impersonatedUserId: targetUser.id,
          impersonatedUserEmail: targetUser.email,
          impersonationSessionId: sessionRecord.id,
        },
      },
    });

    return res.json({
      impersonationToken,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
      sessionId: sessionRecord.id,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
      targetUser: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        roleLabel: ROLE_LABELS[targetUser.role] || targetUser.role,
        tenantId: targetUser.tenantId,
        tenantName: targetUser.tenant ? targetUser.tenant.name : null,
      },
    });
  } catch (error) {
    console.error('[ADMIN] POST /impersonate error', error);
    return res.status(500).json({ error: 'Erro ao iniciar impersonate' });
  }
});

// POST /api/admin/impersonate/stop
router.post('/impersonate/stop', requireAdminPermission('impersonate'), async (req, res) => {
  try {
    const { sessionId, impersonatedUserId } = req.body || {};

    if (!sessionId && !impersonatedUserId) {
      return res.status(400).json({ error: 'sessionId ou impersonatedUserId são obrigatórios' });
    }

    let sessionRecord = null;

    if (sessionId) {
      sessionRecord = await prisma.sessionToken.findUnique({
        where: { id: sessionId },
        include: {
          user: { select: { id: true, tenantId: true, email: true, name: true } },
        },
      });
    }

    if (sessionRecord && sessionRecord.meta?.superAdminId && sessionRecord.meta.superAdminId !== req.user.id) {
      return res.status(403).json({ error: 'Este impersonate pertence a outro super admin' });
    }

    let targetInfo = sessionRecord ? sessionRecord.user : null;

    if (!sessionRecord && impersonatedUserId) {
      targetInfo = await prisma.user.findUnique({
        where: { id: impersonatedUserId },
        select: { id: true, tenantId: true, email: true, name: true },
      });
    }

    if (!sessionRecord && !targetInfo) {
      return res.status(404).json({ error: 'Sessão de impersonate não encontrada' });
    }

    if (sessionRecord) {
      const meta = sessionRecord.meta && typeof sessionRecord.meta === 'object'
        ? { ...sessionRecord.meta }
        : {};
      meta.endedAt = new Date().toISOString();
      meta.endedBySuperAdminId = req.user.id;
      await prisma.sessionToken.update({
        where: { id: sessionRecord.id },
        data: { meta },
      });
    }

    if (targetInfo) {
      await prisma.auditLog.create({
        data: {
          tenantId: targetInfo.tenantId,
          userId: req.user.id,
          action: 'IMPERSONATE_END',
          resource: 'user',
          resourceId: targetInfo.id,
          ip: req.ip || null,
          meta: {
            impersonatedUserId: targetInfo.id,
            impersonationSessionId: sessionRecord ? sessionRecord.id : sessionId || null,
          },
        },
      });
    }

    return res.json({ ok: true, sessionId: sessionId || null });
  } catch (error) {
    console.error('[ADMIN] POST /impersonate/stop error', error);
    return res.status(500).json({ error: 'Erro ao encerrar impersonate' });
  }
});

// GET /api/admin/logs
router.get('/logs', requireAdminPermission('logs.read'), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const search = req.query.search ? String(req.query.search).trim() : null;
    const level = normalizeLogLevel(req.query.level);
    const source = normalizeSource(req.query.source);
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : null;
    const since = parseDateParam(req.query.since);

    const where = {};

    if (search) {
      where.OR = [
        { message: { contains: search, mode: 'insensitive' } },
        { stack: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (level) where.level = level;
    if (source) where.source = source;
    if (tenantId) where.tenantId = tenantId;
    if (since) where.createdAt = { gte: since };

    const [total, logs] = await prisma.$transaction([
      prisma.systemLog.count({ where }),
      prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          tenant: { select: { id: true, name: true } },
        },
      }),
    ]);

    const serialized = logs.map((log) => ({
      id: log.id,
      level: log.level,
      source: log.source,
      message: log.message,
      stack: log.stack,
      tenantId: log.tenantId,
      tenantName: log.tenant ? log.tenant.name : null,
      metadata: log.metadata || null,
      createdAt: log.createdAt,
    }));

    return res.json({
      logs: serialized,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: pageSize ? Math.ceil(total / pageSize) : 0,
      },
      filters: {
        search: search || null,
        level: level || null,
        source: source || null,
        tenantId: tenantId || null,
        since: since ? since.toISOString() : null,
      },
    });
  } catch (error) {
    console.error('[ADMIN] GET /logs error', error);
    return res.status(500).json({ error: 'Erro ao listar logs' });
  }
});

// GET /api/admin/jobs
router.get('/jobs', requireAdminPermission('jobs.read'), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const queue = req.query.queue ? String(req.query.queue).trim() : null;
    const status = normalizeJobStatus(req.query.status) || 'FAILED';
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : null;
    const search = req.query.search ? String(req.query.search).trim() : null;
    const since = parseDateParam(req.query.since);

    const where = {};
    if (queue) where.queue = queue;
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;
    if (search) {
      where.error = { contains: search, mode: 'insensitive' };
    }
    if (since) where.createdAt = { gte: since };

    const [total, jobs] = await prisma.$transaction([
      prisma.jobLog.count({ where }),
      prisma.jobLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return res.json({
      jobs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: pageSize ? Math.ceil(total / pageSize) : 0,
      },
      filters: {
        queue: queue || null,
        status: status || null,
        tenantId: tenantId || null,
        search: search || null,
        since: since ? since.toISOString() : null,
      },
    });
  } catch (error) {
    console.error('[ADMIN] GET /jobs error', error);
    return res.status(500).json({ error: 'Erro ao listar jobs' });
  }
});

// GET /api/admin/observability/sync/summary
router.get('/observability/sync/summary', requireAdminPermission('jobs.read'), async (req, res) => {
  try {
    const summary = await syncObservabilityService.getSyncSummary({
      sinceHours: req.query.sinceHours,
      provider: req.query.provider,
      tenantId: req.query.tenantId,
      brandId: req.query.brandId,
      status: req.query.status,
      runType: req.query.runType,
      from: req.query.from,
      to: req.query.to,
    });

    return res.json({ summary });
  } catch (error) {
    console.error('[ADMIN] GET /observability/sync/summary error', error);
    return res.status(500).json({ error: 'Erro ao carregar resumo de sync' });
  }
});

// GET /api/admin/observability/sync/runs
router.get('/observability/sync/runs', requireAdminPermission('jobs.read'), async (req, res) => {
  try {
    const data = await syncObservabilityService.listSyncRuns({
      page: req.query.page,
      pageSize: req.query.pageSize,
      provider: req.query.provider,
      tenantId: req.query.tenantId,
      brandId: req.query.brandId,
      status: req.query.status,
      runType: req.query.runType,
      from: req.query.from,
      to: req.query.to,
      since: req.query.since,
      until: req.query.until,
    });
    return res.json(data);
  } catch (error) {
    console.error('[ADMIN] GET /observability/sync/runs error', error);
    return res.status(500).json({ error: 'Erro ao listar sync runs' });
  }
});

// GET /api/admin/observability/sync/runs/:id
router.get('/observability/sync/runs/:id', requireAdminPermission('jobs.read'), async (req, res) => {
  try {
    const data = await syncObservabilityService.getSyncRunDetail(req.params.id);
    if (!data) {
      return res.status(404).json({ error: 'Sync run não encontrado' });
    }
    return res.json(data);
  } catch (error) {
    console.error('[ADMIN] GET /observability/sync/runs/:id error', error);
    return res.status(500).json({ error: 'Erro ao carregar sync run' });
  }
});

// GET /api/admin/compliance/credentials
router.get('/compliance/credentials', requireAdminPermission('reports.read'), async (req, res) => {
  try {
    const report = await credentialsComplianceService.getCredentialsComplianceReport({
      tenantId: req.query.tenantId,
      sampleSize: req.query.sampleSize,
    });
    return res.json(report);
  } catch (error) {
    console.error('[ADMIN] GET /compliance/credentials error', error);
    return res.status(500).json({ error: 'Erro ao carregar compliance de credenciais' });
  }
});

// GET /api/admin/tenants/:id/notes
router.get('/tenants/:id/notes', requireAdminPermission('notes.read'), async (req, res) => {
  try {
    const { id } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    const notes = await prisma.tenantNote.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const serialized = notes.map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      severity: note.severity,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      author: note.author
        ? {
            id: note.author.id,
            name: note.author.name,
            email: note.author.email,
          }
        : null,
    }));

    return res.json({ tenant, notes: serialized });
  } catch (error) {
    console.error('[ADMIN] GET /tenants/:id/notes error', error);
    return res.status(500).json({ error: 'Erro ao listar notas' });
  }
});

// POST /api/admin/tenants/:id/notes
router.post('/tenants/:id/notes', requireAdminPermission('notes.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, body, severity } = req.body || {};

    if (!title || !body) {
      return res.status(400).json({ error: 'Título e descrição são obrigatórios' });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    const normalizedSeverity = normalizeSeverity(severity);

    const note = await prisma.tenantNote.create({
      data: {
        tenantId: tenant.id,
        title: title.toString().trim(),
        body: body.toString().trim(),
        severity: normalizedSeverity,
        authorId: req.user?.id || null,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: req.user?.id || null,
        action: 'TENANT_NOTE_CREATE',
        resource: 'tenant_note',
        resourceId: note.id,
        ip: req.ip || null,
        meta: {
          severity: normalizedSeverity,
          title: note.title,
        },
      },
    });

    return res.status(201).json({
      note: {
        id: note.id,
        title: note.title,
        body: note.body,
        severity: note.severity,
        createdAt: note.createdAt,
        author: note.author
          ? {
              id: note.author.id,
              name: note.author.name,
              email: note.author.email,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('[ADMIN] POST /tenants/:id/notes error', error);
    return res.status(500).json({ error: 'Erro ao criar nota' });
  }
});

// GET /api/admin/integrations
router.get('/integrations', requireAdminPermission('integrations.read'), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : null;
    const provider = req.query.provider ? String(req.query.provider) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const ownerType = req.query.ownerType ? String(req.query.ownerType) : null;
    const ownerKey = req.query.ownerKey ? String(req.query.ownerKey) : null;
    const clientId = req.query.clientId ? String(req.query.clientId) : null;

    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (provider) where.provider = provider;
    if (status) where.status = status;
    if (ownerType) where.ownerType = ownerType;
    if (ownerKey) where.ownerKey = ownerKey;
    if (clientId) where.clientId = clientId;

    const [total, items] = await Promise.all([
      prisma.integration.count({ where }),
      prisma.integration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return res.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: pageSize ? Math.ceil(total / pageSize) : 0,
      },
    });
  } catch (error) {
    console.error('[ADMIN] GET /integrations error', error);
    return res.status(500).json({ error: 'Erro ao listar integrações' });
  }
});

// PATCH /api/admin/integrations/:id
router.patch('/integrations/:id', requireAdminPermission('integrations.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, settings, config } = req.body || {};

    const updateData = {};
    if (status) updateData.status = status;
    if (settings !== undefined) updateData.settings = settings;
    if (config !== undefined) updateData.config = config;

    if (!Object.keys(updateData).length) {
      return res.status(400).json({ error: 'Nenhuma alteração enviada' });
    }

    const updated = await prisma.integration.update({
      where: { id },
      data: updateData,
    });

    return res.json({ integration: updated });
  } catch (error) {
    console.error('[ADMIN] PATCH /integrations/:id error', error);
    return res
      .status(error?.status || 500)
      .json({ error: error?.message || 'Erro ao atualizar integração' });
  }
});

// POST /api/admin/integrations/:id/disconnect
router.post('/integrations/:id/disconnect', requireAdminPermission('integrations.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await prisma.integration.update({
      where: { id },
      data: {
        status: 'DISCONNECTED',
        accessToken: null,
        refreshToken: null,
        accessTokenEncrypted: null,
      },
    });
    return res.json({ ok: true, integration: updated });
  } catch (error) {
    console.error('[ADMIN] POST /integrations/:id/disconnect error', error);
    return res.status(500).json({ error: 'Erro ao desconectar integração' });
  }
});

// GET /api/admin/billing/tenants
router.get('/billing/tenants', requireAdminPermission('billing.read'), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const status = normalizeStatus(req.query.status);
    const search = req.query.search ? String(req.query.search).trim() : null;

    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, tenants] = await prisma.$transaction([
      prisma.tenant.count({ where }),
      prisma.tenant.findMany({
        where,
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const tenantIds = tenants.map((tenant) => tenant.id);
    const subscriptions = await prisma.subscription.findMany({
      where: { tenantId: { in: tenantIds } },
      orderBy: [{ tenantId: 'asc' }, { createdAt: 'desc' }],
    });

    const subMap = {};
    subscriptions.forEach((sub) => {
      if (!subMap[sub.tenantId]) {
        subMap[sub.tenantId] = sub;
      }
    });

    return res.json({
      items: tenants.map((tenant) => ({
        ...serializeTenant(tenant, null, subMap[tenant.id]),
        subscription: subMap[tenant.id] || null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: pageSize ? Math.ceil(total / pageSize) : 0,
      },
    });
  } catch (error) {
    console.error('[ADMIN] GET /billing/tenants error', error);
    return res.status(500).json({ error: 'Erro ao listar billing dos tenants' });
  }
});

// POST /api/admin/billing/tenants/:id/sync
router.post('/billing/tenants/:id/sync', requireAdminPermission('billing.write'), async (req, res) => {
  try {
    if (!stripeService.isConfigured()) {
      return res.status(400).json({ error: 'Stripe não configurado' });
    }

    const { id } = req.params;
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });

    let subscription = await prisma.subscription.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'desc' },
    });

    let stripeSubscription = null;
    if (subscription?.externalSubscriptionId) {
      stripeSubscription = await stripeService.retrieveSubscription(subscription.externalSubscriptionId);
    } else if (tenant.billingCustomerId) {
      const data = await stripeService.listCustomerSubscriptions(tenant.billingCustomerId);
      stripeSubscription = data?.data?.[0] || null;
    }

    if (!stripeSubscription) {
      return res.status(404).json({ error: 'Subscription Stripe não encontrada' });
    }

    const nextStatus =
      stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing'
        ? 'SUCCEEDED'
        : 'FAILED';
    const periodStart = stripeSubscription.current_period_start
      ? new Date(stripeSubscription.current_period_start * 1000)
      : null;
    const periodEnd = stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000)
      : null;

    if (subscription) {
      subscription = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          externalSubscriptionId: stripeSubscription.id,
          status: nextStatus,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: !!stripeSubscription.cancel_at_period_end,
        },
      });
    } else {
      subscription = await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: tenant.planId,
          externalSubscriptionId: stripeSubscription.id,
          status: nextStatus,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: !!stripeSubscription.cancel_at_period_end,
        },
      });
    }

    return res.json({
      ok: true,
      subscription,
      stripe: {
        id: stripeSubscription.id,
        status: stripeSubscription.status,
      },
    });
  } catch (error) {
    console.error('[ADMIN] POST /billing/tenants/:id/sync error', error);
    return res.status(500).json({ error: 'Erro ao sincronizar Stripe' });
  }
});

// POST /api/admin/billing/subscriptions/:id/cancel
router.post('/billing/subscriptions/:id/cancel', requireAdminPermission('billing.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { cancelAtPeriodEnd = true } = req.body || {};
    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription) return res.status(404).json({ error: 'Subscription não encontrada' });

    if (stripeService.isConfigured() && subscription.externalSubscriptionId) {
      await stripeService.cancelSubscription(subscription.externalSubscriptionId, {
        cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
      });
    }

    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
        status: cancelAtPeriodEnd ? subscription.status : 'FAILED',
      },
    });

    return res.json({ ok: true, subscription: updated });
  } catch (error) {
    console.error('[ADMIN] POST /billing/subscriptions/:id/cancel error', error);
    return res.status(500).json({ error: 'Erro ao cancelar subscription' });
  }
});

// GET /api/admin/data/tables
router.get('/data/tables', requireAdminPermission('data.query'), async (req, res) => {
  try {
    if (process.env.ADMIN_SQL_ENABLED !== 'true') {
      return res.status(403).json({ error: 'SQL admin desabilitado' });
    }

    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name ASC
    `);

    return res.json({ items: tables });
  } catch (error) {
    console.error('[ADMIN] GET /data/tables error', error);
    return res.status(500).json({ error: 'Erro ao listar tabelas' });
  }
});

// POST /api/admin/data/query
router.post('/data/query', requireAdminPermission('data.query'), async (req, res) => {
  try {
    if (process.env.ADMIN_SQL_ENABLED !== 'true') {
      return res.status(403).json({ error: 'SQL admin desabilitado' });
    }

    const { sql } = req.body || {};
    const trimmed = String(sql || '').trim();
    const lower = trimmed.toLowerCase();
    if (!trimmed) {
      return res.status(400).json({ error: 'SQL é obrigatório' });
    }
    if (!(lower.startsWith('select') || lower.startsWith('with'))) {
      return res.status(400).json({ error: 'Apenas SELECT/WITH são permitidos nesta rota' });
    }

    const result = await prisma.$queryRawUnsafe(trimmed);

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user?.id || null,
        action: 'ADMIN_SQL_QUERY',
        resource: 'sql',
        ip: req.ip || null,
        meta: {
          sql: trimmed.slice(0, 1000),
        },
      },
    });

    return res.json({ ok: true, rows: result });
  } catch (error) {
    console.error('[ADMIN] POST /data/query error', error);
    return res.status(500).json({ error: 'Erro ao executar query' });
  }
});

// POST /api/admin/data/execute
router.post('/data/execute', requireAdminPermission('data.write'), async (req, res) => {
  try {
    if (process.env.ADMIN_SQL_ENABLED !== 'true') {
      return res.status(403).json({ error: 'SQL admin desabilitado' });
    }

    const { sql, confirm } = req.body || {};
    const trimmed = String(sql || '').trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'SQL é obrigatório' });
    }
    if (confirm !== true) {
      return res.status(400).json({ error: 'Confirmação explícita necessária' });
    }

    const result = await prisma.$executeRawUnsafe(trimmed);

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user?.id || null,
        action: 'ADMIN_SQL_EXECUTE',
        resource: 'sql',
        ip: req.ip || null,
        meta: {
          sql: trimmed.slice(0, 1000),
          affectedRows: result,
        },
      },
    });

    return res.json({ ok: true, affectedRows: result });
  } catch (error) {
    console.error('[ADMIN] POST /data/execute error', error);
    return res.status(500).json({ error: 'Erro ao executar SQL' });
  }
});

module.exports = router;
