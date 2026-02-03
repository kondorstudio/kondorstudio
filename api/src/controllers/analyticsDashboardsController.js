const ga4AdminService = require('../services/ga4AdminService');
const ga4DataService = require('../services/ga4DataService');

function respondReauth(res, error) {
  if (!error) return false;
  const code = error?.code;
  if (code !== 'REAUTH_REQUIRED' && code !== 'GA4_REAUTH_REQUIRED') {
    return false;
  }
  const message = 'Reconecte o GA4 para continuar.';
  res.status(409).json({ code: 'REAUTH_REQUIRED', message, error: message });
  return true;
}

async function resolvePropertyId({ tenantId, userId, propertyId }) {
  if (propertyId) return propertyId;
  const selected = await ga4AdminService.getSelectedProperty({
    tenantId,
    userId,
  });
  return selected?.propertyId || null;
}

async function ensureDashboardOwner(req, dashboardId) {
  const dashboard = await req.db.analyticsDashboard.findFirst({
    where: {
      id: String(dashboardId),
      userId: String(req.user.id),
    },
  });
  return dashboard;
}

module.exports = {
  async listDashboards(req, res) {
    try {
      const items = await req.db.analyticsDashboard.findMany({
        where: {
          userId: String(req.user.id),
        },
        include: {
          integrationProperty: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ items });
    } catch (error) {
      console.error('listDashboards error:', error);
      return res.status(500).json({ error: 'Failed to list dashboards' });
    }
  },

  async createDashboard(req, res) {
    try {
      const userId = req.user.id;
      const payload = req.body || {};

      const property = await req.db.integrationGoogleGa4Property.findFirst({
        where: { id: String(payload.integrationPropertyId) },
        include: { integration: true },
      });

      if (!property) {
        return res.status(404).json({ error: 'GA4 property not found' });
      }

      const dashboard = await req.db.analyticsDashboard.create({
        data: {
          userId: String(userId),
          integrationPropertyId: property.id,
          name: payload.name,
          description: payload.description || null,
          defaultDateRange: payload.defaultDateRange || null,
        },
      });

      return res.json(dashboard);
    } catch (error) {
      console.error('createDashboard error:', error);
      return res.status(500).json({ error: 'Failed to create dashboard' });
    }
  },

  async getDashboard(req, res) {
    try {
      const dashboard = await req.db.analyticsDashboard.findFirst({
        where: {
          id: String(req.params.id),
          userId: String(req.user.id),
        },
        include: {
          widgets: true,
          integrationProperty: true,
        },
      });
      if (!dashboard) {
        return res.status(404).json({ error: 'Dashboard not found' });
      }
      return res.json(dashboard);
    } catch (error) {
      console.error('getDashboard error:', error);
      return res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
  },

  async updateDashboard(req, res) {
    try {
      const dashboard = await ensureDashboardOwner(req, req.params.id);
      if (!dashboard) {
        return res.status(404).json({ error: 'Dashboard not found' });
      }

      const payload = req.body || {};
      const updated = await req.db.analyticsDashboard.update({
        where: { id: dashboard.id },
        data: {
          name: payload.name || dashboard.name,
          description:
            payload.description !== undefined
              ? payload.description
              : dashboard.description,
          defaultDateRange:
            payload.defaultDateRange !== undefined
              ? payload.defaultDateRange
              : dashboard.defaultDateRange,
        },
      });
      return res.json(updated);
    } catch (error) {
      console.error('updateDashboard error:', error);
      return res.status(500).json({ error: 'Failed to update dashboard' });
    }
  },

  async deleteDashboard(req, res) {
    try {
      const dashboard = await ensureDashboardOwner(req, req.params.id);
      if (!dashboard) {
        return res.status(404).json({ error: 'Dashboard not found' });
      }
      await req.db.analyticsDashboard.delete({
        where: { id: dashboard.id },
      });
      return res.json({ ok: true });
    } catch (error) {
      console.error('deleteDashboard error:', error);
      return res.status(500).json({ error: 'Failed to delete dashboard' });
    }
  },

  async createWidget(req, res) {
    try {
      const dashboard = await ensureDashboardOwner(req, req.params.id);
      if (!dashboard) {
        return res.status(404).json({ error: 'Dashboard not found' });
      }
      const payload = req.body || {};
      const widget = await req.db.analyticsDashboardWidget.create({
        data: {
          dashboardId: dashboard.id,
          type: payload.type,
          title: payload.title,
          config: payload.config,
          layout: payload.layout || null,
        },
      });
      return res.json(widget);
    } catch (error) {
      console.error('createWidget error:', error);
      return res.status(500).json({ error: 'Failed to create widget' });
    }
  },

  async updateWidget(req, res) {
    try {
      const widget = await req.db.analyticsDashboardWidget.findFirst({
        where: { id: String(req.params.widgetId) },
        include: { dashboard: true },
      });

      if (!widget || widget.dashboard?.userId !== String(req.user.id)) {
        return res.status(404).json({ error: 'Widget not found' });
      }

      const payload = req.body || {};
      const updated = await req.db.analyticsDashboardWidget.update({
        where: { id: widget.id },
        data: {
          type: payload.type || widget.type,
          title: payload.title || widget.title,
          config: payload.config || widget.config,
          layout: payload.layout !== undefined ? payload.layout : widget.layout,
        },
      });
      return res.json(updated);
    } catch (error) {
      console.error('updateWidget error:', error);
      return res.status(500).json({ error: 'Failed to update widget' });
    }
  },

  async deleteWidget(req, res) {
    try {
      const widget = await req.db.analyticsDashboardWidget.findFirst({
        where: { id: String(req.params.widgetId) },
        include: { dashboard: true },
      });

      if (!widget || widget.dashboard?.userId !== String(req.user.id)) {
        return res.status(404).json({ error: 'Widget not found' });
      }

      await req.db.analyticsDashboardWidget.delete({
        where: { id: widget.id },
      });
      return res.json({ ok: true });
    } catch (error) {
      console.error('deleteWidget error:', error);
      return res.status(500).json({ error: 'Failed to delete widget' });
    }
  },

  async previewWidget(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user.id;
      const payload = req.body || {};
      const resolvedPropertyId = await resolvePropertyId({
        tenantId,
        userId,
        propertyId: payload.propertyId,
      });

      if (!resolvedPropertyId) {
        return res.status(400).json({ error: 'propertyId missing' });
      }

      const rateKey = [tenantId, userId, resolvedPropertyId].join(':');
      const response = await ga4DataService.runReport({
        tenantId,
        userId,
        propertyId: resolvedPropertyId,
        payload,
        rateKey,
      });
      return res.json(response);
    } catch (error) {
      console.error('previewWidget error:', error);
      if (respondReauth(res, error)) return;
      return res
        .status(error.status || 500)
        .json({ error: error.message || 'Failed to preview widget' });
    }
  },

  async runReport(req, res) {
    try {
      const tenantId = req.tenantId;
      const userId = req.user.id;
      const payload = req.body || {};
      const resolvedPropertyId = await resolvePropertyId({
        tenantId,
        userId,
        propertyId: payload.propertyId,
      });

      if (!resolvedPropertyId) {
        return res.status(400).json({ error: 'propertyId missing' });
      }

      const rateKey = [tenantId, userId, resolvedPropertyId].join(':');
      const response = await ga4DataService.runReport({
        tenantId,
        userId,
        propertyId: resolvedPropertyId,
        payload,
        rateKey,
      });
      return res.json(response);
    } catch (error) {
      console.error('runReport error:', error);
      if (respondReauth(res, error)) return;
      return res
        .status(error.status || 500)
        .json({ error: error.message || 'Failed to run GA4 report' });
    }
  },
};
