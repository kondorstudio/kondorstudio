const {
  METRIC_CATALOG_TYPES,
  createMetricSchema,
} = require('./metricCatalog.validators');
const metricCatalogService = require('./metricCatalog.service');
const { DATA_SOURCES } = require('./connections.validators');

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseListQuery(req, defaultType) {
  const source = req.query?.source ? String(req.query.source) : '';
  if (!source || !DATA_SOURCES.includes(source)) {
    const err = new Error('source invalido');
    err.status = 400;
    throw err;
  }

  const level = req.query?.level ? String(req.query.level) : null;
  const typeRaw = req.query?.type ? String(req.query.type).toUpperCase() : defaultType;
  const type = METRIC_CATALOG_TYPES.includes(typeRaw) ? typeRaw : null;

  if (!type) {
    const err = new Error('type invalido');
    err.status = 400;
    throw err;
  }

  return { source, level, type };
}

function parseCreatePayload(body = {}) {
  const payload = {
    ...body,
    supportedCharts: normalizeList(body.supportedCharts),
    supportedBreakdowns: normalizeList(body.supportedBreakdowns),
  };

  const parsed = createMetricSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error?.errors?.[0]?.message || 'Dados invalidos';
    const err = new Error(message);
    err.status = 400;
    throw err;
  }

  return parsed.data;
}

module.exports = {
  async list(req, res) {
    try {
      const query = parseListQuery(req, 'METRIC');
      const items = await metricCatalogService.listCatalog(req.tenantId, query);
      return res.json({ items });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao listar catalogo' });
    }
  },

  async listDimensions(req, res) {
    try {
      const query = parseListQuery(req, 'DIMENSION');
      const items = await metricCatalogService.listCatalog(req.tenantId, query);
      return res.json({ items });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao listar dimensoes' });
    }
  },

  async create(req, res) {
    try {
      const payload = parseCreatePayload(req.body || {});
      const item = await metricCatalogService.upsertMetric(req.tenantId, payload);
      return res.status(201).json(item);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || 'Erro ao salvar metrica' });
    }
  },
};
