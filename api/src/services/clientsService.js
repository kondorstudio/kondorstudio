// api/src/services/clientsService.js
// Service responsável por operações CRUD e utilitárias sobre clients (escopadas por tenant)

const crypto = require('crypto');
const { prisma } = require('../prisma');
const financialRecordsService = require('./financialRecordsService');
const { hashPassword } = require('../utils/hash');

function sanitizeString(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function createClientValidationError(message, code = 'VALIDATION_ERROR') {
  const err = new Error(message);
  err.code = code;
  err.statusCode = 400;
  return err;
}

function normalizeHandle(value) {
  const sanitized = sanitizeString(value);
  if (!sanitized) return null;
  return sanitized.replace(/^@/, '');
}

function toE164(value) {
  const normalized = sanitizeString(value);
  if (!normalized) return null;
  return /^\+\d{8,15}$/.test(normalized) ? normalized : null;
}

function parseTags(input) {
  if (!input && input !== '') return [];
  if (Array.isArray(input)) {
    return input
      .map((tag) => sanitizeString(tag))
      .filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((tag) => sanitizeString(tag))
      .filter(Boolean);
  }
  return [];
}

function toIntCents(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed * 100);
  }
  return null;
}

function parseDateInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function generateTempPassword() {
  return crypto.randomBytes(4).toString('hex');
}

function cleanMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const clone = { ...metadata };
  if (clone.portalPasswordHash) {
    delete clone.portalPasswordHash;
  }
  return Object.keys(clone).length ? clone : null;
}

function sanitizeClient(client, extra = {}) {
  if (!client) return null;
  const { portalPasswordHash, ...rest } = client;
  const formatted = {
    ...rest,
    metadata: cleanMetadata(rest.metadata),
  };
  if (!formatted.tags) formatted.tags = [];
  if (formatted.logoUrl && !formatted.logo_url) {
    formatted.logo_url = formatted.logoUrl;
  }
  return { ...formatted, ...extra };
}

function buildPreparedInput(data = {}, { defaultPortalEmail } = {}) {
  const prepared = {
    name: sanitizeString(data.name),
    email: sanitizeString(data.email),
    phone: sanitizeString(data.phone),
    company: sanitizeString(data.company),
    sector: sanitizeString(data.sector),
    briefing: sanitizeString(data.briefing || data.brief),
    website: sanitizeString(data.website),
    instagram: normalizeHandle(data.instagram),
    facebook: normalizeHandle(data.facebook),
    tiktok: normalizeHandle(data.tiktok),
    notes: sanitizeString(data.notes),
    logoUrl: sanitizeString(data.logoUrl || data.logo_url),
    billingContactName: sanitizeString(
      data.billingContactName || data.billing_contact_name
    ),
    billingContactEmail: sanitizeString(
      data.billingContactEmail || data.billing_contact_email
    ),
    whatsappOptIn: data.whatsappOptIn === true,
    whatsappNumberE164: toE164(
      data.whatsappNumberE164 || data.whatsapp_number_e164 || data.phoneE164
    ),
  };

  const tagsInput = data.tags ?? data.tagsInput;
  const tags = parseTags(tagsInput);

  const monthlyFeeSource =
    data.monthlyFeeCents ??
    data.monthlyFee ??
    data.retainerValue ??
    data.valorMensal ??
    data.valor_mensal;

  const renewalSource =
    data.renewalDate ??
    data.renewal_date ??
    data.contractRenewal ??
    data.renovacao;

  const explicitPortalEmail =
    data.portalEmail !== undefined || data.portal_email !== undefined;

  const portalEmail = explicitPortalEmail
    ? sanitizeString(data.portalEmail ?? data.portal_email)
    : sanitizeString(data.email ?? defaultPortalEmail ?? null);

  const metadata =
    data.metadata && typeof data.metadata === 'object' ? data.metadata : undefined;

  return {
    prepared,
    tags,
    monthlyFeeCents: toIntCents(monthlyFeeSource),
    monthlyFeeProvided:
      monthlyFeeSource !== undefined &&
      monthlyFeeSource !== null &&
      monthlyFeeSource !== '',
    renewalDate: parseDateInput(renewalSource),
    renewalProvided: renewalSource !== undefined,
    metadata,
    portalEmail,
    explicitPortalEmail,
  };
}

