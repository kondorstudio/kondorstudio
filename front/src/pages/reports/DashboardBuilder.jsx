import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContainerWidth } from "react-grid-layout";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.jsx";
import ConnectDataSourceDialog from "@/components/reports/ConnectDataSourceDialog.jsx";
import AlertBanner from "@/components/reports/AlertBanner.jsx";
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

const COMPARE_OPTIONS = [
  { value: "NONE", label: "Sem comparacao" },
  { value: "PREVIOUS_PERIOD", label: "Periodo anterior" },
  { value: "PREVIOUS_YEAR", label: "Ano anterior" },
  { value: "CUSTOM", label: "Personalizado" },
];

function createWidgetId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `widget-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function buildLayoutFromWidgets(widgets = []) {
  if (!Array.isArray(widgets)) return [];
  return widgets.map((widget, index) => ({
    i: String(widget?.id || widget?.i || `w-${index + 1}`),
    x: (index * 4) % 12,
    y: Math.floor(index / 3) * 4,
    w: 4,
    h: 4,
  }));
}

function getNextY(layout) {
  if (!Array.isArray(layout) || !layout.length) return 0;
  return layout.reduce((max, item) => {
    const y = Number.isFinite(item?.y) ? item.y : 0;
    const h = Number.isFinite(item?.h) ? item.h : 0;
    return Math.max(max, y + h);
  }, 0);
}

function createLayoutItem(id, layout) {
  const safeLayout = Array.isArray(layout) ? layout : [];
  const nextY = getNextY(safeLayout);
  const nextX = (safeLayout.length * 4) % 12;
  return {
    i: String(id),
    x: nextX,
    y: nextY,
    w: 4,
    h: 4,
  };
}

function normalizeLayout(layout = [], widgets = []) {
  const widgetList = Array.isArray(widgets) ? widgets : [];
  if (!Array.isArray(layout) || !layout.length) {
    return buildLayoutFromWidgets(widgetList);
  }

  const widgetIds = new Set(
    widgetList.map((widget, index) => String(widget?.id || widget?.i || `w-${index + 1}`))
  );
  const seen = new Set();
  const normalized = layout
    .filter((item) => item && (item.i || item.id))
    .map((item, index) => {
      const i = String(item.i ?? item.id ?? `w-${index + 1}`);
      const x = Number.isFinite(item.x) ? item.x : (index * 4) % 12;
      const y = Number.isFinite(item.y) ? item.y : Math.floor(index / 3) * 4;
      const w = Number.isFinite(item.w) && item.w > 0 ? item.w : 4;
      const h = Number.isFinite(item.h) && item.h > 0 ? item.h : 4;
      return { i, x, y, w, h };
    })
    .filter((item) => {
      if (seen.has(item.i)) return false;
      seen.add(item.i);
      return widgetIds.size ? widgetIds.has(item.i) : true;
    });

  if (!normalized.length && widgetList.length) {
    return buildLayoutFromWidgets(widgetList);
  }
  return normalized;
}

function normalizeWidgets(widgets = []) {
  if (!Array.isArray(widgets)) return [];
  return widgets
    .filter((widget) => widget && typeof widget === "object")
    .map((widget, index) => {
      const base = isPlainObject(widget) ? { ...widget } : {};
      const widgetType = base.widgetType || base.type || "KPI";
      const id = base.id || base.i || `w-${index + 1}`;
      return {
        ...base,
        id: String(id),
        widgetType,
        title:
          base.title ||
          `${getWidgetTypeMeta(widgetType)?.label || "Widget"} widget`,
        source: base.source || "",
        connectionId: base.connectionId || "",
        brandId: base.brandId || "",
        inheritBrand: base.inheritBrand !== false,
        level: base.level || "",
        breakdown: base.breakdown || "",
        metrics: Array.isArray(base.metrics) ? base.metrics : [],
        filters: isPlainObject(base.filters) ? base.filters : {},
        options: isPlainObject(base.options) ? base.options : {},
      };
    });
}

function toDateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildDefaultDateRange() {
  const today = new Date();
  const from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { dateFrom: toDateKey(from), dateTo: toDateKey(today) };
}

function WidgetConfigDialog({
  open,
  onOpenChange,
  widget,
  onSave,
  scope,
  brands,
  globalBrandId,
  globalConnections,
  onConnect,
}) {
  const [draft, setDraft] = useState(widget);
  const [filtersInput, setFiltersInput] = useState("");
  const [filtersError, setFiltersError] = useState("");
  const [tab, setTab] = useState("main");
  const [alertDismissed, setAlertDismissed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(widget);
    setTab("main");
    setAlertDismissed(false);
    const initialFilters =
      widget?.filters && typeof widget.filters === "object"
        ? JSON.stringify(widget.filters, null, 2)
        : "";
    setFiltersInput(initialFilters);
    setFiltersError("");
  }, [open, widget]);

  const widgetType = draft?.widgetType || "KPI";
  const source = draft?.source || "";
  const level = draft?.level || "";
  const breakdown = draft?.breakdown || "";
  const isGa4Source = source === "GA4";
  const inheritBrand = draft?.inheritBrand !== false;
  const brandId = inheritBrand ? globalBrandId : draft?.brandId || "";

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

  const { data: connectionsData } = useQuery({
    queryKey: ["reporting-widget-connections", brandId],
    queryFn: async () => {
      if (!brandId) return { items: [] };
      return base44.reporting.listConnectionsByBrand(brandId);
    },
    enabled: open && Boolean(brandId),
  });

  const availableConnections = useMemo(() => {
    const list = connectionsData?.items || [];
    return list.filter((item) => (source ? item.source === source : true));
  }, [connectionsData, source]);

  const previewRange = useMemo(() => buildDefaultDateRange(), []);

  const previewConnectionId = useMemo(() => {
    if (!source) return "";
    if (inheritBrand) {
      const match = (globalConnections || []).find(
        (item) => item.source === source
      );
      return match?.id || "";
    }
    const match = availableConnections.find((item) => item.source === source);
    return draft?.connectionId || match?.id || "";
  }, [inheritBrand, globalConnections, availableConnections, draft, source]);

  const { data: ga4Metadata } = useQuery({
    queryKey: ["ga4-reporting-metadata", previewConnectionId],
    queryFn: () => base44.reporting.getGa4MetadataByConnection(previewConnectionId),
    enabled: open && isGa4Source && Boolean(previewConnectionId),
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

  useEffect(() => {
    if (!open) return;
    if (!source) return;
    if (!level && levels.length) {
      setDraft((prev) => ({ ...prev, level: levels[0] }));
    }
  }, [open, source, level, levels]);

  useEffect(() => {
    if (!open) return;
    setAlertDismissed(false);
  }, [open, source, brandId, globalBrandId]);

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
  const globalHasConnection =
    globalBrandId && globalConnections?.length ? true : false;

  const metricsKey = useMemo(
    () => [...selectedMetrics].map(String).sort().join(","),
    [selectedMetrics]
  );

  const {
    data: ga4Compatibility,
    isFetching: ga4CompatibilityLoading,
    isError: ga4CompatibilityError,
    error: ga4CompatibilityErrorDetails,
  } = useQuery({
    queryKey: [
      "ga4-compatibility",
      previewConnectionId,
      widgetType,
      breakdown,
      metricsKey,
    ],
    queryFn: () =>
      base44.reporting.checkGa4Compatibility(previewConnectionId, {
        metrics: selectedMetrics,
        breakdown,
        widgetType,
      }),
    enabled:
      open && isGa4Source && Boolean(previewConnectionId) && selectedMetrics.length > 0,
    staleTime: 60 * 1000,
  });

  const incompatMetrics = ga4Compatibility?.incompatibleMetrics || [];
  const incompatDimensions = ga4Compatibility?.incompatibleDimensions || [];
  const hasCompatibilityIssue =
    isGa4Source &&
    selectedMetrics.length > 0 &&
    ga4Compatibility?.compatible === false;
  const compatibilityMessage = [
    incompatMetrics.length ? `Metricas incompativeis: ${incompatMetrics.join(", ")}` : "",
    incompatDimensions.length
      ? `Dimensoes incompativeis: ${incompatDimensions.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const showBrandSelector = scope !== "BRAND" && !inheritBrand;
  const metricOptions = useMemo(
    () =>
      metrics.map((metric) => ({
        value: metric.metricKey,
        label: metric.label || metric.metricKey,
      })),
    [metrics]
  );
  const canCheckConnection = inheritBrand ? Boolean(globalBrandId) : Boolean(brandId);
  const hasConnectionForSource = !source
    ? true
    : inheritBrand
      ? globalConnections.some((item) => item.source === source)
      : availableConnections.some((item) => item.source === source);
  const showConnectionAlert =
    source && canCheckConnection && !hasConnectionForSource && !alertDismissed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
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
                  <Label>Fonte de dados</Label>
                  <SelectNative
                    value={source}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        source: event.target.value,
                        level: "",
                        breakdown: "",
                        metrics: [],
                        connectionId: "",
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

              <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-xs">
                <label className="flex items-center gap-2 text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={inheritBrand}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        inheritBrand: event.target.checked,
                        brandId: event.target.checked ? "" : draft.brandId || "",
                        connectionId: "",
                      })
                    }
                  />
                  Usar marca global
                </label>
                {inheritBrand ? (
                  <p className="mt-1 text-[var(--text-muted)]">
                    Widget segue a marca selecionada nos filtros globais.
                  </p>
                ) : null}
              </div>

              {showBrandSelector ? (
                <div>
                  <Label>Marca do widget</Label>
                  <SelectNative
                    value={draft.brandId || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        brandId: event.target.value,
                        connectionId: "",
                      })
                    }
                  >
                    <option value="">Selecione a marca</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </SelectNative>
                </div>
              ) : null}

              <div>
                <Label>Conexao</Label>
                {inheritBrand && !globalBrandId ? (
                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                    Selecione uma marca global para usar conexoes.
                  </div>
                ) : inheritBrand ? (
                  <div className="mt-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
                    Usando conexao da marca global. Para escolher uma conta
                    especifica, desative a marca global.
                  </div>
                ) : (
                  <SelectNative
                    value={draft.connectionId || ""}
                    onChange={(event) =>
                      setDraft({ ...draft, connectionId: event.target.value })
                    }
                  >
                    <option value="">Selecione a conexao</option>
                    {availableConnections.map((connection) => (
                      <option key={connection.id} value={connection.id}>
                        {connection.displayName}
                      </option>
                    ))}
                  </SelectNative>
                )}
                {!availableConnections.length && source && brandId ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>Sem conexao para esta fonte.</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onConnect(brandId, source)}
                    >
                      Associar conta
                    </Button>
                  </div>
                ) : null}
                {inheritBrand && globalHasConnection === false && source ? (
                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                    Nenhuma conexao encontrada para a marca global.
                  </div>
                ) : null}
              </div>

              {showConnectionAlert ? (
                <AlertBanner
                  title="Importante"
                  description="Este cliente nao possui conta associada para essa fonte."
                  onDismiss={() => setAlertDismissed(true)}
                  action={
                    onConnect && canCheckConnection ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="border-red-200 text-red-600 hover:bg-white"
                        onClick={() =>
                          onConnect(inheritBrand ? globalBrandId : brandId, source)
                        }
                      >
                        Associar conta
                      </Button>
                    ) : null
                  }
                />
              ) : null}

              <div>
                <Label>Metricas</Label>
                <MetricMultiSelect
                  options={metricOptions}
                  value={selectedMetrics}
                  onChange={(next) => setDraft({ ...draft, metrics: next })}
                />
              </div>

              <div>
                <Label>Breakdown</Label>
                <SelectNative
                  value={breakdown}
                  onChange={(event) =>
                    setDraft({ ...draft, breakdown: event.target.value })
                  }
                >
                  <option value="">Sem breakdown</option>
                  {dimensions.map((dimension) => (
                    <option key={dimension.id} value={dimension.metricKey}>
                      {dimension.label}
                    </option>
                  ))}
                </SelectNative>
              </div>

              {isGa4Source && selectedMetrics.length ? (
                <div className="space-y-2">
                  {ga4CompatibilityLoading ? (
                    <div className="text-xs text-[var(--text-muted)]">
                      Validando combinacao GA4...
                    </div>
                  ) : null}
                  {ga4CompatibilityError ? (
                    <div className="text-xs text-red-600">
                      {ga4CompatibilityErrorDetails?.message ||
                        "Erro ao validar combinacao GA4."}
                    </div>
                  ) : null}
                  {hasCompatibilityIssue ? (
                    <AlertBanner
                      title="Combinacao invalida"
                      description={
                        compatibilityMessage ||
                        "As metricas e dimensoes selecionadas nao sao compativeis."
                      }
                      variant="warning"
                    />
                  ) : null}
                </div>
              ) : null}

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
                    connectionId={previewConnectionId}
                    filters={previewRange}
                    enableQuery={Boolean(
                      source && (level || widgetType === "TEXT" || widgetType === "IMAGE")
                    )}
                    forceMock={!previewConnectionId}
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

              <div>
                <Label>Filtros (JSON)</Label>
                <Textarea
                  rows={4}
                  value={filtersInput}
                  onChange={(event) => {
                    setFiltersInput(event.target.value);
                    if (filtersError) setFiltersError("");
                  }}
                  placeholder='{"country":"BR"}'
                />
                {filtersError ? (
                  <p className="mt-1 text-xs text-red-600">{filtersError}</p>
                ) : null}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              disabled={hasCompatibilityIssue}
              onClick={() => {
                let parsedFilters = {};
                if (filtersInput.trim()) {
                  try {
                    parsedFilters = JSON.parse(filtersInput);
                  } catch (err) {
                    setFiltersError("JSON invalido.");
                    return;
                  }
                }
                onSave({
                  ...draft,
                  metrics: Array.isArray(draft.metrics) ? draft.metrics : [],
                  filters: parsedFilters,
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

export default function DashboardBuilder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dashboardId } = useParams();
  const isNew = !dashboardId;
  const { width, containerRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 960,
  });

  const [name, setName] = useState("");
  const [scope, setScope] = useState("TENANT");
  const [brandId, setBrandId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [globalBrandId, setGlobalBrandId] = useState("");
  const [globalGroupId, setGlobalGroupId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compareMode, setCompareMode] = useState("NONE");
  const [compareDateFrom, setCompareDateFrom] = useState("");
  const [compareDateTo, setCompareDateTo] = useState("");
  const [layout, setLayout] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [viewMode, setViewMode] = useState("edit");
  const [configOpen, setConfigOpen] = useState(false);
  const [activeWidgetId, setActiveWidgetId] = useState(null);
  const [error, setError] = useState("");
  const [connectDialog, setConnectDialog] = useState({
    open: false,
    brandId: "",
    source: "META_ADS",
  });

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["reporting-dashboard", dashboardId],
    queryFn: () => base44.reporting.getDashboard(dashboardId),
    enabled: Boolean(dashboardId),
  });

  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["reporting-brand-groups"],
    queryFn: () => base44.reporting.listBrandGroups(),
  });

  const { data: groupMembersData } = useQuery({
    queryKey: ["reporting-brand-group-members", groupId],
    queryFn: () => base44.reporting.listBrandGroupMembers(groupId),
    enabled: Boolean(groupId),
  });

  const clients = clientsData || [];
  const groups = groupsData?.items || [];
  const groupMembers = groupMembersData?.items || [];
  const groupBrands = useMemo(
    () => groupMembers.map((member) => member.brand).filter(Boolean),
    [groupMembers]
  );

  const availableBrands = useMemo(() => {
    if (scope === "GROUP") return groupBrands;
    return clients;
  }, [scope, groupBrands, clients]);

  const activeWidget = useMemo(
    () => widgets.find((widget) => widget.id === activeWidgetId) || null,
    [widgets, activeWidgetId]
  );

  const { data: globalConnectionsData } = useQuery({
    queryKey: ["reporting-connections", globalBrandId],
    queryFn: () => base44.reporting.listConnectionsByBrand(globalBrandId),
    enabled: Boolean(globalBrandId),
  });

  const globalConnections = globalConnectionsData?.items || [];

  const brandIds = useMemo(() => {
    const ids = new Set();
    widgets.forEach((widget) => {
      const inheritBrand = widget?.inheritBrand !== false;
      const brand = inheritBrand ? globalBrandId : widget?.brandId;
      if (brand) ids.add(brand);
    });
    return Array.from(ids);
  }, [widgets, globalBrandId]);

  const connectionsQueries = useQueries({
    queries: brandIds.map((brand) => ({
      queryKey: ["reporting-connections", brand],
      queryFn: () => base44.reporting.listConnectionsByBrand(brand),
      enabled: Boolean(brand),
    })),
  });

  const connectionsByBrand = useMemo(() => {
    const map = new Map();
    brandIds.forEach((brand, index) => {
      const items = connectionsQueries[index]?.data?.items || [];
      map.set(brand, items);
    });
    return map;
  }, [brandIds, connectionsQueries]);

  useEffect(() => {
    if (!dashboard) return;
    const normalizedWidgets = normalizeWidgets(dashboard.widgetsSchema);
    setName(dashboard.name || "");
    setScope(dashboard.scope || "TENANT");
    setBrandId(dashboard.brandId || "");
    setGroupId(dashboard.groupId || "");
    setWidgets(normalizedWidgets);
    setLayout(normalizeLayout(dashboard.layoutSchema, normalizedWidgets));

    const filters = dashboard.globalFiltersSchema || {};
    const range = buildDefaultDateRange();
    setDateFrom(filters.dateFrom || range.dateFrom);
    setDateTo(filters.dateTo || range.dateTo);
    setCompareMode(filters.compareMode || "NONE");
    setCompareDateFrom(filters.compareDateFrom || "");
    setCompareDateTo(filters.compareDateTo || "");
    setGlobalBrandId(filters.brandId || "");
    setGlobalGroupId(filters.groupId || "");
  }, [dashboard]);

  useEffect(() => {
    if (!isNew || dashboardId) return;
    setName("Novo dashboard");
    setScope("TENANT");
    setBrandId("");
    setGroupId("");
    const range = buildDefaultDateRange();
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setCompareMode("NONE");
    setCompareDateFrom("");
    setCompareDateTo("");
    setGlobalBrandId("");
    setGlobalGroupId("");
    setLayout([]);
    setWidgets([]);
  }, [isNew, dashboardId]);

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

  useEffect(() => {
    if (scope === "BRAND") {
      setGlobalBrandId(brandId || "");
      setGlobalGroupId("");
    }
    if (scope === "GROUP") {
      setGlobalGroupId(groupId || "");
    }
  }, [scope, brandId, groupId]);

  const addWidget = (type) => {
    const id = createWidgetId();
    const label = WIDGET_TYPES.find((item) => item.key === type)?.label || "Widget";
    const nextWidget = {
      id,
      widgetType: type,
      title: `${label} widget`,
      source: "",
      connectionId: "",
      brandId: "",
      inheritBrand: true,
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

  const handleDuplicateWidget = (widgetId) => {
    const sourceWidget = widgets.find((widget) => widget.id === widgetId);
    if (!sourceWidget) return;
    const id = createWidgetId();
    const nextWidget = {
      ...sourceWidget,
      id,
      title: sourceWidget.title ? `${sourceWidget.title} (copia)` : "Widget (copia)",
    };
    setWidgets((prev) => [...prev, nextWidget]);
    setLayout((prev) => [...prev, createLayoutItem(id, prev)]);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (isNew) {
        return base44.reporting.createDashboard(payload);
      }
      return base44.reporting.updateDashboard(dashboardId, payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reporting-dashboards"] });
      if (isNew && data?.id) {
        navigate(`/reports/dashboards/${data.id}/edit`);
      }
    },
    onError: (err) => {
      setError(err?.message || "Erro ao salvar dashboard.");
    },
  });

  const handleSave = () => {
    setError("");
    if (!name.trim()) {
      setError("Nome do dashboard obrigatorio.");
      return;
    }
    if (scope === "BRAND" && !brandId) {
      setError("Selecione a marca do dashboard.");
      return;
    }
    if (scope === "GROUP" && !groupId) {
      setError("Selecione o grupo do dashboard.");
      return;
    }

    const payload = {
      name: name.trim(),
      scope,
      brandId: scope === "BRAND" ? brandId : null,
      groupId: scope === "GROUP" ? groupId : null,
      layoutSchema: layout,
      widgetsSchema: widgets,
      globalFiltersSchema: {
        dateFrom,
        dateTo,
        compareMode,
        compareDateFrom: compareMode === "CUSTOM" ? compareDateFrom : null,
        compareDateTo: compareMode === "CUSTOM" ? compareDateTo : null,
        brandId: scope !== "BRAND" ? globalBrandId : brandId,
        groupId: scope === "TENANT" ? globalGroupId : groupId,
      },
    };

    saveMutation.mutate(payload);
  };

  const handleConnectDialog = (nextBrandId, source) => {
    setConnectDialog({
      open: true,
      brandId: nextBrandId,
      source: source || "META_ADS",
    });
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
              Builder de dashboards
            </p>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              {isNew ? "Novo dashboard" : name || "Dashboard"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/reports/dashboards")}>
              Voltar
            </Button>
            <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-white p-1">
              <Button
                size="sm"
                variant={viewMode === "edit" ? "secondary" : "ghost"}
                onClick={() => setViewMode("edit")}
              >
                Editar
              </Button>
              <Button
                size="sm"
                variant={viewMode === "preview" ? "secondary" : "ghost"}
                onClick={() => setViewMode("preview")}
              >
                Preview
              </Button>
            </div>
            <Button onClick={() => handleSave()} disabled={saveMutation.isLoading}>
              {saveMutation.isLoading ? "Salvando..." : "Salvar"}
            </Button>
            {!isNew && dashboardId ? (
              <Button
                variant="secondary"
                onClick={() => navigate(`/reports/dashboards/${dashboardId}`)}
              >
                Visualizar
              </Button>
            ) : null}
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-[16px] border border-[var(--border)] bg-white px-4 py-4 shadow-[var(--shadow-sm)]">
              <p className="text-sm font-semibold text-[var(--text)]">Config</p>
              <div className="mt-3 space-y-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div>
                  <Label>Escopo</Label>
                  <SelectNative
                    value={scope}
                    onChange={(event) => {
                      const value = event.target.value;
                      setScope(value);
                      if (value !== "GROUP") setGroupId("");
                      if (value !== "BRAND") setBrandId("");
                    }}
                  >
                    <option value="TENANT">Tenant</option>
                    <option value="BRAND">Marca</option>
                    <option value="GROUP">Grupo</option>
                  </SelectNative>
                </div>

                {scope === "BRAND" ? (
                  <div>
                    <Label>Marca</Label>
                    <SelectNative
                      value={brandId}
                      onChange={(event) => setBrandId(event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </SelectNative>
                  </div>
                ) : null}

                {scope === "GROUP" ? (
                  <div>
                    <Label>Grupo</Label>
                    <SelectNative
                      value={groupId}
                      onChange={(event) => setGroupId(event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </SelectNative>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-[16px] border border-[var(--border)] bg-white px-4 py-4 shadow-[var(--shadow-sm)]">
              <p className="text-sm font-semibold text-[var(--text)]">
                Filtros globais
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <Label>Periodo inicial</Label>
                  <DateField value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                </div>
                <div>
                  <Label>Periodo final</Label>
                  <DateField value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                </div>
                <div>
                  <Label>Comparacao</Label>
                  <SelectNative
                    value={compareMode}
                    onChange={(event) => setCompareMode(event.target.value)}
                  >
                    {COMPARE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectNative>
                </div>
                {compareMode === "CUSTOM" ? (
                  <>
                    <div>
                      <Label>Comparar de</Label>
                      <DateField
                        value={compareDateFrom}
                        onChange={(event) => setCompareDateFrom(event.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Comparar ate</Label>
                      <DateField
                        value={compareDateTo}
                        onChange={(event) => setCompareDateTo(event.target.value)}
                      />
                    </div>
                  </>
                ) : null}

                {scope === "TENANT" ? (
                  <>
                    <div>
                      <Label>Marca global (opcional)</Label>
                      <SelectNative
                        value={globalBrandId}
                        onChange={(event) => {
                          setGlobalBrandId(event.target.value);
                          if (event.target.value) setGlobalGroupId("");
                        }}
                      >
                        <option value="">Sem marca</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </SelectNative>
                    </div>
                    <div>
                      <Label>Grupo global (opcional)</Label>
                      <SelectNative
                        value={globalGroupId}
                        onChange={(event) => {
                          setGlobalGroupId(event.target.value);
                          if (event.target.value) setGlobalBrandId("");
                        }}
                      >
                        <option value="">Sem grupo</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </SelectNative>
                    </div>
                  </>
                ) : null}

                {scope === "GROUP" && groupBrands.length ? (
                  <div>
                    <Label>Marca global (opcional)</Label>
                    <SelectNative
                      value={globalBrandId}
                      onChange={(event) => setGlobalBrandId(event.target.value)}
                    >
                      <option value="">Sem marca</option>
                      {groupBrands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </SelectNative>
                  </div>
                ) : null}
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
              isEditable={viewMode === "edit"}
              renderItem={(widget) => {
                const inheritBrand = widget?.inheritBrand !== false;
                const brand = inheritBrand ? globalBrandId : widget?.brandId;
                const connections = brand ? connectionsByBrand.get(brand) || [] : [];
                const connectionId =
                  widget?.connectionId ||
                  connections.find((item) => item.source === widget?.source)?.id ||
                  "";
                const connectHandler =
                  brand && widget?.source
                    ? () => handleConnectDialog(brand, widget?.source)
                    : null;
                const editHandler = () => {
                  setActiveWidgetId(widget.id);
                  setConfigOpen(true);
                };

                return (
                  <WidgetCard
                    widget={widget}
                    showActions={viewMode === "edit"}
                    onEdit={viewMode === "edit" ? editHandler : null}
                    onDuplicate={() => handleDuplicateWidget(widget.id)}
                    onRemove={() => handleRemoveWidget(widget.id)}
                  >
                    <WidgetRenderer
                      widget={widget}
                      connectionId={connectionId}
                      filters={{
                        dateFrom,
                        dateTo,
                        compareMode,
                        compareDateFrom,
                        compareDateTo,
                      }}
                      enableQuery
                      onConnect={connectHandler}
                      onEdit={viewMode === "edit" ? editHandler : null}
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
        scope={scope}
        brands={availableBrands}
        globalBrandId={scope === "BRAND" ? brandId : globalBrandId}
        globalConnections={globalConnections}
        onConnect={handleConnectDialog}
      />

      <ConnectDataSourceDialog
        open={connectDialog.open}
        onOpenChange={(open) => setConnectDialog((prev) => ({ ...prev, open }))}
        brandId={connectDialog.brandId}
        defaultSource={connectDialog.source}
      />
    </PageShell>
  );
}
