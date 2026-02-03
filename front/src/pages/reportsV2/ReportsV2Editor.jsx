import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useContainerWidth } from "react-grid-layout";
import {
  ArrowLeft,
  Plus,
  Copy,
  Trash2,
  Eye,
  Pencil,
  Save,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import DashboardCanvas from "@/components/reports/widgets/DashboardCanvas.jsx";
import DashboardRenderer from "@/components/reportsV2/DashboardRenderer.jsx";
import GlobalFiltersBar from "@/components/reportsV2/GlobalFiltersBar.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.jsx";
import { Checkbox } from "@/components/ui/checkbox.jsx";
import { cn } from "@/utils/classnames.js";
import { deriveThemeColors } from "@/utils/theme.js";
import { base44 } from "@/apiClient/base44Client";

const DEFAULT_LAYOUT = {
  theme: {
    mode: "light",
    brandColor: "#F59E0B",
    accentColor: "#22C55E",
    bg: "#FFFFFF",
    text: "#0F172A",
    mutedText: "#64748B",
    cardBg: "#FFFFFF",
    border: "#E2E8F0",
    radius: 16,
  },
  globalFilters: {
    dateRange: { preset: "last_7_days" },
    platforms: [],
    accounts: [],
    compareTo: null,
    autoRefreshSec: 0,
  },
  widgets: [],
};

const WIDGET_TYPES = [
  { value: "kpi", label: "KPI" },
  { value: "timeseries", label: "Time series" },
  { value: "bar", label: "Bar" },
  { value: "table", label: "Table" },
  { value: "pie", label: "Pie" },
];

const METRIC_OPTIONS = [
  { value: "spend", label: "Spend" },
  { value: "impressions", label: "Impressions" },
  { value: "clicks", label: "Clicks" },
  { value: "ctr", label: "CTR" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpa", label: "CPA" },
  { value: "conversions", label: "Conversions" },
  { value: "revenue", label: "Revenue" },
  { value: "roas", label: "ROAS" },
  { value: "sessions", label: "Sessions" },
  { value: "leads", label: "Leads" },
];

const DIMENSION_OPTIONS = [
  { value: "none", label: "Nenhuma" },
  { value: "date", label: "Data" },
  { value: "platform", label: "Plataforma" },
  { value: "account_id", label: "Conta" },
  { value: "campaign_id", label: "Campanha" },
];

const FILTER_FIELDS = [
  { value: "platform", label: "Plataforma" },
  { value: "account_id", label: "Conta" },
  { value: "campaign_id", label: "Campanha" },
];

const FILTER_OPERATORS = [
  { value: "eq", label: "Igual" },
  { value: "in", label: "Contem" },
];

const FORMAT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "currency", label: "Moeda" },
  { value: "percent", label: "Percentual" },
  { value: "compact", label: "Compacto" },
];

const WIDGET_PRESETS = {
  kpi: {
    title: "KPI",
    layout: { w: 3, h: 3, minW: 2, minH: 2 },
    query: { metrics: ["spend"], dimensions: [] },
  },
  timeseries: {
    title: "Serie temporal",
    layout: { w: 6, h: 5, minW: 3, minH: 3 },
    query: { metrics: ["spend"], dimensions: ["date"] },
  },
  bar: {
    title: "Barra",
    layout: { w: 6, h: 5, minW: 3, minH: 3 },
    query: { metrics: ["spend"], dimensions: ["platform"] },
  },
  table: {
    title: "Tabela",
    layout: { w: 12, h: 6, minW: 4, minH: 3 },
    query: { metrics: ["spend"], dimensions: ["campaign_id"] },
  },
  pie: {
    title: "Pie",
    layout: { w: 4, h: 4, minW: 3, minH: 3 },
    query: { metrics: ["spend"], dimensions: ["platform"] },
  },
};

function generateUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}

function buildThemeStyle(layout) {
  const theme = layout?.theme || DEFAULT_LAYOUT.theme;
  const colors = deriveThemeColors({
    primary: theme.brandColor,
    accent: theme.accentColor,
  });

  return {
    "--background": theme.bg || "#FFFFFF",
    "--surface": theme.cardBg || "#FFFFFF",
    "--surface-muted": "#F8FAFC",
    "--border": theme.border || "#E2E8F0",
    "--text": theme.text || "#0F172A",
    "--text-muted": theme.mutedText || "#64748B",
    "--primary": colors.primary,
    "--primary-dark": colors.primaryDark,
    "--primary-light": colors.primaryLight,
    "--accent": colors.accent,
    "--shadow-sm": "0 2px 6px rgba(15, 23, 42, 0.08)",
    "--shadow-md": "0 18px 32px rgba(15, 23, 42, 0.12)",
    "--radius-card": "16px",
    "--radius-button": "16px",
    "--radius-input": "12px",
  };
}