async function resolvePortalCredentials({
  explicitPortalEmail,
  portalEmail,
  providedPassword,
  existing,
  reset,
  forcePersistEmail = false,
}) {
  const currentEmail = existing ? existing.portalEmail : null;
  const baseEmail =
    explicitPortalEmail || forcePersistEmail
      ? portalEmail
      : currentEmail || portalEmail || null;

  if (!baseEmail) {
    if (explicitPortalEmail || forcePersistEmail) {
      return {
        email: null,
        hash: null,
        plain: null,
        persistEmail: true,
        changed: !!(existing && existing.portalPasswordHash),
      };
    }
    return {
      email: currentEmail,
      hash: existing?.portalPasswordHash || null,
      plain: null,
      persistEmail: false,
      changed: false,
    };
  }

  let shouldReset = !existing || !existing.portalPasswordHash;

  if (providedPassword) shouldReset = true;
  if (reset) shouldReset = true;
  if (explicitPortalEmail && existing && baseEmail !== existing.portalEmail) {
    shouldReset = true;
  }

  let plain = null;
  if (providedPassword) {
    plain = providedPassword;
  } else if (shouldReset) {
    plain = generateTempPassword();
  }

  if (plain) {
    const hash = await hashPassword(plain);
    return {
      email: baseEmail,
      hash,
      plain,
      persistEmail: true,
      changed: true,
    };
  }

  return {
    email: baseEmail,
    hash: existing?.portalPasswordHash || null,
    plain: null,
    persistEmail: explicitPortalEmail,
    changed: false,
  };
}

async function recordMonthlyRevenue(tenantId, clientId, amountCents, renewalDate, note) {
  if (!amountCents || amountCents <= 0) return;
  try {
    await financialRecordsService.create(tenantId, {
      clientId,
      type: 'CLIENT_RECURRING',
      amountCents,
      note: note || 'Receita recorrente automática',
      occurredAt: renewalDate || new Date(),
    });
  } catch (err) {
    console.error('recordMonthlyRevenue error:', err?.message || err);
  }
}

async function getRawClient(tenantId, id) {
  if (!id) return null;
  return prisma.client.findFirst({
    where: { id, tenantId },
  });
}

