const dashboardService = require('../services/dashboardService');
const { prisma } = require('../prisma');

module.exports = {
  async summary(req, res) {
    try {
      const { range, clientId } = req.query;

      const data = await dashboardService.getSummary(req.tenantId, {
        range,
        clientId,
      });

      return res.json(data);
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },

  async overview(req, res) {
    return module.exports.summary(req, res);
  },

  async tenant(req, res) {
    try {
      const tenantId = req.tenantId || (req.tenant && req.tenant.id);
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant não identificado' });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { plan: true },
      });

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant não encontrado' });
      }

      const settings = tenant.settings || {};
      const planName =
        tenant.plan?.name?.toLowerCase() ||
        tenant.plan?.key?.toLowerCase?.() ||
        null;

      return res.json({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        agency_name: settings.agency_name || tenant.name,
        primary_color: settings.primary_color || '#A78BFA',
        accent_color: settings.accent_color || '#39FF14',
        logo_url: settings.logo_url || null,
        plan: planName,
        subscription_status: req.subscription?.status || null,
      });
    } catch (err) {
      console.error('Error fetching dashboard tenant:', err);
      return res.status(500).json({ error: 'server error' });
    }
  },
};