function mergeLayoutDefaults(layout) {
  if (!layout) return DEFAULT_LAYOUT;
  return {
    theme: {
      ...DEFAULT_LAYOUT.theme,
      ...(layout.theme || {}),
    },
    globalFilters: {
      ...DEFAULT_LAYOUT.globalFilters,
      ...(layout.globalFilters || {}),
      dateRange: {
        ...DEFAULT_LAYOUT.globalFilters.dateRange,
        ...(layout.globalFilters?.dateRange || {}),
      },
    },
    widgets: Array.isArray(layout.widgets) ? layout.widgets : [],
  };
}

function buildInitialFilters(layout) {
  const base = {
    dateRange: { preset: "last_7_days" },
    platforms: [],
    accounts: [],
    compareTo: null,
    autoRefreshSec: 0,
  };
  const globalFilters = layout?.globalFilters || {};
  return {
    ...base,
    ...globalFilters,
    dateRange: {
      ...base.dateRange,
      ...(globalFilters.dateRange || {}),
    },
  };
}

function getNextWidgetPosition(widgets) {
  if (!widgets.length) return { x: 0, y: 0 };
  const maxY = widgets.reduce((acc, widget) => {
    const layout = widget.layout || {};
    const y = Number(layout.y || 0) + Number(layout.h || 0);
    return Math.max(acc, y);
  }, 0);
  return { x: 0, y: maxY };
}

function normalizeLayoutValue(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric));
}

function sanitizeLayoutForSave(layout) {
  const merged = mergeLayoutDefaults(layout);
  return {
    theme: merged.theme,
    globalFilters: merged.globalFilters,
    widgets: merged.widgets.map((widget) => {
      const metrics = Array.isArray(widget?.query?.metrics)
        ? widget.query.metrics.filter(Boolean)
        : [];
      const dimensions = Array.isArray(widget?.query?.dimensions)
        ? widget.query.dimensions.filter(Boolean)
        : [];
      const filters = Array.isArray(widget?.query?.filters)
        ? widget.query.filters.map((filter) => {
            const op = filter?.op || "eq";
            let value = filter?.value ?? "";
            if (op === "in") {
              if (Array.isArray(value)) {
                value = value.map((entry) => String(entry).trim()).filter(Boolean);
              } else {
                value = String(value)
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean);
              }
            } else if (Array.isArray(value)) {
              value = value[0] ? String(value[0]) : "";
            } else {
              value = String(value);
            }
            return {
              field: filter?.field || "platform",
              op,
              value,
            };
          })
        : [];

      const layoutValue = widget.layout || {};
      const w = normalizeLayoutValue(layoutValue.w, 4) || 4;
      const h = normalizeLayoutValue(layoutValue.h, 3) || 3;
      const minW = Math.max(1, normalizeLayoutValue(layoutValue.minW, 2));
      const minH = Math.max(1, normalizeLayoutValue(layoutValue.minH, 2));

      return {
        id: widget.id,
        type: widget.type || "kpi",
        title: String(widget.title || "Widget"),
        layout: {
          x: normalizeLayoutValue(layoutValue.x, 0),
          y: normalizeLayoutValue(layoutValue.y, 0),
          w,
          h,
          minW: Math.min(minW, w),
          minH: Math.min(minH, h),
        },
        query: {
          metrics,
          dimensions,
          filters,
        },
        viz: {
          variant: widget?.viz?.variant || "default",
          showLegend: widget?.viz?.showLegend !== false,
          format: widget?.viz?.format || "auto",
          options: widget?.viz?.options || {},
        },
      };
    }),
  };
}