module.exports = {
  /**
   * Lista clientes do tenant com opções de paginação e filtros básicos.
   */
  async list(tenantId, opts = {}) {
    const { q, page = 1, perPage = 50, tags } = opts;
    const where = { tenantId };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (tags && Array.isArray(tags) && tags.length) {
      where.tags = { hasSome: tags };
    }

    const skip = (Math.max(1, page) - 1) * perPage;
    const take = perPage;

    const [items, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.client.count({ where }),
    ]);

    return {
      items: items.map((item) => sanitizeClient(item)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  },

  /**
   * Cria um novo client no tenant.
   */
  async create(tenantId, data = {}) {
    const prepared = buildPreparedInput(data);
    if (!prepared.prepared.name) {
      throw createClientValidationError('Nome do cliente é obrigatório', 'NAME_REQUIRED');
    }
    if (!prepared.prepared.whatsappNumberE164) {
      throw createClientValidationError(
        'WhatsApp do cliente obrigatório em formato E.164 (+5511999999999)',
        'INVALID_WHATSAPP_NUMBER',
      );
    }

    const portalCreds = await resolvePortalCredentials({
      explicitPortalEmail: prepared.explicitPortalEmail,
      portalEmail: prepared.portalEmail,
      providedPassword: data.portalPassword,
      forcePersistEmail: Boolean(prepared.portalEmail),
    });

    const payload = {
      tenantId,
      name: prepared.prepared.name,
      email: prepared.prepared.email,
      phone: prepared.prepared.phone,
      company: prepared.prepared.company,
      sector: prepared.prepared.sector,
      briefing: prepared.prepared.briefing,
      website: prepared.prepared.website,
      instagram: prepared.prepared.instagram,
      facebook: prepared.prepared.facebook,
      tiktok: prepared.prepared.tiktok,
      notes: prepared.prepared.notes,
      logoUrl: prepared.prepared.logoUrl,
      billingContactName: prepared.prepared.billingContactName,
      billingContactEmail: prepared.prepared.billingContactEmail,
      whatsappOptIn: prepared.prepared.whatsappOptIn,
      whatsappNumberE164: prepared.prepared.whatsappNumberE164,
      metadata: prepared.metadata || null,
      tags: prepared.tags,
      monthlyFeeCents: prepared.monthlyFeeCents,
      renewalDate: prepared.renewalDate,
      portalEmail: portalCreds.persistEmail ? portalCreds.email : null,
      portalPasswordHash: portalCreds.hash,
    };

    const created = await prisma.client.create({ data: payload });

    if (prepared.monthlyFeeCents && prepared.monthlyFeeCents > 0) {
      await recordMonthlyRevenue(
        tenantId,
        created.id,
        prepared.monthlyFeeCents,
        prepared.renewalDate,
        `Receita recorrente - ${created.name}`
      );
    }

    const extra =
      portalCreds.plain && portalCreds.email
        ? { portalCredentials: { email: portalCreds.email, password: portalCreds.plain } }
        : {};

    return sanitizeClient(created, extra);
  },

  /**
   * Busca client por id (dentro do tenant)
   */
  async getById(tenantId, id) {
    const client = await getRawClient(tenantId, id);
    return sanitizeClient(client);
  },

  /**
   * Atualiza client. Retorna o client atualizado ou null se não existir.
   */
  async update(tenantId, id, data = {}) {
    const existing = await getRawClient(tenantId, id);
    if (!existing) return null;

    const prepared = buildPreparedInput(data, { defaultPortalEmail: existing.email });

    const portalCreds = await resolvePortalCredentials({
      explicitPortalEmail: prepared.explicitPortalEmail,
      portalEmail: prepared.portalEmail,
      providedPassword: data.portalPassword,
      existing,
      reset: data.resetPortalPassword === true,
    });

    const updateData = {};

    const assign = (field, value, provided) => {
      if (provided) updateData[field] = value;
    };

    assign('name', prepared.prepared.name, data.name !== undefined);
    assign('email', prepared.prepared.email, data.email !== undefined);
    assign('phone', prepared.prepared.phone, data.phone !== undefined);
    assign('company', prepared.prepared.company, data.company !== undefined);
    assign('sector', prepared.prepared.sector, data.sector !== undefined);
    assign('briefing', prepared.prepared.briefing, data.briefing !== undefined || data.brief !== undefined);
    assign('website', prepared.prepared.website, data.website !== undefined);
    assign('instagram', prepared.prepared.instagram, data.instagram !== undefined);
    assign('facebook', prepared.prepared.facebook, data.facebook !== undefined);
    assign('tiktok', prepared.prepared.tiktok, data.tiktok !== undefined);
    assign('notes', prepared.prepared.notes, data.notes !== undefined);
    assign('logoUrl', prepared.prepared.logoUrl, data.logoUrl !== undefined || data.logo_url !== undefined);
    assign(
      'billingContactName',
      prepared.prepared.billingContactName,
      data.billingContactName !== undefined || data.billing_contact_name !== undefined
    );
    assign(
      'billingContactEmail',
      prepared.prepared.billingContactEmail,
      data.billingContactEmail !== undefined || data.billing_contact_email !== undefined
    );
    assign('whatsappOptIn', prepared.prepared.whatsappOptIn, data.whatsappOptIn !== undefined);
    assign(
      'whatsappNumberE164',
      prepared.prepared.whatsappNumberE164,
      data.whatsappNumberE164 !== undefined ||
        data.whatsapp_number_e164 !== undefined ||
        data.phoneE164 !== undefined
    );
    assign('tags', prepared.tags, data.tags !== undefined || data.tagsInput !== undefined);
    assign('metadata', prepared.metadata || null, data.metadata !== undefined);

    if (prepared.monthlyFeeProvided) {
      updateData.monthlyFeeCents = prepared.monthlyFeeCents;
    }
    if (prepared.renewalProvided) {
      updateData.renewalDate = prepared.renewalDate;
    }

    if (portalCreds.persistEmail) {
      updateData.portalEmail = portalCreds.email;
      updateData.portalPasswordHash = portalCreds.hash;
    } else if (prepared.explicitPortalEmail && !prepared.portalEmail) {
      updateData.portalEmail = null;
      updateData.portalPasswordHash = null;
    } else if (portalCreds.hash && portalCreds.changed) {
      updateData.portalPasswordHash = portalCreds.hash;
    }

    const updated = await prisma.client.update({
      where: { id },
      data: updateData,
    });

    const monthlyChanged =
      prepared.monthlyFeeProvided &&
      prepared.monthlyFeeCents &&
      prepared.monthlyFeeCents > 0 &&
      prepared.monthlyFeeCents !== existing.monthlyFeeCents;

    if (monthlyChanged) {
      await recordMonthlyRevenue(
        tenantId,
        id,
        prepared.monthlyFeeCents,
        prepared.renewalDate || existing.renewalDate,
        `Atualização do valor mensal - ${updated.name}`
      );
    }

    const extra =
      portalCreds.plain && portalCreds.email
        ? { portalCredentials: { email: portalCreds.email, password: portalCreds.plain } }
        : {};

    return sanitizeClient(updated, extra);
  },

  /**
   * Remove client (dentro do tenant)
   */
  async remove(tenantId, id) {
    const existing = await getRawClient(tenantId, id);
    if (!existing) return false;

    await prisma.client.delete({
      where: { id },
    });

    return true;
  },

  /**
   * Busca clientes por campo específico (útil para autosuggest)
   */
  async suggest(tenantId, term, limit = 10) {
    if (!term) return [];
    const items = await prisma.client.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { company: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
    return items.map((item) => sanitizeClient(item));
  },

  /**
   * Upsert helper: cria ou atualiza por email (dentro do tenant)
   */
  async upsertByEmail(tenantId, data = {}) {
    if (!data.email) {
      throw new Error('Email é necessário para upsertByEmail');
    }
    const existing = await prisma.client.findFirst({
      where: { tenantId, email: data.email },
    });
    if (existing) {
      return this.update(tenantId, existing.id, data);
    }
    return this.create(tenantId, data);
  },
};
