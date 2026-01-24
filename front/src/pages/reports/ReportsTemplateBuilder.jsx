import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContainerWidth } from "react-grid-layout";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import MetricMultiSelect from "@/components/reports/MetricMultiSelect.jsx";
import SortableChips from "@/components/reports/SortableChips.jsx";
import UnderlineTabs from "@/components/reports/UnderlineTabs.jsx";
import DashboardCanvas from "@/components/reports/widgets/DashboardCanvas.jsx";
import WidgetCard from "@/components/reports/widgets/WidgetCard.jsx";
import WidgetRenderer from "@/components/reports/widgets/WidgetRenderer.jsx";
import { getWidgetTypeMeta } from "@/components/reports/widgets/widgetMeta.js";

const WIDGET_TYPES = [
  { key: "KPI", label: "KPI" },
  { key: "LINE", label: "Linha" },
  { key: "BAR", label: "Barra" },
  { key: "PIE", label: "Pizza" },
  { key: "TABLE", label: "Tabela" },
  { key: "TEXT", label: "Texto" },
  { key: "IMAGE", label: "Imagem" },
];

const SOURCE_OPTIONS = [
  { value: "META_ADS", label: "Meta Ads" },
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "TIKTOK_ADS", label: "TikTok Ads" },
  { value: "LINKEDIN_ADS", label: "LinkedIn Ads" },
  { value: "GA4", label: "GA4" },
  { value: "GBP", label: "Google Business Profile" },
  { value: "META_SOCIAL", label: "Meta Social" },
];

const VISIBILITY_OPTIONS = [
  { value: "PRIVATE", label: "Privado" },
  { value: "TENANT", label: "Tenant" },
  { value: "PUBLIC", label: "Publico" },
];

