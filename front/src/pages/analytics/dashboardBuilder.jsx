import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContainerWidth } from "react-grid-layout";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.jsx";
import { Card } from "@/components/ui/card.jsx";
import DashboardCanvas from "@/components/reports/widgets/DashboardCanvas.jsx";
import Checkbox from "@/components/ui/checkbox.jsx";

const WIDGET_TYPES = [
  { value: "NUMBER", label: "Numero" },
  { value: "LINE", label: "Linha" },
  { value: "BAR", label: "Barra" },
  { value: "TABLE", label: "Tabela" },
  { value: "PIE", label: "Pizza" },
];

const DATE_RANGE_OPTIONS = [
  { value: "LAST_7_DAYS", label: "Ultimos 7 dias" },
  { value: "LAST_30_DAYS", label: "Ultimos 30 dias" },
  { value: "LAST_90_DAYS", label: "Ultimos 90 dias" },
  { value: "THIS_MONTH", label: "Este mes" },
  { value: "LAST_MONTH", label: "Mes passado" },
  { value: "CUSTOM", label: "Customizado" },
];

const MATCH_OPTIONS = [
  { value: "EXACT", label: "Igual" },
  { value: "CONTAINS", label: "Contem" },
];

const PIE_COLORS = ["#2563eb", "#0ea5e9", "#22c55e", "#B050F0", "#ec4899"];

function createLayoutItem(id, existingLayout) {
  const cols = 12;
  const defaultW = 4;
  const defaultH = 4;
  const nextY = existingLayout.reduce(
    (acc, item) => Math.max(acc, item.y + item.h),
    0
  );
  const nextX = (existingLayout.length * defaultW) % cols;
  return { i: id, x: nextX, y: nextY, w: defaultW, h: defaultH };
}

function normalizeLayoutFromWidgets(widgets) {
  const layout = [];
  widgets.forEach((widget) => {
    if (widget.layout) {
      layout.push({ i: widget.id, ...widget.layout });
    } else {
      layout.push(createLayoutItem(widget.id, layout));
    }
  });
  return layout;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("pt-BR").format(number);
}

function buildDimensionFilter(filter) {
  if (!filter?.fieldName || !filter?.value) return null;
  return {
    filter: {
      fieldName: filter.fieldName,
      stringFilter: {
        matchType: filter.matchType || "EXACT",
        value: filter.value,
        caseSensitive: false,
      },
    },
  };
}

function buildOrderBys(orderBy) {
  if (!orderBy?.metricName) return null;
  return [
    {
      metric: { metricName: orderBy.metricName },
      desc: Boolean(orderBy.desc),
    },
  ];
}

function buildRunReportPayload(config, propertyId) {
  if (!config) return null;
  const payload = {
    propertyId,
    metrics: config.metrics || [],
    dimensions: config.dimensions || [],
    dateRange: config.dateRange || { type: "LAST_30_DAYS" },
    limit: config.limit || undefined,
  };
  const dimensionFilter = buildDimensionFilter(config.dimensionFilter);
  const orderBys = buildOrderBys(config.orderBy);
  if (dimensionFilter) payload.dimensionFilter = dimensionFilter;
  if (orderBys) payload.orderBys = orderBys;
  return payload;
}

