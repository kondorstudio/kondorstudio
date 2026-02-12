const { prisma } = require('../prisma');
const { hashToken, comparePassword } = require('../utils/hash');
const emailService = require('./emailService');

const CODE_TTL_MINUTES = Number(process.env.MFA_CODE_TTL_MINUTES || 10);
const MAX_ATTEMPTS = Number(process.env.MFA_MAX_ATTEMPTS || 5);
const ADMIN_MFA_ENABLED = process.env.ADMIN_MFA_ENABLED !== 'false';
const ALWAYS_MFA_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const ADMIN_ROLE_SET = new Set(['SUPPORT', 'FINANCE', 'TECH']);
const MFA_FAIL_OPEN_WHEN_EMAIL_UNAVAILABLE =
  process.env.MFA_FAIL_OPEN_WHEN_EMAIL_UNAVAILABLE !== 'false';

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function computeExpiry() {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + CODE_TTL_MINUTES);
  return expires;
}

function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

function shouldRequireMfa(user) {
  if (!user) return false;
  const role = normalizeRole(user.role);
  let requiresMfa = false;

  if (ALWAYS_MFA_ROLES.has(role)) {
    requiresMfa = true;
  } else if (ADMIN_MFA_ENABLED && ADMIN_ROLE_SET.has(role)) {
    requiresMfa = true;
  } else if (user.mfaEnabled) {
    requiresMfa = true;
  }

  if (requiresMfa && !emailService.isConfigured()) {
    if (MFA_FAIL_OPEN_WHEN_EMAIL_UNAVAILABLE) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn(
          '[mfaService] MFA exigido, mas provedor de email indisponível. Liberando login sem MFA (fail-open).',
          {
            userId: user.id,
            role,
          },
        );
      }
      return false;
    }
  }

  return requiresMfa;
}

async function createChallenge(user, { purpose = 'admin_login', ip = null, userAgent = null } = {}) {
  if (!user || !user.id) {
    throw new Error('Usuário inválido para MFA');
  }

  const code = generateCode();
  const codeHash = await hashToken(code);
  const expiresAt = computeExpiry();

  const challenge = await prisma.mfaChallenge.create({
    data: {
      userId: user.id,
      purpose,
      codeHash,
      expiresAt,
      ip,
      userAgent,
    },
  });

  const email = user.email;
  if (email) {
    const subject = 'Seu código de acesso (Kondor Control Center)';
    const text = [
      'Seu código de acesso:',
      code,
      '',
      `Este código expira em ${CODE_TTL_MINUTES} minutos.`,
    ].join('\n');
    await emailService.sendEmail({ to: email, subject, text });
  }

  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    maskedEmail: emailService.maskEmail(user.email),
  };
}

async function verifyChallenge(challengeId, code) {
  if (!challengeId || !code) {
    return { ok: false, error: 'Código inválido' };
  }

  const challenge = await prisma.mfaChallenge.findUnique({
    where: { id: challengeId },
    include: { user: true },
  });

  if (!challenge) {
    return { ok: false, error: 'Desafio MFA não encontrado' };
  }

  if (challenge.usedAt) {
    return { ok: false, error: 'Código já utilizado' };
  }

  if (challenge.expiresAt && new Date(challenge.expiresAt) < new Date()) {
    return { ok: false, error: 'Código expirado' };
  }

  if ((challenge.attempts || 0) >= MAX_ATTEMPTS) {
    return { ok: false, error: 'Número máximo de tentativas excedido' };
  }

  const matches = await comparePassword(code, challenge.codeHash);
  if (!matches) {
    await prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: {
        attempts: { increment: 1 },
      },
    });
    return { ok: false, error: 'Código inválido' };
  }

  await prisma.mfaChallenge.update({
    where: { id: challenge.id },
    data: {
      usedAt: new Date(),
    },
  });

  return { ok: true, user: challenge.user };
}

module.exports = {
  createChallenge,
  verifyChallenge,
  shouldRequireMfa,
};