function validateLayout(layout) {
  const issues = [];
  const widgetIssues = {};

  (layout?.widgets || []).forEach((widget) => {
    const errors = [];
    const metrics = Array.isArray(widget?.query?.metrics)
      ? widget.query.metrics.filter(Boolean)
      : [];
    const dimensions = Array.isArray(widget?.query?.dimensions)
      ? widget.query.dimensions.filter(Boolean)
      : [];

    if (!widget?.title || !String(widget.title).trim()) {
      errors.push("Titulo obrigatorio");
    }

    if (!metrics.length) {
      errors.push("Selecione pelo menos uma metrica");
    }

    if (widget?.type === "kpi" && metrics.length > 1) {
      errors.push("KPI aceita apenas 1 metrica");
    }

    if (widget?.type === "kpi") {
      if (dimensions.length > 1) {
        errors.push("KPI aceita no maximo 1 dimensao");
      }
      if (dimensions.length === 1 && dimensions[0] !== "date") {
        errors.push("KPI com dimensao deve usar date");
      }
    }

    if (widget?.type === "timeseries") {
      if (dimensions.length !== 1 || dimensions[0] !== "date") {
        errors.push("Time series exige dimensao date");
      }
    }

    if (widget?.type === "bar" || widget?.type === "pie") {
      if (dimensions.length !== 1 || dimensions[0] === "date") {
        errors.push("Grafico exige uma dimensao nao-date");
      }
    }

    const filters = Array.isArray(widget?.query?.filters)
      ? widget.query.filters
      : [];
    filters.forEach((filter) => {
      if (!filter?.field || !filter?.op) {
        errors.push("Filtro incompleto");
        return;
      }
      const value = filter.value;
      if (filter.op === "in") {
        const values = Array.isArray(value) ? value : [];
        if (!values.length) {
          errors.push("Filtro IN exige valores");
        }
      } else if (!value || !String(value).trim()) {
        errors.push("Filtro EQ exige valor");
      }
    });

    if (errors.length) {
      widgetIssues[widget.id] = errors;
      errors.forEach((message) => issues.push({ widgetId: widget.id, message }));
    }
  });

  return { issues, widgetIssues };
}

function formatFilterValue(filter) {
  if (Array.isArray(filter?.value)) {
    return filter.value.join(", ");
  }
  return filter?.value ? String(filter.value) : "";
}

function buildWidgetSummary(widget) {
  const metrics = Array.isArray(widget?.query?.metrics)
    ? widget.query.metrics
    : [];
  const dimensions = Array.isArray(widget?.query?.dimensions)
    ? widget.query.dimensions
    : [];

  const metricLabel = metrics.length ? metrics.join(", ") : "Sem metricas";
  const dimensionLabel = dimensions.length ? dimensions.join(", ") : "Sem dimensao";
  return `${metricLabel} • ${dimensionLabel}`;
}

function EditorWidgetCard({
  widget,
  selected,
  hasErrors,
  onSelect,
  onDuplicate,
  onRemove,
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(widget.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect(widget.id);
      }}
      className={cn(
        "group flex h-full flex-col justify-between rounded-[16px] border bg-white p-4 text-left shadow-[var(--shadow-sm)] transition",
        selected
          ? "border-[var(--primary)] ring-2 ring-[var(--primary-light)]"
          : "border-[var(--border)] hover:border-slate-300",
        hasErrors && "border-rose-300 ring-2 ring-rose-200"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">
            {widget.title || "Widget"}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
            {String(widget.type || "").toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate(widget.id);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-muted)] transition hover:border-slate-300 hover:text-[var(--text)]"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(widget.id);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-rose-200 text-rose-500 transition hover:border-rose-300"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 text-xs text-[var(--text-muted)]">
        {buildWidgetSummary(widget)}
      </div>
    </div>
  );
}