function WidgetPreview({ type, data }) {
  if (!data) return null;
  const rows = data.rows || [];
  const metricHeaders = data.metricHeaders || [];
  const dimensionHeaders = data.dimensionHeaders || [];

  const firstMetricIndex = 0;
  const series = rows.map((row, index) => ({
    label: row.dimensions?.[0] || String(index + 1),
    value: Number(row.metrics?.[firstMetricIndex] || 0),
  }));

  if (type === "NUMBER") {
    const total =
      data.totals?.[0]?.metrics?.[firstMetricIndex] ||
      rows[rows.length - 1]?.metrics?.[firstMetricIndex];
    return (
      <div className="flex h-full flex-col items-start justify-center gap-2">
        <div className="text-3xl font-semibold text-[var(--text)]">
          {formatNumber(total)}
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          {metricHeaders[0] || "Metric"}
        </div>
      </div>
    );
  }

  if (type === "TABLE") {
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-white">
            <tr>
              {dimensionHeaders.map((header) => (
                <th key={header} className="px-2 py-1 text-[var(--text-muted)]">
                  {header}
                </th>
              ))}
              {metricHeaders.map((header) => (
                <th key={header} className="px-2 py-1 text-[var(--text-muted)]">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-t border-[var(--border)]">
                {(row.dimensions || []).map((value, colIdx) => (
                  <td key={`d-${colIdx}`} className="px-2 py-1">
                    {value}
                  </td>
                ))}
                {(row.metrics || []).map((value, colIdx) => (
                  <td key={`m-${colIdx}`} className="px-2 py-1">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === "PIE") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={series}
            dataKey="value"
            nameKey="label"
            innerRadius={40}
            outerRadius={70}
            paddingAngle={2}
          >
            {series.map((entry, idx) => (
              <Cell key={entry.label} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === "BAR") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function WidgetCard({ widget, propertyId, onEdit, onDelete }) {
  const payload = useMemo(
    () => buildRunReportPayload(widget.config, propertyId),
    [widget.config, propertyId]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["ga4-widget-data", widget.id, payload],
    queryFn: () => base44.analytics.runReport(payload),
    enabled: Boolean(payload?.metrics?.length && payload?.propertyId),
    staleTime: 60000,
  });

  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">
            {widget.title}
          </p>
          <p className="text-xs text-[var(--text-muted)]">{widget.type}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(widget)}>
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(widget)}>
            Excluir
          </Button>
        </div>
      </div>
      <div className="flex-1">
        {isLoading ? (
          <div className="text-xs text-[var(--text-muted)]">
            Carregando...
          </div>
        ) : error ? (
          <div className="text-xs text-rose-600">Erro ao carregar dados.</div>
        ) : (
          <WidgetPreview type={widget.type} data={data} />
        )}
      </div>
    </Card>
  );
}

function WidgetDialog({
  open,
  onOpenChange,
  metadata,
  initialValue,
  onSave,
  onPreview,
  previewData,
  previewLoading,
}) {
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    if (open) setDraft(initialValue);
  }, [open, initialValue]);

  const metrics = metadata?.metrics || [];
  const dimensions = metadata?.dimensions || [];

  function toggleListValue(list, value) {
    if (list.includes(value)) {
      return list.filter((item) => item !== value);
    }
    return [...list, value];
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Configurar widget</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-[var(--text-muted)]">Titulo</label>
                <Input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">Tipo</label>
                <SelectNative
                  value={draft.type}
                  onChange={(event) =>
                    setDraft({ ...draft, type: event.target.value })
                  }
                >
                  {WIDGET_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </SelectNative>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)]">Metricas</p>
                <div className="max-h-40 space-y-2 overflow-auto rounded-lg border border-[var(--border)] p-3">
                  {metrics.map((metric) => (
                    <label key={metric.apiName} className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={draft.config.metrics.includes(metric.apiName)}
                        onCheckedChange={() =>
                          setDraft({
                            ...draft,
                            config: {
                              ...draft.config,
                              metrics: toggleListValue(
                                draft.config.metrics,
                                metric.apiName
                              ),
                            },
                          })
                        }
                      />
                      <span>{metric.uiName || metric.apiName}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)]">Dimensoes</p>
                <div className="max-h-40 space-y-2 overflow-auto rounded-lg border border-[var(--border)] p-3">
                  {dimensions.map((dimension) => (
                    <label key={dimension.apiName} className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={draft.config.dimensions.includes(dimension.apiName)}
                        onCheckedChange={() =>
                          setDraft({
                            ...draft,
                            config: {
                              ...draft.config,
                              dimensions: toggleListValue(
                                draft.config.dimensions,
                                dimension.apiName
                              ),
                            },
                          })
                        }
                      />
                      <span>{dimension.uiName || dimension.apiName}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-[var(--text-muted)]">Periodo</label>
                <SelectNative
                  value={draft.config.dateRange.type}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      config: {
                        ...draft.config,
                        dateRange: {
                          ...draft.config.dateRange,
                          type: event.target.value,
                        },
                      },
                    })
                  }
                >
                  {DATE_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectNative>
              </div>
              {draft.config.dateRange.type === "CUSTOM" ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    type="date"
                    value={draft.config.dateRange.startDate || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        config: {
                          ...draft.config,
                          dateRange: {
                            ...draft.config.dateRange,
                            startDate: event.target.value,
                          },
                        },
                      })
                    }
                  />
                  <Input
                    type="date"
                    value={draft.config.dateRange.endDate || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        config: {
                          ...draft.config,
                          dateRange: {
                            ...draft.config.dateRange,
                            endDate: event.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-[var(--text-muted)]">Filtro</label>
                <SelectNative
                  value={draft.config.dimensionFilter.fieldName || ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      config: {
                        ...draft.config,
                        dimensionFilter: {
                          ...draft.config.dimensionFilter,
                          fieldName: event.target.value,
                        },
                      },
                    })
                  }
                >
                  <option value="">Sem filtro</option>
                  {dimensions.map((dimension) => (
                    <option key={dimension.apiName} value={dimension.apiName}>
                      {dimension.uiName || dimension.apiName}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <SelectNative
                  value={draft.config.dimensionFilter.matchType || "EXACT"}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      config: {
                        ...draft.config,
                        dimensionFilter: {
                          ...draft.config.dimensionFilter,
                          matchType: event.target.value,
                        },
                      },
                    })
                  }
                >
                  {MATCH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectNative>
                <Input
                  placeholder="Valor"
                  value={draft.config.dimensionFilter.value || ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      config: {
                        ...draft.config,
                        dimensionFilter: {
                          ...draft.config.dimensionFilter,
                          value: event.target.value,
                        },
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-[var(--text-muted)]">Ordenar por</label>
                <SelectNative
                  value={draft.config.orderBy.metricName || ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      config: {
                        ...draft.config,
                        orderBy: {
                          ...draft.config.orderBy,
                          metricName: event.target.value,
                        },
                      },
                    })
                  }
                >
                  <option value="">Sem ordenacao</option>
                  {metrics.map((metric) => (
                    <option key={metric.apiName} value={metric.apiName}>
                      {metric.uiName || metric.apiName}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-[var(--text-muted)]">
                  Descendente
                </label>
                <Checkbox
                  checked={Boolean(draft.config.orderBy.desc)}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      config: {
                        ...draft.config,
                        orderBy: {
                          ...draft.config.orderBy,
                          desc: checked,
                        },
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-[var(--text-muted)]">Limite</label>
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={draft.config.limit || ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      config: {
                        ...draft.config,
                        limit: event.target.value ? Number(event.target.value) : undefined,
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => onPreview(draft)}
                disabled={previewLoading}
              >
                Preview
              </Button>
              <Button onClick={() => onSave(draft)}>Salvar widget</Button>
            </div>
            <div className="flex-1 rounded-xl border border-[var(--border)] bg-white p-4">
              {previewLoading ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Gerando preview...
                </p>
              ) : previewData ? (
                <WidgetPreview type={draft.type} data={previewData} />
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  Clique em Preview para ver os dados.
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AnalyticsDashboardBuilder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dashboardId } = useParams();
  const isNew = !dashboardId;
  const { width, containerRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 960,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [layout, setLayout] = useState([]);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [widgets, setWidgets] = useState([]);
  const [widgetDialogOpen, setWidgetDialogOpen] = useState(false);
  const [activeWidget, setActiveWidget] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data: ga4Status } = useQuery({
    queryKey: ["ga4-status"],
    queryFn: () => base44.ga4.status(),
  });

  const { data: dashboardData } = useQuery({
    queryKey: ["analytics-dashboard", dashboardId],
    queryFn: () => base44.analytics.getDashboard(dashboardId),
    enabled: Boolean(dashboardId),
  });

  const properties = ga4Status?.properties || [];

  const selectedProperty = useMemo(() => {
    if (dashboardData?.integrationProperty) {
      return dashboardData.integrationProperty;
    }
    return properties.find((prop) => prop.id === selectedPropertyId) || null;
  }, [dashboardData, properties, selectedPropertyId]);

  const ga4PropertyId = selectedProperty?.propertyId || null;

  const { data: metadata } = useQuery({
    queryKey: ["ga4-metadata", ga4PropertyId],
    queryFn: () => base44.ga4.metadata(ga4PropertyId),
    enabled: Boolean(ga4PropertyId),
  });

  useEffect(() => {
    if (!dashboardData) return;
    setName(dashboardData.name || "");
    setDescription(dashboardData.description || "");
    setSelectedPropertyId(dashboardData.integrationPropertyId);
    const nextWidgets = dashboardData.widgets || [];
    setWidgets(nextWidgets);
    setLayout(normalizeLayoutFromWidgets(nextWidgets));
  }, [dashboardData]);

  useEffect(() => {
    if (!isNew || selectedPropertyId || !properties.length) return;
    const selected = properties.find((prop) => prop.isSelected) || properties[0];
    if (selected) setSelectedPropertyId(selected.id);
  }, [isNew, properties, selectedPropertyId]);

  const createDashboardMutation = useMutation({
    mutationFn: (payload) => base44.analytics.createDashboard(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["analytics-dashboards"] });
      navigate(`/analytics/dashboards/${created.id}`);
    },
  });

  const updateDashboardMutation = useMutation({
    mutationFn: (payload) =>
      base44.analytics.updateDashboard(dashboardId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics-dashboard", dashboardId] });
      queryClient.invalidateQueries({ queryKey: ["analytics-dashboards"] });
    },
  });

  const deleteWidgetMutation = useMutation({
    mutationFn: (widgetId) => base44.analytics.deleteWidget(widgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics-dashboard", dashboardId] });
    },
  });

  const saveLayout = async () => {
    if (!layoutDirty || !widgets.length) return;
    await Promise.all(
      layout.map((item) => {
        const widget = widgets.find((w) => w.id === item.i);
        if (!widget) return null;
        return base44.analytics.updateWidget(widget.id, {
          layout: { x: item.x, y: item.y, w: item.w, h: item.h },
        });
      })
    );
    setLayoutDirty(false);
    queryClient.invalidateQueries({ queryKey: ["analytics-dashboard", dashboardId] });
  };

  const handleSaveDashboard = () => {
    if (!name.trim()) return;
    if (isNew) {
      if (!selectedPropertyId) return;
      return createDashboardMutation.mutate({
        name: name.trim(),
        description: description.trim() || null,
        integrationPropertyId: selectedPropertyId,
        defaultDateRange: { type: "LAST_30_DAYS" },
      });
    }
    return updateDashboardMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
    });
  };

  const defaultWidgetDraft = useMemo(
    () => ({
      type: "LINE",
      title: "",
      config: {
        metrics: [],
        dimensions: [],
        dateRange: { type: "LAST_30_DAYS" },
        dimensionFilter: { fieldName: "", matchType: "EXACT", value: "" },
        orderBy: { metricName: "", desc: false },
        limit: 1000,
      },
    }),
    []
  );

  const widgetDraft = activeWidget
    ? {
        ...activeWidget,
        config: {
          ...defaultWidgetDraft.config,
          ...activeWidget.config,
        },
      }
    : defaultWidgetDraft;

  const handleSaveWidget = async (draft) => {
    if (!dashboardId && isNew) return;
    if (!draft.title || !draft.config.metrics.length) return;

    if (draft.id) {
      await base44.analytics.updateWidget(draft.id, {
        type: draft.type,
        title: draft.title,
        config: draft.config,
      });
    } else {
      const nextLayoutItem = createLayoutItem(
        `temp-${Date.now()}`,
        layout
      );
      const created = await base44.analytics.createWidget(dashboardId, {
        type: draft.type,
        title: draft.title,
        config: draft.config,
        layout: {
          x: nextLayoutItem.x,
          y: nextLayoutItem.y,
          w: nextLayoutItem.w,
          h: nextLayoutItem.h,
        },
      });
      setWidgets((prev) => [...prev, created]);
      setLayout((prev) => [
        ...prev,
        { ...nextLayoutItem, i: created.id },
      ]);
    }

    queryClient.invalidateQueries({ queryKey: ["analytics-dashboard", dashboardId] });
    setWidgetDialogOpen(false);
    setActiveWidget(null);
    setPreviewData(null);
  };

  const handlePreviewWidget = async (draft) => {
    if (!ga4PropertyId) return;
    setPreviewLoading(true);
    try {
      const payload = buildRunReportPayload(draft.config, ga4PropertyId);
      const data = await base44.analytics.previewWidget(payload);
      setPreviewData(data);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDeleteWidget = async (widget) => {
    if (!widget?.id) return;
    await deleteWidgetMutation.mutateAsync(widget.id);
  };

  return (
    <PageShell>
      <PageHeader
        title={isNew ? "Novo dashboard GA4" : "Editar dashboard GA4"}
        subtitle="Configure widgets personalizados e acompanhe seus dados."
        action={
          <Button onClick={handleSaveDashboard} disabled={createDashboardMutation.isPending}>
            {isNew ? "Criar dashboard" : "Salvar dashboard"}
          </Button>
        }
      />

      {isNew && !properties.length ? (
        <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-700">
          Conecte o GA4 e sincronize propriedades antes de criar um dashboard.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-[var(--text-muted)]">Nome</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            {isNew ? (
              <div>
                <label className="text-xs text-[var(--text-muted)]">Propriedade GA4</label>
                <SelectNative
                  value={selectedPropertyId}
                  onChange={(event) => setSelectedPropertyId(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {properties.map((prop) => (
                    <option key={prop.id} value={prop.id}>
                      {prop.displayName} ({prop.propertyId})
                    </option>
                  ))}
                </SelectNative>
              </div>
            ) : (
              <div>
                <label className="text-xs text-[var(--text-muted)]">Propriedade GA4</label>
                <div className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
                  {selectedProperty?.displayName || "Propriedade GA4"}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-[var(--text-muted)]">Descricao</label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={() => setWidgetDialogOpen(true)}
            disabled={isNew || !dashboardId}
          >
            Adicionar widget
          </Button>
          <Button
            variant="outline"
            onClick={saveLayout}
            disabled={!layoutDirty}
          >
            Salvar layout
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <DashboardCanvas
          width={width}
          containerRef={containerRef}
          layout={layout}
          items={widgets}
          isEditable
          onLayoutChange={(nextLayout) => {
            setLayout(nextLayout);
            setLayoutDirty(true);
          }}
          renderItem={(widget) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              propertyId={ga4PropertyId}
              onEdit={(item) => {
                setActiveWidget(item);
                setWidgetDialogOpen(true);
              }}
              onDelete={handleDeleteWidget}
            />
          )}
        />
      </div>

      <WidgetDialog
        open={widgetDialogOpen}
        onOpenChange={(next) => {
          setWidgetDialogOpen(next);
          if (!next) {
            setActiveWidget(null);
            setPreviewData(null);
          }
        }}
        metadata={metadata}
        initialValue={widgetDraft}
        onSave={handleSaveWidget}
        onPreview={handlePreviewWidget}
        previewData={previewData}
        previewLoading={previewLoading}
      />
    </PageShell>
  );
}
