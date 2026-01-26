import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { getSourceMeta, getWidgetTypeMeta } from "@/components/reports/widgets/widgetMeta.js";
import {
  DASHBOARD_TEMPLATES,
  applyTemplate,
  getRecommendedPresets,
} from "@/components/reports/dashboards/dashboardTemplates.js";
import {
  createLayoutItem,
  normalizeLayout,
  normalizeWidgets,
} from "@/components/reports/dashboards/dashboardUtils.js";
import {
  filterConnected,
  hasConnectedForSource,
  pickConnectionId,
} from "@/components/reports/utils/connectionResolver.js";
import { formatTimeAgo } from "@/utils/timeAgo.js";

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
  { value: "GA4", label: "Google Analytics 4" },
  { value: "GBP", label: "Google Meu Negocio" },
  { value: "META_SOCIAL", label: "Facebook/Instagram" },
];

const COMPARE_OPTIONS = [
  { value: "NONE", label: "Sem comparacao" },
  { value: "PREVIOUS_PERIOD", label: "Periodo anterior" },
  { value: "PREVIOUS_YEAR", label: "Ano anterior" },
  { value: "CUSTOM", label: "Personalizado" },
];

const LEVEL_LABELS = {
  ACCOUNT: "Conta",
  CUSTOMER: "Conta",
  ADVERTISER: "Conta",
  CAMPAIGN: "Campanhas",
  ADSET: "Grupo de anuncios",
  AD_GROUP: "Grupo de anuncios",
  ADGROUP: "Grupo de anuncios",
  AD: "Anuncios",
  CREATIVE: "Criativos",
  PROPERTY: "Propriedade",
  PAGE: "Pagina",
};

