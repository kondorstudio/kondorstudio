const reportExportsService = require("./reportExports.service");

module.exports = {
  async create(req, res) {
    try {
      const result = await reportExportsService.createReportExport(
        req.tenantId,
        req.params.id
      );
      return res.status(201).json(result);
    } catch (err) {
      const status = err.statusCode || err.status || 500;
      return res.status(status).json({
        error: err.message || "Erro ao gerar exportacao",
      });
    }
  },

  async list(req, res) {
    try {
      const items = await reportExportsService.listReportExports(
        req.tenantId,
        req.params.id
      );
      return res.json({ items });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao listar exportacoes" });
    }
  },

  async get(req, res) {
    try {
      const record = await reportExportsService.getReportExport(
        req.tenantId,
        req.params.exportId
      );
      if (!record) {
        return res.status(404).json({ error: "Exportacao nao encontrada" });
      }
      return res.json(record);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao buscar exportacao" });
    }
  },
};
