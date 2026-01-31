const express = require('express');
const router = express.Router();

const { prisma } = require('../prisma');
const { hashPassword, comparePassword } = require('../utils/hash');
const {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  REFRESH_TOKEN_EXPIRES_IN,
} = require('../utils/jwt');
const {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_ID_COOKIE,
  CLIENT_ACCESS_COOKIE,
  parseCookies,
  getCookieOptions,
  getClientCookieOptions,
} = require('../utils/authCookies');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { loginSchema, clientLoginSchema } = require('../validators/authValidator');
const mfaService = require('../services/mfaService');

/**
 * Helper: parse expires strings like "30d", "7d", "24h" into a Date
 * Falls back to 30d if invalid.
 */
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

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res
      .status(429)
      .json({ error: 'Muitas tentativas de login. Tente novamente mais tarde.' });
  },
});

async function issueAuthTokens({ user, req }) {
  const payload = {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId,
  };

  const accessToken = createAccessToken(payload);
  const rawRefreshToken = createRefreshToken();
  const hashed = await hashPassword(rawRefreshToken);
  const expiresAt = computeExpiryDateFromString(REFRESH_TOKEN_EXPIRES_IN);

  const tokenRecord = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashed,
      revoked: false,
      expiresAt,
      deviceName: req.body?.deviceName || null,
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null,
      tenantId: user.tenantId || null,
    },
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    tokenId: tokenRecord.id,
    expiresAt: expiresAt.toISOString(),
  };
}

function computeAccessExpiryDate() {
  return computeExpiryDateFromString(process.env.JWT_EXPIRES_IN || '7d');
}

function setAuthCookies(res, { accessToken, refreshToken, tokenId }) {
  if (!res) return;
  const accessExpiresAt = computeAccessExpiryDate();
  const refreshExpiresAt = computeExpiryDateFromString(REFRESH_TOKEN_EXPIRES_IN);

  res.cookie(ACCESS_COOKIE, accessToken, getCookieOptions({ expires: accessExpiresAt }));
  res.cookie(REFRESH_COOKIE, refreshToken, getCookieOptions({ expires: refreshExpiresAt }));
  res.cookie(REFRESH_ID_COOKIE, tokenId, getCookieOptions({ expires: refreshExpiresAt }));
}

function clearAuthCookies(res) {
  if (!res) return;
  const opts = getCookieOptions();
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
  res.clearCookie(REFRESH_ID_COOKIE, opts);
}

function setClientAuthCookie(res, accessToken) {
  if (!res) return;
  const accessExpiresAt = computeAccessExpiryDate();
  res.cookie(
    CLIENT_ACCESS_COOKIE,
    accessToken,
    getClientCookieOptions({ expires: accessExpiresAt }),
  );
}

function clearClientAuthCookie(res) {
  if (!res) return;
  res.clearCookie(CLIENT_ACCESS_COOKIE, getClientCookieOptions());
}

/**
 * POST /auth/login
 */
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const parseResult = loginSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      const details = parseResult.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({ error: 'Dados inválidos', details });
    }

    const { email, password, deviceName } = parseResult.data;

    const user = await prisma.user.findFirst({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        role: true,
        tenantId: true,
        isActive: true,
        mfaEnabled: true,
      },
    });

    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (!user.isActive) return res.status(403).json({ error: 'Usuário inativo' });

    const passwordOk = await comparePassword(password, user.passwordHash);
    if (!passwordOk) return res.status(401).json({ error: 'Credenciais inválidas' });

    if (mfaService.shouldRequireMfa(user)) {
      const challenge = await mfaService.createChallenge(user, {
        purpose: 'admin_login',
        ip: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });
      return res.json({
        mfaRequired: true,
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
        maskedEmail: challenge.maskedEmail,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        },
      });
    }

    const tokens = await issueAuthTokens({ user, req });
    setAuthCookies(res, tokens);

    return res.json({
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (err) {
    console.error('POST /auth/login error', err);
    return res.status(500).json({ error: 'Erro interno no login' });
  }
});

/**
 * POST /auth/client-login
 */
router.post('/client-login', loginRateLimiter, async (req, res) => {
  try {
    const parseResult = clientLoginSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      const details = parseResult.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({ error: 'Dados inválidos', details });
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = (email || '').trim().toLowerCase();

    const whereClause = {
      OR: [
        {
          email: {
            equals: normalizedEmail,
            mode: 'insensitive',
          },
        },
        {
          portalEmail: {
            equals: normalizedEmail,
            mode: 'insensitive',
          },
        },
      ],
    };

    const matches = await prisma.client.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        portalEmail: true,
        metadata: true,
        portalPasswordHash: true,
        tenant: {
          select: { id: true, slug: true, name: true },
        },
      },
    });

    if (!matches.length) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const client = matches[0];

    let metadata = client.metadata || {};
    const columnHash = client.portalPasswordHash || null;
    const metadataHash = metadata.portalPasswordHash || null;
    let hashToUse = columnHash || metadataHash || null;

    if (!hashToUse) {
      const newHash = await hashPassword(password);
      const sanitizedMetadata = { ...metadata };
      if (sanitizedMetadata.portalPasswordHash) {
        delete sanitizedMetadata.portalPasswordHash;
      }
      await prisma.client.update({
        where: { id: client.id },
        data: {
          portalPasswordHash: newHash,
          metadata: sanitizedMetadata,
        },
      });
      metadata = sanitizedMetadata;
      hashToUse = newHash;
    } else {
      if (!columnHash && metadataHash) {
        const sanitizedMetadata = { ...metadata };
        delete sanitizedMetadata.portalPasswordHash;
        await prisma.client.update({
          where: { id: client.id },
          data: {
            portalPasswordHash: metadataHash,
            metadata: sanitizedMetadata,
          },
        });
        metadata = sanitizedMetadata;
        hashToUse = metadataHash;
      }

      const ok = await comparePassword(password, hashToUse);
      if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const payload = {
      type: 'client',
      clientId: client.id,
      tenantId: client.tenantId,
    };

    const accessToken = createAccessToken(payload);
    setClientAuthCookie(res, accessToken);

    return res.json({
      accessToken,
      client: {
        id: client.id,
        name: client.name,
        email: client.portalEmail || client.email,
        tenantId: client.tenantId,
        tenant: client.tenant
          ? {
              id: client.tenant.id,
              slug: client.tenant.slug,
              name: client.tenant.name,
            }
          : null,
      },
    });
  } catch (err) {
    console.error('POST /auth/client-login error', err);
    return res.status(500).json({ error: 'Erro interno no login do cliente' });
  }
});