function createWidgetId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `widget-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

function useDebouncedValue(value, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debouncedValue;
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
  const canInheritBrand = Boolean(globalBrandId);
  const effectiveInheritBrand = inheritBrand && canInheritBrand;
  const brandId = effectiveInheritBrand ? globalBrandId : draft?.brandId || "";

  useEffect(() => {
    if (!open) return;
    if (!globalBrandId && draft?.inheritBrand !== false) {
      setDraft((prev) => (prev ? { ...prev, inheritBrand: false } : prev));
    }
  }, [open, globalBrandId, draft]);

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

  const connections = useMemo(
    () => filterConnected(connectionsData?.items || []),
    [connectionsData]
  );

  const availableConnections = useMemo(() => {
    if (!source) return connections;
    return connections.filter((item) => item?.source === source);
  }, [connections, source]);

  const previewRange = useMemo(() => buildDefaultDateRange(), []);

  const previewConnectionId = useMemo(() => {
    if (!source) return "";
    if (effectiveInheritBrand) {
      return pickConnectionId({
        connections: globalConnections,
        source,
        preferredId: "",
      });
    }
    return pickConnectionId({
      connections: availableConnections,
      source,
      preferredId: draft?.connectionId || "",
    });
  }, [effectiveInheritBrand, globalConnections, availableConnections, draft, source]);

  const {
    data: ga4Metadata,
    isLoading: ga4MetadataLoading,
    isError: ga4MetadataError,
    error: ga4MetadataErrorDetails,
  } = useQuery({
    queryKey: ["ga4-reporting-metadata", previewConnectionId || "selected"],
    queryFn: () =>
      previewConnectionId
        ? base44.reporting.getGa4MetadataByConnection(previewConnectionId)
        : base44.ga4.metadata(),
    enabled: open && isGa4Source,
    retry: false,
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

  const selectedMetrics = Array.isArray(draft?.metrics) ? draft.metrics : [];
  const options =
    draft?.options && typeof draft.options === "object" ? draft.options : {};
  const globalHasConnection = canInheritBrand ? globalConnections?.length > 0 : null;

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
  const ga4CompatibilityStatus = ga4CompatibilityErrorDetails?.status || null;
  const hasCompatibilityIssue =
    isGa4Source &&
    selectedMetrics.length > 0 &&
    (ga4Compatibility?.compatible === false || ga4CompatibilityStatus === 400);
  const compatibilityMessage = [
    incompatMetrics.length ? `Metricas incompativeis: ${incompatMetrics.join(", ")}` : "",
    incompatDimensions.length
      ? `Dimensoes incompativeis: ${incompatDimensions.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const shouldBlockPreview =
    isGa4Source && selectedMetrics.length > 0 && (hasCompatibilityIssue || ga4CompatibilityError);
  const previewEnabled =
    open &&
    !shouldBlockPreview &&
    Boolean(source && (level || widgetType === "TEXT" || widgetType === "IMAGE"));

  const handleCompatibilityFix = () => {
    if (!incompatMetrics.length && !incompatDimensions.length) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const nextMetrics = Array.isArray(prev.metrics)
        ? prev.metrics.filter((metric) => !incompatMetrics.includes(metric))
        : [];
      const nextBreakdown = incompatDimensions.includes(prev.breakdown)
        ? ""
        : prev.breakdown || "";
      return {
        ...prev,
        metrics: nextMetrics,
        breakdown: nextBreakdown,
      };
    });
  };

  const showBrandSelector = scope !== "BRAND" && !effectiveInheritBrand;
  const metricOptions = useMemo(
    () =>
      metrics.map((metric) => ({
        value: metric.metricKey,
        label: metric.label || metric.metricKey,
      })),
    [metrics]
  );
  const canCheckConnection = effectiveInheritBrand
    ? Boolean(globalBrandId)
    : Boolean(brandId);
  const hasConnectionForSource = !source
    ? true
    : effectiveInheritBrand
      ? hasConnectedForSource({ connections: globalConnections, source })
      : hasConnectedForSource({ connections: availableConnections, source });
  const showConnectionAlert =
    source && canCheckConnection && !hasConnectionForSource && !alertDismissed;

  if (!draft) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="text-sm text-[var(--text-muted)]">Carregando widget...</div>
        </DialogContent>
      </Dialog>
    );
  }

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
                          {LEVEL_LABELS[item] || item}
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
                    checked={effectiveInheritBrand}
                    disabled={!canInheritBrand}
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
                {!globalBrandId ? (
                  <p className="mt-1 text-[var(--text-muted)]">
                    Marca global nao definida. Selecione no painel do dashboard ou
                    desative para escolher uma marca do widget.
                  </p>
                ) : effectiveInheritBrand ? (
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
                <Label>Conta</Label>
                {effectiveInheritBrand ? (
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
                    disabled={!brandId}
                  >
                    <option value="">Selecione a conexao</option>
                    {availableConnections.map((connection) => (
                      <option key={connection.id} value={connection.id}>
                        {connection.displayName}
                      </option>
                    ))}
                  </SelectNative>
                )}
                {!effectiveInheritBrand && !brandId ? (
                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                    Selecione uma marca para listar conexoes.
                  </div>
                ) : null}
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
                {effectiveInheritBrand && globalHasConnection === false && source ? (
                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                    Nenhuma conexao encontrada para a marca global.
                  </div>
                ) : null}
              </div>

              {showConnectionAlert ? (
                <AlertBanner
                  title="Importante"
                  description="Este cliente nao possui conta associada para essa fonte de dados."
                  onDismiss={() => setAlertDismissed(true)}
                  action={
                    onConnect && canCheckConnection ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="border-red-200 text-red-600 hover:bg-white"
                        onClick={() =>
                          onConnect(
                            effectiveInheritBrand ? globalBrandId : brandId,
                            source
                          )
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
                {isGa4Source && (ga4MetadataLoading || ga4MetadataError) ? (
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {ga4MetadataLoading
                      ? "Carregando metadados do GA4..."
                      : ga4MetadataErrorDetails?.data?.error ||
                        ga4MetadataErrorDetails?.message ||
                        "Nao foi possivel carregar todas as metricas do GA4."}
                  </div>
                ) : null}
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
                    <option
                      key={dimension.metricKey || dimension.dimensionKey || dimension.id}
                      value={dimension.metricKey}
                    >
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
                      {ga4CompatibilityErrorDetails?.data?.error ||
                        ga4CompatibilityErrorDetails?.message ||
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
                      action={
                        incompatMetrics.length || incompatDimensions.length ? (
                          <Button size="sm" variant="secondary" onClick={handleCompatibilityFix}>
                            Remover incompatíveis
                          </Button>
                        ) : null
                      }
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
                  {shouldBlockPreview ? (
                    <div className="rounded-[12px] border border-dashed border-[var(--border)] bg-white px-4 py-4 text-center text-xs text-[var(--text-muted)]">
                      Ajuste as metricas ou o breakdown para gerar o preview.
                    </div>
                  ) : (
                    <WidgetRenderer
                      widget={draft}
                      connectionId={previewConnectionId}
                      filters={previewRange}
                      enableQuery={previewEnabled}
                      forceMock={!previewConnectionId}
                      queryKeyPrefix="preview"
                      staleTime={120 * 1000}
                      variant="mini"
                    />
                  )}
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
                    Ocultar resultados com 0 (nao oculta com comparacao ativa)
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
                  inheritBrand: effectiveInheritBrand,
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
  const [widgetStatusMap, setWidgetStatusMap] = useState({});
  const [viewMode, setViewMode] = useState("edit");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshOption, setAutoRefreshOption] = useState("OFF");
  const [lastDashboardUpdatedAt, setLastDashboardUpdatedAt] = useState(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(isNew);
  const [lastSelectedSource, setLastSelectedSource] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [activeWidgetId, setActiveWidgetId] = useState(null);
  const [error, setError] = useState("");
  const [connectDialog, setConnectDialog] = useState({
    open: false,
    brandId: "",
    source: "META_ADS",
  });

  const debouncedDateFrom = useDebouncedValue(dateFrom);
  const debouncedDateTo = useDebouncedValue(dateTo);
  const debouncedCompareMode = useDebouncedValue(compareMode);
  const debouncedCompareDateFrom = useDebouncedValue(compareDateFrom);
  const debouncedCompareDateTo = useDebouncedValue(compareDateTo);

  const debouncedFilters = useMemo(
    () => ({
      dateFrom: debouncedDateFrom,
      dateTo: debouncedDateTo,
      compareMode: debouncedCompareMode,
      compareDateFrom: debouncedCompareDateFrom,
      compareDateTo: debouncedCompareDateTo,
    }),
    [
      debouncedDateFrom,
      debouncedDateTo,
      debouncedCompareMode,
      debouncedCompareDateFrom,
      debouncedCompareDateTo,
    ]
  );

  const autoRefreshMs = useMemo(() => {
    if (autoRefreshOption === "5m") return 5 * 60 * 1000;
    if (autoRefreshOption === "15m") return 15 * 60 * 1000;
    return 0;
  }, [autoRefreshOption]);

  useEffect(() => {
    if (connectDialog.open || !connectDialog.brandId) return;
    const refreshConnections = async () => {
      queryClient.invalidateQueries({
        queryKey: ["reporting-connections", connectDialog.brandId],
      });
      await queryClient.refetchQueries({
        queryKey: ["reporting-connections", connectDialog.brandId],
        type: "active",
      });
    };
    refreshConnections();
  }, [connectDialog.open, connectDialog.brandId, queryClient]);

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

  const globalConnections = filterConnected(globalConnectionsData?.items || []);

  const brandIds = useMemo(() => {
    const ids = new Set();
    widgets.forEach((widget) => {
      const inheritBrand = widget?.inheritBrand !== false;
      const effectiveInheritBrand = inheritBrand && Boolean(globalBrandId);
      const brand = effectiveInheritBrand ? globalBrandId : widget?.brandId;
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
    setShowTemplatePicker(true);
    setLastSelectedSource("");
  }, [isNew, dashboardId]);

  useEffect(() => {
    if (!isNew) setShowTemplatePicker(false);
  }, [isNew]);

  useEffect(() => {
    if (!autoRefreshMs) return;
    const interval = setInterval(() => {
      if (!isInteracting) {
        handleRefreshAll();
      }
    }, autoRefreshMs);
    return () => clearInterval(interval);
  }, [autoRefreshMs, handleRefreshAll, isInteracting]);

  useEffect(() => {
    if (!tvMode) return;
    if (viewMode !== "preview") setViewMode("preview");
  }, [tvMode, viewMode]);

  useEffect(() => {
    if (!tvMode) return;
    if (typeof document === "undefined") return;
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setTvMode(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    if (document.documentElement?.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [tvMode]);

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

  const addWidget = useCallback(
    (type) => {
      const id = createWidgetId();
      const label = WIDGET_TYPES.find((item) => item.key === type)?.label || "Widget";
      const nextWidget = {
        id,
        widgetType: type,
        title: `${label} widget`,
        source: "",
        connectionId: "",
        brandId: "",
        inheritBrand: scope === "BRAND" || Boolean(globalBrandId),
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
    },
    [globalBrandId, scope]
  );

  const handleRemoveWidget = useCallback((widgetId) => {
    setWidgets((prev) => prev.filter((widget) => widget.id !== widgetId));
    setLayout((prev) => prev.filter((item) => item.i !== widgetId));
  }, []);

  const handleDuplicateWidget = useCallback(
    (widgetId) => {
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
    },
    [widgets]
  );

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

  const handleConnectDialog = useCallback((nextBrandId, source) => {
    setConnectDialog({
      open: true,
      brandId: nextBrandId,
      source: source || "META_ADS",
    });
  }, []);

  const handleRefreshAll = useCallback(async () => {
    if (!widgets.length || isRefreshing) return;
    const widgetIds = new Set(widgets.map((widget) => String(widget.id)));
    const predicate = (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key[0] !== "widgetData") return false;
      return widgetIds.has(String(key[1] || ""));
    };

    try {
      setIsRefreshing(true);
      queryClient.invalidateQueries({ predicate });
      await queryClient.refetchQueries({ predicate, type: "active" });
      setLastDashboardUpdatedAt(Date.now());
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, queryClient, widgets]);

  const recommendedSource = useMemo(() => {
    if (lastSelectedSource) return lastSelectedSource;
    const counts = new Map();
    widgets.forEach((widget) => {
      if (!widget?.source) return;
      counts.set(widget.source, (counts.get(widget.source) || 0) + 1);
    });
    let topSource = "";
    let topCount = 0;
    counts.forEach((count, source) => {
      if (count > topCount) {
        topCount = count;
        topSource = source;
      }
    });
    return topSource;
  }, [lastSelectedSource, widgets]);

  const recommendedPresets = useMemo(
    () => getRecommendedPresets(recommendedSource),
    [recommendedSource]
  );
  const hasRecommendedPresets = Boolean(
    recommendedPresets?.kpis?.length || recommendedPresets?.charts?.length
  );
  const recommendedSourceMeta = useMemo(
    () => getSourceMeta(recommendedSource),
    [recommendedSource]
  );
  const lastUpdatedLabel = useMemo(
    () => (lastDashboardUpdatedAt ? formatTimeAgo(lastDashboardUpdatedAt) : ""),
    [lastDashboardUpdatedAt]
  );

  const handleApplyTemplate = useCallback(
    (templateId) => {
      const result = applyTemplate(templateId, {
        scope,
        brandId,
        groupId,
        globalBrandId,
        globalGroupId,
      });
      setName(result.name || "Novo dashboard");
      setWidgets(result.widgets || []);
      setLayout(result.layout || []);
      setDateFrom(result.globalFiltersDefaults?.dateFrom || "");
      setDateTo(result.globalFiltersDefaults?.dateTo || "");
      setCompareMode(result.globalFiltersDefaults?.compareMode || "NONE");
      setCompareDateFrom(result.globalFiltersDefaults?.compareDateFrom || "");
      setCompareDateTo(result.globalFiltersDefaults?.compareDateTo || "");
      setShowTemplatePicker(false);
      const primarySource =
        result.widgets?.find((item) => item?.source)?.source || "";
      if (primarySource) setLastSelectedSource(primarySource);
    },
    [scope, brandId, groupId, globalBrandId, globalGroupId]
  );

  const buildPresetWidgets = useCallback(
    (presetList) => {
      if (!Array.isArray(presetList) || !presetList.length) return [];
      const inheritBrand = scope === "BRAND" || Boolean(globalBrandId);
      const baseWidgets = presetList.map((preset) => ({
        ...preset,
        id: createWidgetId(),
        connectionId: "",
        brandId: "",
        inheritBrand,
        filters: preset.filters || {},
        options: preset.options || {},
      }));
      return normalizeWidgets(baseWidgets);
    },
    [scope, globalBrandId]
  );

  const addPresetWidgets = useCallback(
    (presetList) => {
      const normalized = buildPresetWidgets(presetList);
      if (!normalized.length) return;
      setWidgets((prev) => [...prev, ...normalized]);
      setLayout((prev) => {
        let next = Array.isArray(prev) ? [...prev] : [];
        normalized.forEach((widget) => {
          next = [...next, createLayoutItem(widget.id, next)];
        });
        return next;
      });
      setShowTemplatePicker(false);
      if (normalized[0]?.source) {
        setLastSelectedSource(normalized[0].source);
      }
    },
    [buildPresetWidgets]
  );

  const handleStatusChange = useCallback((widgetId, nextStatus) => {
    if (!widgetId) return;
    setWidgetStatusMap((prev) => {
      if (prev[widgetId] === nextStatus) return prev;
      return { ...prev, [widgetId]: nextStatus };
    });
    if (nextStatus === "LIVE") {
      setLastDashboardUpdatedAt(Date.now());
    }
  }, []);

  const handleLayoutChange = useCallback((nextLayout) => {
    setLayout(nextLayout);
  }, []);

  const handleInteractionStart = useCallback(() => {
    setIsInteracting(true);
  }, []);

  const handleInteractionStop = useCallback(() => {
    setIsInteracting(false);
  }, []);

  const renderCanvasItem = useCallback(
    (widget) => {
      const inheritBrand = widget?.inheritBrand !== false;
      const effectiveInheritBrand = inheritBrand && Boolean(globalBrandId);
      const brand = effectiveInheritBrand ? globalBrandId : widget?.brandId;
      const rawConnections = brand ? connectionsByBrand.get(brand) || [] : [];
      const connections = filterConnected(rawConnections);
      const connectionId = pickConnectionId({
        connections,
        source: widget?.source,
        preferredId: !effectiveInheritBrand ? widget?.connectionId : "",
      });
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
          showActions={viewMode === "edit" && !tvMode}
          status={widgetStatusMap[widget.id]}
          onEdit={viewMode === "edit" && !tvMode ? editHandler : null}
          onDuplicate={viewMode === "edit" && !tvMode ? () => handleDuplicateWidget(widget.id) : null}
          onRemove={viewMode === "edit" && !tvMode ? () => handleRemoveWidget(widget.id) : null}
        >
          <WidgetRenderer
            widget={widget}
            connectionId={connectionId}
            filters={debouncedFilters}
            enableQuery
            onConnect={connectHandler}
            onEdit={viewMode === "edit" ? editHandler : null}
            onStatusChange={(nextStatus) => handleStatusChange(widget.id, nextStatus)}
          />
        </WidgetCard>
      );
    },
    [
      connectionsByBrand,
      debouncedFilters,
      globalBrandId,
      handleConnectDialog,
      handleDuplicateWidget,
      handleRemoveWidget,
      handleStatusChange,
      viewMode,
      tvMode,
      widgetStatusMap,
    ]
  );

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
            {!tvMode ? (
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
            ) : null}
            <Button
              variant={tvMode ? "secondary" : "ghost"}
              onClick={() => setTvMode((prev) => !prev)}
            >
              {tvMode ? "Sair do modo TV" : "Modo TV"}
            </Button>
            {!tvMode ? (
              <>
                <div className="min-w-[150px]">
                  <SelectNative
                    value={autoRefreshOption}
                    onChange={(event) => setAutoRefreshOption(event.target.value)}
                  >
                    <option value="OFF">Auto-refresh: OFF</option>
                    <option value="5m">Auto-refresh: 5m</option>
                    <option value="15m">Auto-refresh: 15m</option>
                  </SelectNative>
                </div>
                <Button
                  variant="secondary"
                  onClick={handleRefreshAll}
                  disabled={isRefreshing || !widgets.length}
                >
                  {isRefreshing ? "Atualizando..." : "Atualizar dados"}
                </Button>
                {lastUpdatedLabel ? (
                  <span className="text-xs text-[var(--text-muted)]">
                    {lastUpdatedLabel}
                  </span>
                ) : null}
                <Button onClick={() => handleSave()} disabled={saveMutation.isLoading}>
                  {saveMutation.isLoading ? "Salvando..." : "Salvar"}
                </Button>
              </>
            ) : null}
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

        {isNew && showTemplatePicker ? (
          <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Comece com um template
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Escolha uma estrutura pronta e personalize depois.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setShowTemplatePicker(false)}>
                Comecar do zero
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {DASHBOARD_TEMPLATES.map((template) => (
                <div
                  key={template.id}
                  className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 shadow-[var(--shadow-sm)]"
                >
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {template.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {template.description}
                  </p>
                  <Button
                    size="sm"
                    className="mt-4"
                    onClick={() => handleApplyTemplate(template.id)}
                  >
                    Usar template
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tvMode ? (
          <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-5 shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Modo TV
                </p>
                <p className="text-lg font-semibold text-[var(--text)]">{name || "Dashboard"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {lastUpdatedLabel ? (
                  <span className="text-xs text-[var(--text-muted)]">{lastUpdatedLabel}</span>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleRefreshAll}
                  disabled={isRefreshing || !widgets.length}
                >
                  {isRefreshing ? "Atualizando..." : "Atualizar dados"}
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <div>
                <Label>Auto-refresh</Label>
                <SelectNative
                  value={autoRefreshOption}
                  onChange={(event) => setAutoRefreshOption(event.target.value)}
                >
                  <option value="OFF">OFF</option>
                  <option value="5m">5 minutos</option>
                  <option value="15m">15 minutos</option>
                </SelectNative>
              </div>
            </div>
            {compareMode === "CUSTOM" ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
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
              </div>
            ) : null}
          </section>
        ) : null}

        <div className={tvMode ? "grid gap-6" : "grid gap-6 lg:grid-cols-[280px_1fr]"}>
          {!tvMode ? <aside className="space-y-4">
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

            {hasRecommendedPresets ? (
              <div className="rounded-[16px] border border-[var(--border)] bg-white px-4 py-4 shadow-[var(--shadow-sm)]">
                <p className="text-sm font-semibold text-[var(--text)]">Recomendados</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {recommendedSourceMeta?.label
                    ? `Sugestoes para ${recommendedSourceMeta.label}.`
                    : "Sugestoes baseadas na fonte principal."}
                </p>
                <div className="mt-3 grid gap-2">
                  {recommendedPresets?.kpis?.length ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="justify-start"
                      onClick={() => addPresetWidgets(recommendedPresets.kpis)}
                    >
                      Adicionar KPIs essenciais
                    </Button>
                  ) : null}
                  {recommendedPresets?.charts?.length ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="justify-start"
                      onClick={() => addPresetWidgets(recommendedPresets.charts)}
                    >
                      Adicionar graficos essenciais
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

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
          </aside> : null}

          <section className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
            <DashboardCanvas
              layout={layout}
              items={widgets}
              width={width}
              containerRef={containerRef}
              onLayoutChange={handleLayoutChange}
              isEditable={viewMode === "edit"}
              renderItem={renderCanvasItem}
              onDragStart={handleInteractionStart}
              onDragStop={handleInteractionStop}
              onResizeStart={handleInteractionStart}
              onResizeStop={handleInteractionStop}
            />
          </section>
        </div>
      </div>

      <WidgetConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        widget={activeWidget}
        onSave={(updated) => {
          if (updated?.source) setLastSelectedSource(updated.source);
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
