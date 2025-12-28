const AWS = require('aws-sdk');

function isConfigured() {
  return Boolean(process.env.SES_REGION && process.env.SES_SOURCE_EMAIL);
}

function buildClient() {
  const region = process.env.SES_REGION;
  if (!region) return null;
  return new AWS.SES({ region });
}

function maskEmail(email) {
  if (!email) return null;
  const [user, domain] = String(email).split('@');
  if (!domain) return email;
  const prefix = user.slice(0, 2);
  return `${prefix}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

async function sendEmail({ to, subject, text, html }) {
  if (!to || !subject || (!text && !html)) {
    throw new Error('email payload inválido');
  }

  if (!isConfigured()) {
    // fallback: apenas loga em dev
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[emailService] SES não configurado. Email omitido.', {
        to,
        subject,
      });
    }
    return { ok: false, skipped: true };
  }

  const client = buildClient();
  if (!client) {
    return { ok: false, skipped: true };
  }

  const params = {
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Body: {
        ...(text ? { Text: { Charset: 'UTF-8', Data: text } } : {}),
        ...(html ? { Html: { Charset: 'UTF-8', Data: html } } : {}),
      },
      Subject: { Charset: 'UTF-8', Data: subject },
    },
    Source: process.env.SES_SOURCE_EMAIL,
  };

  const result = await client.sendEmail(params).promise();
  return { ok: true, result };
}

module.exports = {
  sendEmail,
  maskEmail,
  isConfigured,
};