export default function ReportsV2Editor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { width, containerRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 960,
  });

  const [layoutJson, setLayoutJson] = React.useState(DEFAULT_LAYOUT);
  const [selectedWidgetId, setSelectedWidgetId] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState("data");
  const [previewMode, setPreviewMode] = React.useState(false);
  const [showAddMenu, setShowAddMenu] = React.useState(false);
  const [previewFilters, setPreviewFilters] = React.useState(
    buildInitialFilters(DEFAULT_LAYOUT)
  );
  const [actionMessage, setActionMessage] = React.useState(null);
  const [showValidation, setShowValidation] = React.useState(false);
  const addMenuRef = React.useRef(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["reportsV2-dashboard", id],
    queryFn: () => base44.reportsV2.getDashboard(id),
  });

  const dashboard = data || null;
  const layoutFromApi =
    dashboard?.latestVersion?.layoutJson ||
    dashboard?.publishedVersion?.layoutJson ||
    null;

  React.useEffect(() => {
    if (!layoutFromApi) return;
    const merged = mergeLayoutDefaults(layoutFromApi);
    setLayoutJson(merged);
    setPreviewFilters(buildInitialFilters(merged));
    if (merged.widgets.length) {
      setSelectedWidgetId(merged.widgets[0].id);
    }
  }, [layoutFromApi]);

  React.useEffect(() => {
    if (!showAddMenu) return;
    const handleClick = (event) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target)) {
        setShowAddMenu(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [showAddMenu]);

  const validation = React.useMemo(
    () => validateLayout(layoutJson),
    [layoutJson]
  );
  const hasValidationErrors = validation.issues.length > 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = sanitizeLayoutForSave(layoutJson);
      return base44.reportsV2.createDashboardVersion(id, { layoutJson: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      setActionMessage({
        type: "success",
        text: "Rascunho salvo com sucesso.",
      });
    },
    onError: () => {
      setActionMessage({
        type: "error",
        text: "Nao foi possivel salvar o rascunho.",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const payload = sanitizeLayoutForSave(layoutJson);
      const version = await base44.reportsV2.createDashboardVersion(id, {
        layoutJson: payload,
      });
      return base44.reportsV2.publishDashboard(id, { versionId: version.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      setActionMessage({
        type: "success",
        text: "Dashboard publicado com sucesso.",
      });
    },
    onError: () => {
      setActionMessage({
        type: "error",
        text: "Nao foi possivel publicar.",
      });
    },
  });

  const selectedWidget = layoutJson.widgets.find(
    (widget) => widget.id === selectedWidgetId
  );

  const rglLayout = React.useMemo(() => {
    return layoutJson.widgets.map((widget) => {
      const layout = widget.layout || {};
      return {
        i: widget.id,
        x: normalizeLayoutValue(layout.x, 0),
        y: normalizeLayoutValue(layout.y, 0),
        w: Math.max(1, normalizeLayoutValue(layout.w, 4)),
        h: Math.max(1, normalizeLayoutValue(layout.h, 3)),
        minW: Math.max(1, normalizeLayoutValue(layout.minW, 2)),
        minH: Math.max(1, normalizeLayoutValue(layout.minH, 2)),
      };
    });
  }, [layoutJson.widgets]);

  const updateWidget = React.useCallback((widgetId, updater) => {
    setLayoutJson((prev) => {
      const nextWidgets = prev.widgets.map((widget) => {
        if (widget.id !== widgetId) return widget;
        const next = typeof updater === "function" ? updater(widget) : updater;
        return { ...widget, ...next };
      });
      return { ...prev, widgets: nextWidgets };
    });
  }, []);

  const handleLayoutChange = React.useCallback((nextLayout) => {
    setLayoutJson((prev) => {
      const nextWidgets = prev.widgets.map((widget) => {
        const next = nextLayout.find((item) => item.i === widget.id);
        if (!next) return widget;
        return {
          ...widget,
          layout: {
            ...widget.layout,
            x: next.x,
            y: next.y,
            w: next.w,
            h: next.h,
            minW: next.minW || widget.layout?.minW || 2,
            minH: next.minH || widget.layout?.minH || 2,
          },
        };
      });
      return { ...prev, widgets: nextWidgets };
    });
  }, []);

  const handleAddWidget = (type) => {
    const preset = WIDGET_PRESETS[type] || WIDGET_PRESETS.kpi;
    const position = getNextWidgetPosition(layoutJson.widgets);
    const newWidget = {
      id: generateUuid(),
      type,
      title: preset.title,
      layout: {
        x: position.x,
        y: position.y,
        w: preset.layout.w,
        h: preset.layout.h,
        minW: preset.layout.minW,
        minH: preset.layout.minH,
      },
      query: {
        metrics: preset.query.metrics,
        dimensions: preset.query.dimensions,
        filters: [],
      },
      viz: {
        variant: "default",
        showLegend: true,
        format: "auto",
        options: {},
      },
    };
    setLayoutJson((prev) => ({
      ...prev,
      widgets: [...prev.widgets, newWidget],
    }));
    setSelectedWidgetId(newWidget.id);
    setShowAddMenu(false);
  };

  const handleDuplicateWidget = (widgetId) => {
    const widget = layoutJson.widgets.find((item) => item.id === widgetId);
    if (!widget) return;
    const position = getNextWidgetPosition(layoutJson.widgets);
    const clone = {
      ...widget,
      id: generateUuid(),
      title: `${widget.title || "Widget"} (copia)`,
      layout: {
        ...widget.layout,
        x: position.x,
        y: position.y,
      },
    };
    setLayoutJson((prev) => ({
      ...prev,
      widgets: [...prev.widgets, clone],
    }));
    setSelectedWidgetId(clone.id);
  };

  const handleRemoveWidget = (widgetId) => {
    setLayoutJson((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((widget) => widget.id !== widgetId),
    }));
    if (selectedWidgetId === widgetId) {
      setSelectedWidgetId(null);
    }
  };

  const handleChangeWidgetType = (nextType) => {
    if (!selectedWidget) return;
    updateWidget(selectedWidget.id, (widget) => {
      const metrics = widget.query?.metrics?.length
        ? widget.query.metrics
        : WIDGET_PRESETS[nextType]?.query?.metrics || ["spend"];
      let dimensions = widget.query?.dimensions || [];
      if (nextType === "timeseries") {
        dimensions = ["date"];
      }
      if (nextType === "bar" || nextType === "pie") {
        if (dimensions.length !== 1 || dimensions[0] === "date") {
          dimensions = ["platform"];
        }
      }
      if (nextType === "kpi") {
        if (dimensions.length > 1) dimensions = dimensions.slice(0, 1);
        if (dimensions.length === 1 && dimensions[0] !== "date") {
          dimensions = [];
        }
      }
      return {
        ...widget,
        type: nextType,
        query: {
          ...widget.query,
          metrics,
          dimensions,
        },
      };
    });
  };

  const handleToggleMetric = (metric) => {
    if (!selectedWidget) return;
    updateWidget(selectedWidget.id, (widget) => {
      const current = Array.isArray(widget.query?.metrics)
        ? widget.query.metrics
        : [];
      if (widget.type === "kpi") {
        return {
          ...widget,
          query: {
            ...widget.query,
            metrics: [metric],
          },
        };
      }
      const next = current.includes(metric)
        ? current.filter((item) => item !== metric)
        : [...current, metric];
      return {
        ...widget,
        query: {
          ...widget.query,
          metrics: next,
        },
      };
    });
  };

  const handleDimensionChange = (value) => {
    if (!selectedWidget) return;
    updateWidget(selectedWidget.id, (widget) => ({
      ...widget,
      query: {
        ...widget.query,
        dimensions: value === "none" ? [] : [value],
      },
    }));
  };

  const handleFilterChange = (index, patch) => {
    if (!selectedWidget) return;
    updateWidget(selectedWidget.id, (widget) => {
      const filters = Array.isArray(widget.query?.filters)
        ? [...widget.query.filters]
        : [];
      const next = { ...filters[index], ...patch };
      if (next.op === "in") {
        const raw = formatFilterValue({ value: next.value });
        next.value = raw
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
      filters[index] = next;
      return {
        ...widget,
        query: {
          ...widget.query,
          filters,
        },
      };
    });
  };

  const handleFilterValue = (index, rawValue) => {
    if (!selectedWidget) return;
    updateWidget(selectedWidget.id, (widget) => {
      const filters = Array.isArray(widget.query?.filters)
        ? [...widget.query.filters]
        : [];
      const filter = filters[index] || { field: "platform", op: "eq", value: "" };
      const value =
        filter.op === "in"
          ? rawValue
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)
          : rawValue;
      filters[index] = { ...filter, value };
      return {
        ...widget,
        query: {
          ...widget.query,
          filters,
        },
      };
    });
  };

  const handleAddFilter = () => {
    if (!selectedWidget) return;
    updateWidget(selectedWidget.id, (widget) => ({
      ...widget,
      query: {
        ...widget.query,
        filters: [
          ...(Array.isArray(widget.query?.filters) ? widget.query.filters : []),
          { field: "platform", op: "in", value: [] },
        ],
      },
    }));
  };

  const handleRemoveFilter = (index) => {
    if (!selectedWidget) return;
    updateWidget(selectedWidget.id, (widget) => {
      const filters = Array.isArray(widget.query?.filters)
        ? widget.query.filters.filter((_, idx) => idx !== index)
        : [];
      return {
        ...widget,
        query: {
          ...widget.query,
          filters,
        },
      };
    });
  };

  const handleSave = async () => {
    setShowValidation(true);
    if (hasValidationErrors) return;
    setActionMessage(null);
    await saveMutation.mutateAsync();
  };

  const handlePublish = async () => {
    setShowValidation(true);
    if (hasValidationErrors) return;
    setActionMessage(null);
    await publishMutation.mutateAsync();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white" style={buildThemeStyle(layoutJson)}>
        <div className="mx-auto max-w-[1400px] px-6 py-10">
          <div className="h-6 w-48 rounded-full kondor-shimmer" />
          <div className="mt-6 h-16 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
          <div className="mt-6 h-[420px] rounded-[24px] border border-[var(--border)] kondor-shimmer" />
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-white" style={buildThemeStyle(layoutJson)}>
        <div className="mx-auto max-w-[1200px] px-6 py-10">
          <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700">
            Nao foi possivel carregar o dashboard.
          </div>
        </div>
      </div>
    );
  }

  if (!dashboard.latestVersion) {
    return (
      <div className="min-h-screen bg-white" style={buildThemeStyle(layoutJson)}>
        <div className="mx-auto max-w-[1200px] px-6 py-10">
          <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-700">
            Voce nao tem permissao para editar este dashboard.
          </div>
        </div>
      </div>
    );
  }

  const themeStyle = buildThemeStyle(layoutJson);

  return (
    <div className="min-h-screen bg-white" style={themeStyle}>
      <div className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate(`/relatorios/v2/${dashboard.id}`)}
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text)]">
                {dashboard.name}
              </h1>
              <p className="text-xs text-[var(--text-muted)]">
                {dashboard.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setPreviewMode((prev) => !prev)}
              leftIcon={previewMode ? Pencil : Eye}
            >
              {previewMode ? "Editar" : "Preview"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleSave}
              disabled={saveMutation.isPending || publishMutation.isPending}
              leftIcon={Save}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar rascunho"}
            </Button>
            <Button
              onClick={handlePublish}
              disabled={saveMutation.isPending || publishMutation.isPending}
              leftIcon={CheckCircle2}
            >
              {publishMutation.isPending ? "Publicando..." : "Publicar"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] gap-6 px-6 py-6">
        <main className="flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">
                Canvas do dashboard
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Arraste, redimensione e configure os widgets.
              </p>
            </div>
            <div className="relative" ref={addMenuRef}>
              <Button
                onClick={() => setShowAddMenu((prev) => !prev)}
                leftIcon={Plus}
              >
                Adicionar
              </Button>
              {showAddMenu ? (
                <div className="absolute right-0 mt-2 w-48 rounded-[14px] border border-[var(--border)] bg-white p-2 shadow-[var(--shadow-md)]">
                  {WIDGET_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => handleAddWidget(type.value)}
                      className="flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--surface-muted)]"
                    >
                      {type.label}
                      <span className="text-xs text-[var(--text-muted)]">
                        {type.value.toUpperCase()}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {showValidation && hasValidationErrors ? (
            <div className="mb-4 rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              Corrija os erros nos widgets antes de salvar.
            </div>
          ) : null}

          {actionMessage ? (
            <div
              className={cn(
                "mb-4 rounded-[14px] border px-4 py-3 text-xs",
                actionMessage.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              )}
            >
              {actionMessage.text}
            </div>
          ) : null}

          <div
            className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4"
            style={{
              minHeight: "520px",
              backgroundImage:
                "linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          >
            {previewMode ? (
              <div>
                <div className="mb-4">
                  <GlobalFiltersBar
                    filters={previewFilters}
                    onChange={setPreviewFilters}
                  />
                </div>
                <DashboardRenderer
                  layout={layoutJson}
                  dashboardId={dashboard.id}
                  brandId={dashboard.brandId}
                  globalFilters={previewFilters}
                />
              </div>
            ) : layoutJson.widgets.length ? (
              <DashboardCanvas
                layout={rglLayout}
                items={layoutJson.widgets}
                width={width}
                containerRef={containerRef}
                isEditable
                rowHeight={28}
                margin={[16, 16]}
                onLayoutChange={handleLayoutChange}
                renderItem={(widget) => (
                  <EditorWidgetCard
                    widget={widget}
                    selected={selectedWidgetId === widget.id}
                    hasErrors={Boolean(validation.widgetIssues[widget.id])}
                    onSelect={setSelectedWidgetId}
                    onDuplicate={handleDuplicateWidget}
                    onRemove={handleRemoveWidget}
                  />
                )}
              />
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center text-center text-sm text-[var(--text-muted)]">
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-[var(--border)]">
                  <Plus className="h-5 w-5" />
                </div>
                <p className="font-semibold text-[var(--text)]">Sem widgets</p>
                <p className="max-w-[320px] text-xs text-[var(--text-muted)]">
                  Clique em "Adicionar" para inserir KPIs, series ou tabelas.
                </p>
              </div>
            )}
          </div>
        </main>

        <aside className="w-full max-w-[360px]">
          <div className="sticky top-24 rounded-[20px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">
                  Configuracoes
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Ajuste dados e estilo do widget.
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--surface-muted)] text-[var(--primary)]">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>

            {selectedWidget ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full justify-between">
                  <TabsTrigger value="data">Dados</TabsTrigger>
                  <TabsTrigger value="style">Estilo</TabsTrigger>
                </TabsList>

                <TabsContent value="data" className="mt-4 space-y-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Tipo do grafico
                    </label>
                    <Select
                      value={selectedWidget.type}
                      onValueChange={handleChangeWidgetType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {WIDGET_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Metricas
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {METRIC_OPTIONS.map((metric) => {
                        const active = selectedWidget.query?.metrics?.includes(
                          metric.value
                        );
                        return (
                          <button
                            key={metric.value}
                            type="button"
                            onClick={() => handleToggleMetric(metric.value)}
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs font-semibold transition",
                              active
                                ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
                                : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:border-slate-300"
                            )}
                          >
                            {metric.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Dimensao
                    </label>
                    <Select
                      value={selectedWidget.query?.dimensions?.[0] || "none"}
                      onValueChange={handleDimensionChange}
                      disabled={selectedWidget.type === "timeseries"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {DIMENSION_OPTIONS.map((dimension) => (
                          <SelectItem key={dimension.value} value={dimension.value}>
                            {dimension.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedWidget.type === "timeseries" ? (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Time series sempre usa dimensao date.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        Filtros do widget
                      </label>
                      <button
                        type="button"
                        onClick={handleAddFilter}
                        className="text-xs font-semibold text-[var(--primary)]"
                      >
                        + Adicionar
                      </button>
                    </div>

                    <div className="space-y-3">
                      {(selectedWidget.query?.filters || []).map((filter, index) => (
                        <div
                          key={`${filter.field}-${index}`}
                          className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] p-3"
                        >
                          <div className="grid gap-2">
                            <Select
                              value={filter.field || "platform"}
                              onValueChange={(value) =>
                                handleFilterChange(index, { field: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Campo" />
                              </SelectTrigger>
                              <SelectContent>
                                {FILTER_FIELDS.map((field) => (
                                  <SelectItem key={field.value} value={field.value}>
                                    {field.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Select
                              value={filter.op || "eq"}
                              onValueChange={(value) =>
                                handleFilterChange(index, { op: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Operacao" />
                              </SelectTrigger>
                              <SelectContent>
                                {FILTER_OPERATORS.map((op) => (
                                  <SelectItem key={op.value} value={op.value}>
                                    {op.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Input
                              value={formatFilterValue(filter)}
                              placeholder="Valor ou lista"
                              onChange={(event) =>
                                handleFilterValue(index, event.target.value)
                              }
                            />
                          </div>
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleRemoveFilter(index)}
                              className="text-xs font-semibold text-rose-500"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      ))}
                      {!selectedWidget.query?.filters?.length ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          Nenhum filtro configurado.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="style" className="mt-4 space-y-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Titulo
                    </label>
                    <Input
                      value={selectedWidget.title || ""}
                      onChange={(event) =>
                        updateWidget(selectedWidget.id, {
                          title: event.target.value,
                        })
                      }
                      placeholder="Nome do widget"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        Mostrar legenda
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Aplica em graficos com series
                      </p>
                    </div>
                    <Checkbox
                      checked={selectedWidget.viz?.showLegend !== false}
                      onCheckedChange={(checked) =>
                        updateWidget(selectedWidget.id, {
                          viz: {
                            ...selectedWidget.viz,
                            showLegend: Boolean(checked),
                          },
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Formatacao
                    </label>
                    <Select
                      value={selectedWidget.viz?.format || "auto"}
                      onValueChange={(value) =>
                        updateWidget(selectedWidget.id, {
                          viz: {
                            ...selectedWidget.viz,
                            format: value,
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Auto" />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMAT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="rounded-[12px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                Selecione um widget para editar.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
