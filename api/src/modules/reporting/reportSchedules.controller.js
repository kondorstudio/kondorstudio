const {
  createScheduleSchema,
  updateScheduleSchema,
  REPORT_SCOPES,
  REPORT_FREQUENCIES,
  COMPARE_MODES,
} = require("./reportSchedules.validators");
const schedulesService = require("./reportSchedules.service");

function normalizePayload(payload = {}) {
  const next = { ...payload };
  if (next.scope) next.scope = String(next.scope).toUpperCase();
  if (next.frequency) next.frequency = String(next.frequency).toUpperCase();
  if (next.scheduleConfig && next.scheduleConfig.compareMode) {
    next.scheduleConfig = {
      ...next.scheduleConfig,
      compareMode: String(next.scheduleConfig.compareMode).toUpperCase(),
    };
  }
  return next;
}

function validateCreate(body = {}) {
  const payload = normalizePayload(body);
  const parsed = createScheduleSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error?.errors?.[0]?.message || "Dados invalidos";
    const err = new Error(message);
    err.status = 400;
    throw err;
  }

  if (!REPORT_SCOPES.includes(parsed.data.scope)) {
    const err = new Error("scope invalido");
    err.status = 400;
    throw err;
  }

  if (!REPORT_FREQUENCIES.includes(parsed.data.frequency)) {
    const err = new Error("frequency invalida");
    err.status = 400;
    throw err;
  }

  const compareMode =
    parsed.data.scheduleConfig?.compareMode || "NONE";
  if (!COMPARE_MODES.includes(compareMode)) {
    const err = new Error("compareMode invalido");
    err.status = 400;
    throw err;
  }

  if (parsed.data.scope === "BRAND" && !parsed.data.brandId) {
    const err = new Error("brandId obrigatorio");
    err.status = 400;
    throw err;
  }

  if (parsed.data.scope === "GROUP" && !parsed.data.groupId) {
    const err = new Error("groupId obrigatorio");
    err.status = 400;
    throw err;
  }

  return parsed.data;
}

function validateUpdate(body = {}) {
  const payload = normalizePayload(body);
  const parsed = updateScheduleSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error?.errors?.[0]?.message || "Dados invalidos";
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
  return parsed.data;
}

module.exports = {
  async list(req, res) {
    try {
      const filters = {
        scope: req.query?.scope ? String(req.query.scope).toUpperCase() : null,
        brandId: req.query?.brandId || null,
        groupId: req.query?.groupId || null,
        isActive:
          req.query?.isActive === undefined
            ? undefined
            : String(req.query.isActive) === "true",
      };
      const items = await schedulesService.listSchedules(req.tenantId, filters);
      return res.json({ items });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao listar agendamentos" });
    }
  },

  async get(req, res) {
    try {
      const schedule = await schedulesService.getSchedule(
        req.tenantId,
        req.params.id,
      );
      if (!schedule) {
        return res.status(404).json({ error: "Agendamento nao encontrado" });
      }
      return res.json(schedule);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao buscar agendamento" });
    }
  },

  async create(req, res) {
    try {
      const payload = validateCreate(req.body || {});
      const schedule = await schedulesService.createSchedule(
        req.tenantId,
        payload,
      );
      return res.status(201).json(schedule);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({
        error: err.message || "Erro ao criar agendamento",
      });
    }
  },

  async update(req, res) {
    try {
      const payload = validateUpdate(req.body || {});
      const schedule = await schedulesService.updateSchedule(
        req.tenantId,
        req.params.id,
        payload,
      );
      if (!schedule) {
        return res.status(404).json({ error: "Agendamento nao encontrado" });
      }
      return res.json(schedule);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({
        error: err.message || "Erro ao atualizar agendamento",
      });
    }
  },

  async remove(req, res) {
    try {
      const removed = await schedulesService.removeSchedule(
        req.tenantId,
        req.params.id,
      );
      if (!removed) {
        return res.status(404).json({ error: "Agendamento nao encontrado" });
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao remover agendamento" });
    }
  },

  async run(req, res) {
    try {
      const result = await schedulesService.enqueueScheduleRun(
        req.tenantId,
        req.params.id,
      );
      return res.json({ ok: true, result });
    } catch (err) {
      const status = err.statusCode || err.status || 500;
      return res.status(status).json({
        error: err.message || "Erro ao executar agendamento",
      });
    }
  },
};
