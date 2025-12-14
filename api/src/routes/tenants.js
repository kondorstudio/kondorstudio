const express = require('express');
const router = express.Router();
const { prisma } = require('../prisma');
const { hashPassword, hashToken } = require('../utils/hash');
const {
  createAccessToken,
  createRefreshToken,
  REFRESH_TOKEN_EXPIRES_IN,
} = require('../utils/jwt');

function computeExpiryDateFromString(expiresIn) {
  try {
    const lower = String(expiresIn || '').toLowerCase().trim();
    if (!lower) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d;
    }

    if (lower.endsWith('d')) {
      const days = parseInt(lower.slice(0, -1), 10);
      const d = new Date();
      d.setDate(d.getDate() + (Number.isFinite(days) ? days : 30));
      return d;
    }
    if (lower.endsWith('h')) {
      const hours = parseInt(lower.slice(0, -1), 10);
      const d = new Date();
      d.setHours(d.getHours() + (Number.isFinite(hours) ? hours : 24));
      return d;
    }
    if (lower.endsWith('m')) {
      const mins = parseInt(lower.slice(0, -1), 10);
      const d = new Date();
      d.setMinutes(d.getMinutes() + (Number.isFinite(mins) ? mins : 60));
      return d;
    }
  } catch (err) {}

  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

/**
 * POST /tenants/register
 * Cria nova conta (tenant + admin + trial).
 */
router.post('/register', async (req, res) => {
  const { tenantName, tenantSlug, userName, userEmail, password } = req.body;

  if (!tenantName || !tenantSlug || !userEmail || !password) {
    return res.status(400).json({ error: 'missing fields' });
  }

  try {
    const [existingTenant, existingUser] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: tenantSlug } }),
      // email não é unique no schema → usar findFirst
      prisma.user.findFirst({ where: { email: userEmail } }),
    ]);

    if (existingTenant || existingUser) {
      return res.status(409).json({ error: 'slug or email already exists' });
    }

    const tenant = await prisma.tenant.create({
      data: {
        name: tenantName,
        slug: tenantSlug,
        settings: {
          agency_name: tenantName,
          primary_color: '#A78BFA',
          accent_color: '#39FF14',
          logo_url: null,
        },
      },
    });

    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: hashed,
        name: userName,
        tenantId: tenant.id,
        role: 'ADMIN',
      },
    });

    const now = new Date();
    let plan = await prisma.plan.findFirst({
      where: { key: 'starter_monthly', active: true },
    });

    if (!plan) {
      plan = await prisma.plan.findFirst({ where: { active: true } });
    }

    let subscription = null;

    if (plan) {
      const periodEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      subscription = await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'SUCCEEDED',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { planId: plan.id },
      });
    }

    const payload = { sub: user.id, tenantId: tenant.id };
    const accessToken = createAccessToken(payload);
    const refreshToken = createRefreshToken();
    const expiresAt = computeExpiryDateFromString(REFRESH_TOKEN_EXPIRES_IN);

    const refreshHash = await hashToken(refreshToken);
    const refreshRecord = await prisma.refreshToken.create({
      data: {
        tokenHash: refreshHash,
        userId: user.id,
        tenantId: tenant.id,
        expiresAt,
      },
    });

    return res.json({
      accessToken,
      refreshToken,
      tokenId: refreshRecord.id,
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      user: { id: user.id, email: user.email, name: user.name },
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
    });
  } catch (err) {
    console.error('POST /tenants/register error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * GET /tenants
 * Retorna tenant atual.
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.tenant && req.tenant.id);
    if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado' });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });

    if (!tenant) return res.json([]);

    const settings = tenant.settings || {};
    const planName = tenant.plan?.name?.toLowerCase() || null;

    return res.json([{
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      agency_name: settings.agency_name || tenant.name,
      primary_color: settings.primary_color || '#A78BFA',
      accent_color: settings.accent_color || '#39FF14',
      logo_url: settings.logo_url || null,
      plan: planName,
    }]);
  } catch (err) {
    console.error('GET /tenants error', err);
    return res.status(500).json({ error: 'Erro ao carregar tenant' });
  }
});

/**
 * PUT /tenants/current
 * Atualiza as configurações do tenant atual sem usar o ID na URL
 */
router.put('/current', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.tenant && req.tenant.id);
    if (!tenantId) return res.status(401).json({ error: 'Tenant não identificado' });

    const { agency_name, primary_color, accent_color, logo_url } = req.body || {};

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });

    const currentSettings = tenant.settings || {};
    const newSettings = {
      ...currentSettings,
      agency_name: agency_name ?? currentSettings.agency_name ?? tenant.name,
      primary_color: primary_color ?? currentSettings.primary_color ?? '#A78BFA',
      accent_color: accent_color ?? currentSettings.accent_color ?? '#39FF14',
      logo_url: logo_url ?? currentSettings.logo_url ?? null,
    };

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: agency_name || tenant.name,
        settings: newSettings,
      },
      include: { plan: true },
    });

    const planName = updated.plan?.name?.toLowerCase() || null;

    return res.json({
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      agency_name: newSettings.agency_name,
      primary_color: newSettings.primary_color,
      accent_color: newSettings.accent_color,
      logo_url: newSettings.logo_url,
      plan: planName,
    });
  } catch (err) {
    console.error('PUT /tenants/current error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar tenant' });
  }
});

module.exports = router;
