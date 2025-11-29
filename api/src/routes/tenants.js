const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma');
const { hashPassword, hashToken } = require('../utils/hash');
const { signAccessToken, signRefreshToken } = require('../utils/jwt');

/**
 * POST /tenants/register
 * Rota pública para criar nova conta (tenant + usuário admin)
 */
router.post('/register', async (req, res) => {
  const { tenantName, tenantSlug, userName, userEmail, password } = req.body;

  if (!tenantName || !tenantSlug || !userEmail || !password) {
    return res.status(400).json({ error: 'missing fields' });
  }

  try {
    // Criar tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: tenantName,
        slug: tenantSlug,
        agencyName: tenantName,
      }
    });

    // Criar usuário admin
    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: userEmail,
        password: hashed,
        name: userName,
        tenantId: tenant.id,
        role: 'ADMIN'
      }
    });

    // Gerar tokens
    const payload = { sub: user.id, tenantId: tenant.id };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // Salvar refresh token
    const decodedRefresh = require('jsonwebtoken').decode(refreshToken);
    const expiresAt = new Date(decodedRefresh.exp * 1000);

    const refreshHash = await hashToken(refreshToken);
    await prisma.refreshToken.create({
      data: {
        tokenHash: refreshHash,
        userId: user.id,
        expiresAt
      }
    });

    return res.json({
      accessToken,
      refreshToken,
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error('POST /tenants/register error', err);
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'slug or email already exists' });
    }
    return res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;