/**
 * POST /auth/mfa/verify
 * Body: { challengeId, code }
 */
router.post('/mfa/verify', async (req, res) => {
  try {
    const { challengeId, code } = req.body || {};
    const result = await mfaService.verifyChallenge(challengeId, code);
    if (!result.ok) {
      return res.status(401).json({ error: result.error || 'Código inválido' });
    }

    const user = result.user;
    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'Usuário inativo' });
    }

    const tokens = await issueAuthTokens({ user, req });
    setAuthCookies(res, tokens);

    return res.json({
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (err) {
    console.error('POST /auth/mfa/verify error', err);
    return res.status(500).json({ error: 'Erro interno ao validar MFA' });
  }
});

/**
 * POST /auth/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const cookies = parseCookies(req);
    const tokenId = req.body?.tokenId || cookies[REFRESH_ID_COOKIE];
    const refreshToken = req.body?.refreshToken || cookies[REFRESH_COOKIE];

    if (!tokenId || !refreshToken) {
      return res.status(400).json({ error: 'tokenId e refreshToken são obrigatórios' });
    }

    const record = await prisma.refreshToken.findUnique({
      where: { id: tokenId },
      include: { user: true },
    });

    if (!record) return res.status(401).json({ error: 'Refresh token inválido' });
    if (record.revoked) return res.status(401).json({ error: 'Refresh token revogado' });
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      return res.status(401).json({ error: 'Refresh token expirado' });
    }

    const isValid = await comparePassword(refreshToken, record.tokenHash);
    if (!isValid) {
      await prisma.refreshToken.update({
        where: { id: record.id },
        data: { revoked: true },
      });
      return res.status(401).json({ error: 'Refresh token inválido' });
    }

    const user = record.user;
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { revoked: true },
    });

    const newRawRefresh = createRefreshToken();
    const newHashed = await hashPassword(newRawRefresh);
    const newExpiresAt = computeExpiryDateFromString(REFRESH_TOKEN_EXPIRES_IN);

    const newRecord = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: newHashed,
        revoked: false,
        expiresAt: newExpiresAt,
        deviceName: record.deviceName || null,
        ip: req.ip || req.headers['x-forwarded-for'] || null,
        userAgent: req.headers['user-agent'] || null,
        tenantId: user.tenantId || null,
      },
    });

    const payload = {
      userId: user.id,
      role: user.role,
      tenantId: user.tenantId,
    };

    const accessToken = createAccessToken(payload);

    const responsePayload = {
      accessToken,
      refreshToken: newRawRefresh,
      tokenId: newRecord.id,
      expiresAt: newExpiresAt.toISOString(),
    };

    setAuthCookies(res, responsePayload);

    return res.json(responsePayload);
  } catch (err) {
    console.error('POST /auth/refresh error', err);
    return res.status(500).json({ error: 'Erro interno no refresh' });
  }
});

/**
 * POST /auth/client-logout
 */
router.post('/client-logout', async (_req, res) => {
  try {
    clearClientAuthCookie(res);
    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /auth/client-logout error', err);
    return res.status(500).json({ error: 'Erro interno no logout do cliente' });
  }
});

/**
 * POST /auth/logout
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { tokenId, revokeAll } = req.body || {};
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Usuário não autenticado' });

    if (revokeAll) {
      await prisma.refreshToken.updateMany({
        where: { userId },
        data: { revoked: true },
      });
      clearAuthCookies(res);
      clearClientAuthCookie(res);
      return res.json({ ok: true, revokedAll: true });
    }

    if (tokenId) {
      await prisma.refreshToken.updateMany({
        where: { id: tokenId, userId },
        data: { revoked: true },
      });
      clearAuthCookies(res);
      clearClientAuthCookie(res);
      return res.json({ ok: true, tokenId });
    }

    clearAuthCookies(res);
    clearClientAuthCookie(res);
    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /auth/logout error', err);
    return res.status(500).json({ error: 'Erro interno no logout' });
  }
});

/**
 * GET /auth/me
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    return res.json({ user });
  } catch (err) {
    console.error('GET /auth/me error', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
