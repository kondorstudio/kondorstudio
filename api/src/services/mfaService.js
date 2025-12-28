const { prisma } = require('../prisma');
const { hashToken, comparePassword } = require('../utils/hash');
const emailService = require('./emailService');

const CODE_TTL_MINUTES = Number(process.env.MFA_CODE_TTL_MINUTES || 10);
const MAX_ATTEMPTS = Number(process.env.MFA_MAX_ATTEMPTS || 5);

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function computeExpiry() {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + CODE_TTL_MINUTES);
  return expires;
}

function shouldRequireMfa(user) {
  if (!user) return false;
  const role = String(user.role || '').toUpperCase();
  const adminRoles = new Set(['SUPER_ADMIN', 'SUPPORT', 'FINANCE', 'TECH']);
  if (!adminRoles.has(role)) return false;
  return user.mfaEnabled === true || role === 'SUPER_ADMIN';
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