function createWidgetId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `widget-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function getNextY(layout) {
  if (!layout.length) return 0;
  return layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
}

function createLayoutItem(id, layout) {
  const nextY = getNextY(layout);
  const nextX = (layout.length * 4) % 12;
  return {
    i: id,
    x: nextX,
    y: nextY,
    w: 4,
    h: 4,
  };
}

function normalizeLayout(layout = []) {
  return Array.isArray(layout) ? layout : [];
}

function normalizeWidgets(widgets = []) {
  return Array.isArray(widgets) ? widgets : [];
}

function WidgetConfigDialog({ open, onOpenChange, widget, onSave }) {
  const [draft, setDraft] = useState(widget);
  const [tab, setTab] = useState("main");

  useEffect(() => {
    if (!open) return;
    setDraft(widget);
    setTab("main");
  }, [open, widget]);

  const source = draft?.source || "";
  const level = draft?.level || "";
  const widgetType = draft?.widgetType || "KPI";
  const isGa4Source = source === "GA4";

  const { data: levelsData } = useQuery({
    queryKey: ["reporting-metric-levels", source],
    queryFn: async () => {
      if (!source) return { items: [] };
      return base44.reporting.listMetricCatalog({ source, type: "METRIC" });
    },
    enabled: open && Boolean(source) && !isGa4Source,
  });

  const { data: metricsData } = useQuery({
    queryKey: ["reporting-metric-catalog", source, level, widgetType],
    queryFn: async () => {
      if (!source || !level) return { items: [] };
      return base44.reporting.listMetricCatalog({ source, level, type: "METRIC" });
    },
    enabled: open && Boolean(source) && Boolean(level),
  });

  const { data: dimensionsData } = useQuery({
    queryKey: ["reporting-dimensions", source, level, widgetType],
    queryFn: async () => {
      if (!source || !level) return { items: [] };
      return base44.reporting.listDimensions({ source, level });
    },
    enabled: open && Boolean(source) && Boolean(level),
  });

  const { data: ga4Status } = useQuery({
    queryKey: ["ga4-status"],
    queryFn: () => base44.ga4.status(),
    enabled: open && isGa4Source,
  });

  const ga4PropertyId =
    ga4Status?.selectedProperty?.propertyId ||
    ga4Status?.properties?.[0]?.propertyId ||
    "";

  const { data: ga4Metadata } = useQuery({
    queryKey: ["ga4-template-metadata", ga4PropertyId],
    queryFn: () => base44.ga4.metadata(ga4PropertyId),
    enabled: open && isGa4Source && Boolean(ga4PropertyId),
  });

  const ga4Metrics = useMemo(() => {
    const list = ga4Metadata?.metrics || [];
    return list.map((metric) => ({
      metricKey: metric.apiName,
      label: metric.uiName || metric.apiName,
    }));
  }, [ga4Metadata]);

  const ga4Dimensions = useMemo(() => {
    const list = ga4Metadata?.dimensions || [];
    return list.map((dimension) => ({
      metricKey: dimension.apiName,
      label: dimension.uiName || dimension.apiName,
    }));
  }, [ga4Metadata]);

  const metrics = useMemo(() => {
    const list =
      isGa4Source && ga4Metrics.length ? ga4Metrics : metricsData?.items || [];
    return list.filter((metric) => {
      if (!metric.supportedCharts || !metric.supportedCharts.length) return true;
      return metric.supportedCharts.includes(widgetType);
    });
  }, [ga4Metrics, isGa4Source, metricsData, widgetType]);

  const levels = useMemo(() => {
    if (isGa4Source) return ["PROPERTY"];
    const list = levelsData?.items || [];
    const unique = new Set();
    list.forEach((item) => {
      if (item?.level) unique.add(String(item.level));
    });
    return Array.from(unique);
  }, [isGa4Source, levelsData]);

  const metricsMap = useMemo(() => {
    const map = new Map();
    metrics.forEach((metric) => {
      if (metric?.metricKey) map.set(metric.metricKey, metric.label || metric.metricKey);
    });
    return map;
  }, [metrics]);

  const dimensions = useMemo(() => {
    const list =
      isGa4Source && ga4Dimensions.length
        ? ga4Dimensions
        : dimensionsData?.items || [];
    return list.filter((dimension) => {
      if (!dimension.supportedCharts || !dimension.supportedCharts.length) return true;
      return dimension.supportedCharts.includes(widgetType);
    });
  }, [dimensionsData, ga4Dimensions, isGa4Source, widgetType]);

  const previewRange = useMemo(() => {
    const today = new Date();
    const from = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
    return { dateFrom: from.toISOString().slice(0, 10), dateTo: today.toISOString().slice(0, 10) };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!source) return;
    if (!level && levels.length) {
      setDraft((prev) => ({ ...prev, level: levels[0] }));
    }
  }, [open, source, level, levels]);

  if (!draft) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="text-sm text-[var(--text-muted)]">Carregando widget...</div>
        </DialogContent>
      </Dialog>
    );
  }

  const selectedMetrics = Array.isArray(draft.metrics) ? draft.metrics : [];
  const options = draft.options && typeof draft.options === "object" ? draft.options : {};
  const metricOptions = useMemo(
    () =>
      metrics.map((metric) => ({
        value: metric.metricKey,
        label: metric.label || metric.metricKey,
      })),
    [metrics]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Configurar widget</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <UnderlineTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "main", label: "Dados principais" },
              { value: "advanced", label: "Opcoes avancadas" },
            ]}
          />

          {tab === "main" ? (
            <div className="space-y-4">
              <div>
                <Label>Titulo</Label>
                <Input
                  value={draft.title || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Fonte</Label>
                  <SelectNative
                    value={source}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        source: event.target.value,
                        level: "",
                        breakdown: "",
                        metrics: [],
                      })
                    }
                  >
                    <option value="">Selecione</option>
                    {SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectNative>
                </div>
                <div>
                  <Label>Nivel</Label>
                  {levels.length ? (
                    <SelectNative
                      value={level}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          level: event.target.value,
                          metrics: [],
                          breakdown: "",
                        })
                      }
                    >
                      <option value="">Selecione</option>
                      {levels.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </SelectNative>
                  ) : (
                    <Input
                      value={level}
                      onChange={(event) =>
                        setDraft({ ...draft, level: event.target.value })
                      }
                      placeholder="CAMPAIGN / ADSET / PROPERTY"
                    />
                  )}
                </div>
              </div>

              <div>
                <Label>Breakdown</Label>
                <SelectNative
                  value={draft.breakdown || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, breakdown: event.target.value })
                  }
                >
                  <option value="">Sem breakdown</option>
                  {dimensions.map((dimension) => (
                    <option
                      key={dimension.metricKey || dimension.dimensionKey || dimension.id}
                      value={dimension.metricKey}
                    >
                      {dimension.label}
                    </option>
                  ))}
                </SelectNative>
              </div>

              <div>
                <Label>Metricas</Label>
                <MetricMultiSelect
                  options={metricOptions}
                  value={selectedMetrics}
                  onChange={(next) => setDraft({ ...draft, metrics: next })}
                />
              </div>

              {widgetType === "TEXT" ? (
                <div>
                  <Label>Conteudo</Label>
                  <Textarea
                    rows={4}
                    value={options.text || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        options: { ...options, text: event.target.value },
                      })
                    }
                  />
                </div>
              ) : null}

              {widgetType === "IMAGE" ? (
                <div>
                  <Label>URL da imagem</Label>
                  <Input
                    value={options.imageUrl || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        options: { ...options, imageUrl: event.target.value },
                      })
                    }
                  />
                </div>
              ) : null}

              <div>
                <Label>Preview</Label>
                <div className="mt-2 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                  <WidgetRenderer
                    widget={draft}
                    filters={previewRange}
                    enableQuery={Boolean(
                      source && (level || widgetType === "TEXT" || widgetType === "IMAGE")
                    )}
                    forceMock
                    variant="mini"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Ordenar metricas (arraste para mudar a ordem)</Label>
                <div className="mt-2">
                  <SortableChips
                    items={selectedMetrics}
                    onChange={(next) => setDraft({ ...draft, metrics: next })}
                    getLabel={(key) => metricsMap.get(key) || key}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Moeda</Label>
                  <Input
                    value={options.currency || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        options: { ...options, currency: event.target.value },
                      })
                    }
                    placeholder="BRL"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                    <input
                      type="checkbox"
                      checked={Boolean(options.hideZero)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          options: { ...options, hideZero: event.target.checked },
                        })
                      }
                    />
                    Ocultar resultados com 0
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                onSave({
                  ...draft,
                  metrics: Array.isArray(draft.metrics) ? draft.metrics : [],
                  options,
                });
                onOpenChange(false);
              }}
            >
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({ open, onOpenChange, widgets, layout }) {
  const previewRange = useMemo(() => {
    const today = new Date();
    const from = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
    return { dateFrom: from.toISOString().slice(0, 10), dateTo: today.toISOString().slice(0, 10) };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Preview do template</DialogTitle>
        </DialogHeader>
        <div className="rounded-[16px] border border-dashed border-[var(--border)] bg-[var(--surface)] p-3">
          <DashboardCanvas
            layout={layout}
            items={widgets}
            width={960}
            onLayoutChange={() => {}}
            isEditable={false}
            renderItem={(widget) => (
              <WidgetCard widget={widget} showActions={false}>
                <WidgetRenderer
                  widget={widget}
                  filters={previewRange}
                  enableQuery={Boolean(widget?.source)}
                  forceMock
                  variant="mini"
                />
              </WidgetCard>
            )}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ReportsTemplateBuilder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { templateId } = useParams();
  const isNew = !templateId;
  const { width, containerRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 960,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("TENANT");
  const [layout, setLayout] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeWidgetId, setActiveWidgetId] = useState(null);
  const [error, setError] = useState("");

  const { data: template, isLoading } = useQuery({
    queryKey: ["reporting-template", templateId],
    queryFn: () => base44.reporting.getTemplate(templateId),
    enabled: Boolean(templateId),
  });

  useEffect(() => {
    if (!template) return;
    setName(template.name || "");
    setDescription(template.description || "");
    setVisibility(template.visibility || "TENANT");
    setLayout(normalizeLayout(template.layoutSchema));
    setWidgets(normalizeWidgets(template.widgetsSchema));
  }, [template]);

  useEffect(() => {
    if (isNew && !templateId) {
      setName("Novo template");
      setDescription("");
      setVisibility("TENANT");
      setLayout([]);
      setWidgets([]);
    }
  }, [isNew, templateId]);

  useEffect(() => {
    if (!widgets.length) return;
    setLayout((prev) => {
      const existing = new Set(prev.map((item) => item.i));
      const missing = widgets
        .filter((widget) => !existing.has(widget.id))
        .map((widget) => createLayoutItem(widget.id, prev));
      if (!missing.length) return prev;
      return [...prev, ...missing];
    });
  }, [widgets]);

  const activeWidget = useMemo(
    () => widgets.find((widget) => widget.id === activeWidgetId) || null,
    [widgets, activeWidgetId]
  );

  const addWidget = (type) => {
    const id = createWidgetId();
    const label = WIDGET_TYPES.find((item) => item.key === type)?.label || "Widget";
    const nextWidget = {
      id,
      widgetType: type,
      title: `${label} widget`,
      source: "",
      level: "",
      breakdown: "",
      metrics: [],
      filters: {},
      options: {},
    };
    setWidgets((prev) => [...prev, nextWidget]);
    setLayout((prev) => [...prev, createLayoutItem(id, prev)]);
    setActiveWidgetId(id);
    setConfigOpen(true);
  };

  const handleRemoveWidget = (widgetId) => {
    setWidgets((prev) => prev.filter((widget) => widget.id !== widgetId));
    setLayout((prev) => prev.filter((item) => item.i !== widgetId));
  };

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (isNew) {
        return base44.reporting.createTemplate(payload);
      }
      return base44.reporting.updateTemplate(templateId, payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reporting-templates"] });
      if (isNew) {
        navigate(`/reports/templates/${data.id}/edit`);
        return;
      }
      if (data.id && data.id !== templateId) {
        navigate(`/reports/templates/${data.id}/edit`);
      }
    },
    onError: (err) => {
      setError(err?.message || "Erro ao salvar template.");
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => base44.reporting.duplicateTemplate(templateId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reporting-templates"] });
      if (data?.id) {
        navigate(`/reports/templates/${data.id}/edit`);
      }
    },
  });

  const handleSave = (nextVisibility) => {
    setError("");
    if (!name.trim()) {
      setError("Nome do template obrigatorio.");
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      visibility: nextVisibility || visibility,
      layoutSchema: layout,
      widgetsSchema: widgets,
    };
    saveMutation.mutate(payload);
  };

  if (!isNew && isLoading) {
    return (
      <PageShell>
        <div className="h-48 rounded-[18px] border border-[var(--border)] bg-white/70 animate-pulse" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Builder de templates
            </p>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              {isNew ? "Novo template" : name || "Template"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/reports/templates")}>
              Voltar
            </Button>
            {!isNew ? (
              <Button
                variant="ghost"
                onClick={() => duplicateMutation.mutate()}
                disabled={duplicateMutation.isLoading}
              >
                Duplicar
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setPreviewOpen(true)}>
              Preview
            </Button>
            <Button variant="success" onClick={() => handleSave("PUBLIC")}>
              Publicar
            </Button>
            <Button onClick={() => handleSave()} disabled={saveMutation.isLoading}>
              {saveMutation.isLoading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-[16px] border border-[var(--border)] bg-white px-4 py-4 shadow-[var(--shadow-sm)]">
              <p className="text-sm font-semibold text-[var(--text)]">Detalhes</p>
              <div className="mt-3 space-y-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div>
                  <Label>Descricao</Label>
                  <Input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Visibilidade</Label>
                  <SelectNative
                    value={visibility}
                    onChange={(event) => setVisibility(event.target.value)}
                  >
                    {VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectNative>
                </div>
              </div>
            </div>

            <div className="rounded-[16px] border border-[var(--border)] bg-white px-4 py-4 shadow-[var(--shadow-sm)]">
              <p className="text-sm font-semibold text-[var(--text)]">Widgets</p>
              <div className="mt-3 grid gap-2">
                {WIDGET_TYPES.map((item) => (
                  (() => {
                    const meta = getWidgetTypeMeta(item.key);
                    const Icon = meta?.icon;
                    return (
                      <Button
                        key={item.key}
                        type="button"
                        variant="secondary"
                        className="justify-start"
                        onClick={(event) => {
                          event.preventDefault();
                          addWidget(item.key);
                        }}
                      >
                        {Icon ? <Icon className="h-4 w-4" /> : null}
                        {item.label}
                      </Button>
                    );
                  })()
                ))}
              </div>
            </div>
          </aside>

          <section className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
            <DashboardCanvas
              layout={layout}
              items={widgets}
              width={width}
              containerRef={containerRef}
              onLayoutChange={(nextLayout) => setLayout(nextLayout)}
              isEditable
              renderItem={(widget) => {
                const editHandler = () => {
                  setActiveWidgetId(widget.id);
                  setConfigOpen(true);
                };

                return (
                  <WidgetCard
                    widget={widget}
                    onEdit={editHandler}
                    onDuplicate={() => {
                      const id = createWidgetId();
                      const nextWidget = {
                        ...widget,
                        id,
                        title: widget.title
                          ? `${widget.title} (copia)`
                          : "Widget (copia)",
                      };
                      setWidgets((prev) => [...prev, nextWidget]);
                      setLayout((prev) => [...prev, createLayoutItem(id, prev)]);
                    }}
                    onRemove={() => handleRemoveWidget(widget.id)}
                  >
                    <WidgetRenderer
                      widget={widget}
                      filters={{
                        dateFrom: new Date().toISOString().slice(0, 10),
                        dateTo: new Date().toISOString().slice(0, 10),
                      }}
                      enableQuery={Boolean(widget?.source)}
                      forceMock
                      variant="mini"
                      onEdit={editHandler}
                    />
                  </WidgetCard>
                );
              }}
            />
          </section>
        </div>
      </div>

      <WidgetConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        widget={activeWidget}
        onSave={(updated) => {
          setWidgets((prev) =>
            prev.map((widget) => (widget.id === updated.id ? updated : widget))
          );
        }}
      />

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        widgets={widgets}
        layout={layout}
      />
    </PageShell>
  );
}
