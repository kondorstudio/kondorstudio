import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useContainerWidth } from "react-grid-layout";
import {
  Plus,
  Copy,
  Save,
  CheckCircle2,
  History,
  Undo2,
  Redo2,
  Sidebar,
  SlidersHorizontal,
  Layers3,
} from "lucide-react";
import DashboardCanvas from "@/components/reportsV2/editor/DashboardCanvas.jsx";
import DashboardRenderer from "@/components/reportsV2/DashboardRenderer.jsx";
import WidgetRenderer from "@/components/reportsV2/WidgetRenderer.jsx";
import ThemeProvider from "@/components/reportsV2/ThemeProvider.jsx";
import SidePanel from "@/components/reportsV2/editor/SidePanel.jsx";
import AddMenu from "@/components/reportsV2/editor/AddMenu.jsx";
import WidgetContextMenu from "@/components/reportsV2/editor/WidgetContextMenu.jsx";
import GuidesOverlay from "@/components/reportsV2/editor/GuidesOverlay.jsx";
import MetricsLibraryPanel from "@/components/reportsV2/editor/MetricsLibraryPanel.jsx";
import ReporteiTopbar from "@/components/reportsV2/ReporteiTopbar.jsx";
import ReporteiReportToolbar from "@/components/reportsV2/ReporteiReportToolbar.jsx";
import ReporteiFiltersCards from "@/components/reportsV2/ReporteiFiltersCards.jsx";
import ReporteiShareDialog from "@/components/reportsV2/ReporteiShareDialog.jsx";
import ReporteiLeftRail from "@/components/reportsV2/ReporteiLeftRail.jsx";
import ReporteiCoverCard from "@/components/reportsV2/ReporteiCoverCard.jsx";
import useHistoryState from "@/components/reportsV2/editor/useHistoryState.js";
import {
  SNAP_THRESHOLD,
  computeSnapPosition,
} from "@/components/reportsV2/editor/snapUtils.js";
import { PIE_DEFAULTS } from "@/components/reportsV2/widgets/pieUtils.js";
import {
  normalizeFilterArrayValue,
  normalizeFilterSingleValue,
} from "@/components/reportsV2/editor/filterUtils.js";
import {
  useDebouncedValue,
  stableStringify,
  normalizeLayoutFront,
  getActivePage,
  generateUuid,
  duplicateWidget as duplicateWidgetItem,
  normalizeThemeFront,
  DEFAULT_REPORT_THEME,
  DEFAULT_FILTER_CONTROLS,
} from "@/components/reportsV2/utils.js";
import {
  getCatalogForPlatform,
  getGroupedCatalogForPlatform,
} from "@/components/reportsV2/editor/reporteiMetricCatalog.js";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Checkbox } from "@/components/ui/checkbox.jsx";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select.jsx";
import Toast from "@/components/ui/toast.jsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.jsx";
import { cn } from "@/utils/classnames.js";
import useToast from "@/hooks/useToast.js";
import { base44 } from "@/apiClient/base44Client";

const DEFAULT_LAYOUT = {
  theme: DEFAULT_REPORT_THEME,
  globalFilters: {
    dateRange: { preset: "last_7_days" },
    platforms: [],
    accounts: [],
    compareTo: null,
    autoRefreshSec: 0,
    controls: DEFAULT_FILTER_CONTROLS,
  },
  pages: [
    {
      id: generateUuid(),
      name: "Página 1",
      widgets: [],
    },
  ],
};

const WIDGET_TYPES = [
  { value: "kpi", label: "KPI" },
  { value: "timeseries", label: "Time series" },
  { value: "bar", label: "Bar" },
  { value: "table", label: "Table" },
  { value: "pie", label: "Pie" },
  { value: "donut", label: "Donut" },
  { value: "text", label: "Texto" },
];

const METRIC_OPTIONS = [
  {
    value: "spend",
    label: "Valor investido",
    shortLabel: "Invest.",
    category: "Investimento",
  },
  { value: "cpc", label: "CPC", shortLabel: "CPC", category: "Investimento" },
  { value: "cpm", label: "CPM", shortLabel: "CPM", category: "Investimento" },
  {
    value: "impressions",
    label: "Impressões",
    shortLabel: "Imp.",
    category: "Alcance",
  },
  { value: "clicks", label: "Cliques", shortLabel: "Cliques", category: "Alcance" },
  { value: "ctr", label: "CTR", shortLabel: "CTR", category: "Alcance" },
  {
    value: "conversions",
    label: "Conversões",
    shortLabel: "Conv.",
    category: "Conversões",
  },
  { value: "cpa", label: "CPA", shortLabel: "CPA", category: "Conversões" },
  { value: "leads", label: "Leads", shortLabel: "Leads", category: "Conversões" },
  { value: "revenue", label: "Receita", shortLabel: "Receita", category: "Receita" },
  { value: "roas", label: "ROAS", shortLabel: "ROAS", category: "Receita" },
  {
    value: "sessions",
    label: "Sessões",
    shortLabel: "Sessões",
    category: "Aquisição",
  },
];

const METRIC_LABELS = METRIC_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const PLATFORM_LABELS = {
  META_ADS: "Meta Ads",
  GOOGLE_ADS: "Google Ads",
  TIKTOK_ADS: "TikTok Ads",
  LINKEDIN_ADS: "LinkedIn Ads",
  GA4: "GA4",
  GMB: "Google Meu Negocio",
  FB_IG: "Facebook/Instagram",
};

const PLATFORM_BADGE = {
  META_ADS: { short: "M", className: "bg-blue-100 text-blue-700" },
  GOOGLE_ADS: { short: "G", className: "bg-emerald-100 text-emerald-700" },
  TIKTOK_ADS: { short: "T", className: "bg-slate-200 text-slate-700" },
  LINKEDIN_ADS: { short: "In", className: "bg-sky-100 text-sky-700" },
  GA4: { short: "GA", className: "bg-orange-100 text-orange-700" },
  GMB: { short: "GMB", className: "bg-lime-100 text-lime-700" },
  FB_IG: { short: "FB", className: "bg-indigo-100 text-indigo-700" },
};
const METRICS_CATALOG_PLATFORMS = [
  "META_ADS",
  "FB_IG",
  "GOOGLE_ADS",
  "TIKTOK_ADS",
  "LINKEDIN_ADS",
  "GA4",
];

const DIMENSION_OPTIONS = [
  { value: "none", label: "Nenhuma" },
  { value: "date", label: "Data" },
  { value: "platform", label: "Plataforma" },
  { value: "account_id", label: "Conta" },
  { value: "campaign_id", label: "Campanha" },
];

const FORMAT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "compact", label: "Compacto" },
  { value: "full", label: "Completo" },
];

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CANVAS_COLS = 12;
const CANVAS_ROW_HEIGHT = 28;
const CANVAS_MARGIN = [16, 16];
const METRIC_DRAG_TYPE = "application/kondor-metric";

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
    query: {
      metrics: ["spend"],
      dimensions: ["campaign_id"],
      limit: 25,
      sort: { field: "spend", direction: "desc" },
    },
  },
  pie: {
    title: "Pizza",
    layout: { w: 4, h: 4, minW: 3, minH: 3 },
    query: { metrics: ["spend"], dimensions: ["platform"] },
  },
  donut: {
    title: "Donut",
    layout: { w: 4, h: 4, minW: 3, minH: 3 },
    query: { metrics: ["spend"], dimensions: ["platform"] },
  },
  text: {
    title: "Bloco de texto",
    layout: { w: 6, h: 4, minW: 3, minH: 2 },
  },
};

function normalizePlatformValue(value) {
  if (!value) return "";
  return String(value).trim().toUpperCase();
}

function resolveDropPosition({
  clientX,
  clientY,
  rect,
  containerWidth,
  cols,
  rowHeight,
  margin,
}) {
  if (!rect || !containerWidth) return null;
  const [marginX, marginY] = margin;
  const width = Math.max(0, Number(containerWidth) || 0);
  const columnWidth = (width - marginX * (cols - 1)) / cols;
  if (!Number.isFinite(columnWidth) || columnWidth <= 0) return null;
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  const x = Math.floor((relX + marginX) / (columnWidth + marginX));
  const y = Math.floor((relY + marginY) / (rowHeight + marginY));
  return {
    x: Math.max(0, Math.min(cols - 1, x)),
    y: Math.max(0, y),
  };
}

function buildMetricWidget({
  metricKey,
  label,
  platform,
  position,
  widgetType = "kpi",
  dimensions = [],
}) {
  const type = WIDGET_PRESETS[widgetType] ? widgetType : "kpi";
  const preset = WIDGET_PRESETS[type] || WIDGET_PRESETS.kpi;
  const metric = String(metricKey || "").trim();
  const title = String(label || METRIC_LABELS[metric] || metric || "Métrica");
  const normalizedPlatform = normalizePlatformValue(platform);
  const x = Math.max(
    0,
    Math.min(CANVAS_COLS - preset.layout.w, Number(position?.x || 0))
  );
  const y = Math.max(0, Number(position?.y || 0));
  const filters = normalizedPlatform
    ? [{ field: "platform", op: "eq", value: normalizedPlatform }]
    : [];
  const resolvedDimensions =
    Array.isArray(dimensions) && dimensions.length
      ? dimensions
      : Array.isArray(preset.query?.dimensions)
      ? preset.query.dimensions
      : [];

  const vizVariant =
    type === "donut" ? "donut" : type === "pie" ? "pie" : "default";

  return {
    id: generateUuid(),
    type,
    title,
    layout: {
      x,
      y,
      w: preset.layout.w,
      h: preset.layout.h,
      minW: preset.layout.minW,
      minH: preset.layout.minH,
    },
    query: {
      metrics: metric ? [metric] : [],
      dimensions: resolvedDimensions,
      filters,
      ...(type === "table" && metric
        ? { sort: { field: metric, direction: "desc" }, limit: 25 }
        : {}),
      ...(normalizedPlatform ? { requiredPlatforms: [normalizedPlatform] } : {}),
    },
    viz: {
      variant: vizVariant,
      showLegend: type !== "kpi",
      format: "auto",
      options:
        type === "pie" || type === "donut"
          ? {
              topN: PIE_DEFAULTS.topN,
              showOthers: PIE_DEFAULTS.showOthers,
              othersLabel: PIE_DEFAULTS.othersLabel,
            }
          : {},
    },
  };
}

function mergeLayoutDefaults(layout) {
  const normalized = normalizeLayoutFront(layout) || DEFAULT_LAYOUT;
  return {
    theme: {
      ...DEFAULT_LAYOUT.theme,
      ...(normalized.theme || {}),
    },
    globalFilters: {
      ...DEFAULT_LAYOUT.globalFilters,
      ...(normalized.globalFilters || {}),
      dateRange: {
        ...DEFAULT_LAYOUT.globalFilters.dateRange,
        ...(normalized.globalFilters?.dateRange || {}),
      },
      controls: {
        ...DEFAULT_FILTER_CONTROLS,
        ...(normalized.globalFilters?.controls || {}),
      },
    },
    pages:
      Array.isArray(normalized.pages) && normalized.pages.length
        ? normalized.pages
        : DEFAULT_LAYOUT.pages,
  };
}

function buildInitialFilters(layout) {
  const base = {
    dateRange: { preset: "last_7_days" },
    platforms: [],
    accounts: [],
    compareTo: null,
    autoRefreshSec: 0,
    controls: DEFAULT_FILTER_CONTROLS,
  };
  const globalFilters = layout?.globalFilters || {};
  return {
    ...base,
    ...globalFilters,
    dateRange: {
      ...base.dateRange,
      ...(globalFilters.dateRange || {}),
    },
    controls: {
      ...DEFAULT_FILTER_CONTROLS,
      ...(globalFilters.controls || {}),
    },
  };
}

function normalizeControlFlags(rawControls) {
  return {
    showDateRange: rawControls?.showDateRange !== false,
    showPlatforms: rawControls?.showPlatforms !== false,
    showAccounts: rawControls?.showAccounts !== false,
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

function sanitizeSortForFields(sort, fields) {
  if (!sort?.field) return null;
  const allowed = new Set((fields || []).filter(Boolean));
  if (!allowed.has(sort.field)) return null;
  return {
    field: String(sort.field),
    direction: sort.direction === "desc" ? "desc" : "asc",
  };
}

function sanitizeLayoutForSave(layout) {
  const merged = mergeLayoutDefaults(layout);
  const controls = normalizeControlFlags(merged.globalFilters?.controls);
  const sanitizeWidget = (widget) => {
    const layoutValue = widget.layout || {};
    const w = normalizeLayoutValue(layoutValue.w, 4) || 4;
    const h = normalizeLayoutValue(layoutValue.h, 3) || 3;
    const minW = Math.max(1, normalizeLayoutValue(layoutValue.minW, 2));
    const minH = Math.max(1, normalizeLayoutValue(layoutValue.minH, 2));
    const baseWidget = {
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
      viz: {
        variant:
          widget?.viz?.variant ||
          (widget?.type === "donut"
            ? "donut"
            : widget?.type === "pie"
            ? "pie"
            : "default"),
        showLegend: widget?.viz?.showLegend !== false,
        format: widget?.viz?.format || "auto",
        options: widget?.viz?.options || {},
      },
    };

    if (baseWidget.type === "text") {
      return {
        ...baseWidget,
        content: {
          text: String(widget?.content?.text || "Digite seu texto..."),
          format: widget?.content?.format === "markdown" ? "markdown" : "plain",
        },
      };
    }

    const metrics = Array.isArray(widget?.query?.metrics)
      ? widget.query.metrics.filter(Boolean)
      : [];
    const dimensions = Array.isArray(widget?.query?.dimensions)
      ? widget.query.dimensions.filter(Boolean)
      : [];
    const requiredPlatforms = Array.isArray(widget?.query?.requiredPlatforms)
      ? widget.query.requiredPlatforms.filter(Boolean)
      : [];
    const filters = Array.isArray(widget?.query?.filters)
      ? widget.query.filters.map((filter) => {
          const op = filter?.op || "eq";
          let value = filter?.value ?? "";
          if (op === "in") {
            value = normalizeFilterArrayValue(value);
          } else {
            value = normalizeFilterSingleValue(Array.isArray(value) ? value[0] : value);
          }
          return {
            field: filter?.field || "platform",
            op,
            value,
          };
        })
      : [];
    const sortField = String(widget?.query?.sort?.field || "").trim();
    const sortDirection = widget?.query?.sort?.direction === "desc" ? "desc" : "asc";
    const sort = sortField ? { field: sortField, direction: sortDirection } : null;
    const limitValue = Number(widget?.query?.limit);
    const limit = Number.isFinite(limitValue)
      ? Math.max(1, Math.min(500, Math.round(limitValue)))
      : null;

    return {
      ...baseWidget,
      query: {
        metrics,
        dimensions,
        filters,
        ...(requiredPlatforms.length ? { requiredPlatforms } : {}),
        ...(sort ? { sort } : {}),
        ...(limit ? { limit } : {}),
      },
    };
  };

  return {
    theme: merged.theme,
    globalFilters: {
      ...merged.globalFilters,
      controls,
    },
    pages: merged.pages.map((page, index) => ({
      id: page.id || generateUuid(),
      name:
        page.name && String(page.name).trim()
          ? String(page.name).trim().slice(0, 60)
          : `Página ${index + 1}`,
      widgets: (page.widgets || []).map(sanitizeWidget),
    })),
  };
}

function validateLayout(layout) {
  const issues = [];
  const widgetIssues = {};
  const allowedFilterFields = new Set(["platform", "account_id", "campaign_id"]);

  const pages = Array.isArray(layout?.pages)
    ? layout.pages
    : Array.isArray(layout?.widgets)
    ? [
        {
          id: "legacy",
        name: "Página 1",
          widgets: layout.widgets,
        },
      ]
    : [];

  pages.forEach((page) => {
    (page.widgets || []).forEach((widget) => {
    const errors = [];
    const metrics = Array.isArray(widget?.query?.metrics)
      ? widget.query.metrics.filter(Boolean)
      : [];
    const dimensions = Array.isArray(widget?.query?.dimensions)
      ? widget.query.dimensions.filter(Boolean)
      : [];
    const isTextWidget = widget?.type === "text";

    if (!widget?.title || !String(widget.title).trim()) {
      errors.push("Titulo obrigatorio");
    }

    if (!isTextWidget && !metrics.length) {
      errors.push("Selecione pelo menos uma métrica");
    }

    if (!isTextWidget && widget?.type === "kpi" && metrics.length > 1) {
      errors.push("KPI aceita apenas 1 métrica");
    }

    if (widget?.type === "kpi") {
      if (dimensions.length > 1) {
        errors.push("KPI aceita no máximo 1 dimensão");
      }
      if (dimensions.length === 1 && dimensions[0] !== "date") {
        errors.push("KPI com dimensão deve usar date");
      }
    }

    if (widget?.type === "timeseries") {
      if (dimensions.length !== 1 || dimensions[0] !== "date") {
        errors.push("Time series exige dimensão date");
      }
    }

    if (widget?.type === "bar") {
      if (dimensions.length !== 1 || dimensions[0] === "date") {
        errors.push("Gráfico exige uma dimensão não-date");
      }
    }

    if (widget?.type === "pie" || widget?.type === "donut") {
      if (dimensions.length !== 1 || dimensions[0] === "date") {
        errors.push("Pie/Donut exige exatamente 1 dimensão não-date");
      }
      if (metrics.length !== 1) {
        errors.push("Pie/Donut exige exatamente 1 métrica");
      }
    }

    if (!isTextWidget) {
      const filters = Array.isArray(widget?.query?.filters)
        ? widget.query.filters
        : [];
      filters.forEach((filter) => {
        if (!filter?.field || !filter?.op) {
          errors.push("Filtro incompleto");
          return;
        }
        if (!allowedFilterFields.has(filter.field)) {
          errors.push("Campo de filtro invalido");
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

      const sort = widget?.query?.sort;
      if (sort) {
        const sortableFields = new Set([...dimensions, ...metrics]);
        if (!sort.field || !sortableFields.has(sort.field)) {
          errors.push("Ordenação deve usar dimensão ou métrica selecionada");
        }
        if (!["asc", "desc"].includes(sort.direction)) {
          errors.push("Direcao de ordenacao invalida");
        }
      }

      if (widget?.query?.limit !== undefined && widget?.query?.limit !== null) {
        const limit = Number(widget.query.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
          errors.push("Limite deve ser um inteiro entre 1 e 500");
        }
      }
    } else {
      if (
        widget?.content?.text !== undefined &&
        !String(widget.content.text).trim()
      ) {
        errors.push("Texto do bloco não pode ficar vazio");
      }
    }

    if (errors.length) {
      widgetIssues[widget.id] = errors;
      errors.forEach((message) =>
        issues.push({ widgetId: widget.id, message, pageName: page.name })
      );
    }
  });
  });

  return { issues, widgetIssues };
}

function buildWidgetSummary(widget) {
  if (widget?.type === "text") {
    const text = String(widget?.content?.text || "").trim();
    if (!text) return "Bloco de texto vazio";
    return text.length > 64 ? `${text.slice(0, 61)}...` : text;
  }
  const metrics = Array.isArray(widget?.query?.metrics)
    ? widget.query.metrics
    : [];
  const dimensions = Array.isArray(widget?.query?.dimensions)
    ? widget.query.dimensions
    : [];

  const metricLabel = metrics.length ? metrics.join(", ") : "Sem métricas";
  const dimensionLabel = dimensions.length ? dimensions.join(", ") : "Sem dimensão";
  return `${metricLabel} • ${dimensionLabel}`;
}

function formatVersionDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function EditorWidgetCard({
  widget,
  dashboardId,
  brandId,
  globalFilters,
  pageId,
  selected,
  hasErrors,
  errorCount,
  onSelect,
  onDuplicate,
  onRemove,
}) {
  return (
    <div
      data-editor-widget-card="true"
      data-widget-id={widget.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(widget.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect(widget.id);
      }}
      className={cn(
        "group flex h-full flex-col justify-between rounded-[12px] border bg-white p-3 text-left shadow-none transition-colors hover:border-slate-300",
        selected
          ? "border-[var(--primary)] ring-2 ring-[var(--primary-light)]"
          : "border-[var(--border)]",
        hasErrors && "border-rose-300 ring-2 ring-rose-200"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold text-[var(--text)]">
            {widget.title || "Widget"}
          </p>
          <p className="text-[11px] font-semibold text-[var(--text-muted)]">
            {String(widget.type || "").toUpperCase()}
          </p>
        </div>
        {hasErrors ? (
          <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-600">
            {errorCount || 1} erro{errorCount === 1 ? "" : "s"}
          </span>
        ) : null}
        <div className="opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <WidgetContextMenu
            onDuplicate={() => onDuplicate(widget.id)}
            onDelete={() => onRemove(widget.id)}
            deleteLabel="Deletar"
          />
        </div>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-hidden">
        <WidgetRenderer
          widget={widget}
          dashboardId={dashboardId}
          brandId={brandId}
          pageId={pageId}
          globalFilters={globalFilters}
        />
      </div>
    </div>
  );
}

export default function ReportsV2Editor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();
  const { width, containerRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 960,
  });

  const history = useHistoryState(DEFAULT_LAYOUT);
  const layoutJson = history.state;
  const setLayoutJson = history.setState;
  const { undo, redo, canUndo, canRedo, resetState } = history;
  const commitLayoutChange = React.useCallback(
    (updater) => setLayoutJson(updater),
    [setLayoutJson]
  );
  const stageLayoutChange = React.useCallback(
    (updater) => setLayoutJson(updater, { snapshot: false }),
    [setLayoutJson]
  );
  const [activePageId, setActivePageId] = React.useState(null);
  const [selectedWidgetId, setSelectedWidgetId] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState("data");
  const [previewMode, setPreviewMode] = React.useState(false);
  const [previewFilters, setPreviewFilters] = React.useState(
    buildInitialFilters(DEFAULT_LAYOUT)
  );
  const [officialDateRange, setOfficialDateRange] = React.useState(null);
  const debouncedPreviewFilters = useDebouncedValue(previewFilters, 400);
  const [actionMessage, setActionMessage] = React.useState(null);
  const [showValidation, setShowValidation] = React.useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = React.useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = React.useState("idle");
  const [showHistory, setShowHistory] = React.useState(false);
  const [showRenamePage, setShowRenamePage] = React.useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = React.useState(false);
  const [templateName, setTemplateName] = React.useState("");
  const [templateCategory, setTemplateCategory] = React.useState("Meus templates");
  const [showShareDialog, setShowShareDialog] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState("");
  const [metricsPanelOpen, setMetricsPanelOpen] = React.useState(false);
  const [pageNameDraft, setPageNameDraft] = React.useState("");
  const [themeDraft, setThemeDraft] = React.useState(() => ({
    brandColor: DEFAULT_LAYOUT.theme.brandColor,
    accentColor: DEFAULT_LAYOUT.theme.accentColor,
    radius: String(DEFAULT_LAYOUT.theme.radius),
  }));
  const [themeFormError, setThemeFormError] = React.useState("");
  const [lastSavedKey, setLastSavedKey] = React.useState("");
  const [hasHydrated, setHasHydrated] = React.useState(false);
  const [activeGuides, setActiveGuides] = React.useState(null);
  const [metricsSearch, setMetricsSearch] = React.useState("");
  const [activeMetricPlatform, setActiveMetricPlatform] = React.useState("");
  const [isMetricDragOver, setIsMetricDragOver] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const interactionRef = React.useRef(false);
  const skipNextLayoutChangeRef = React.useRef(false);
  const guidesRef = React.useRef(null);
  const metricDragCounterRef = React.useRef(0);

  React.useEffect(() => {
    setOfficialDateRange(null);
  }, [
    previewFilters?.dateRange?.preset,
    previewFilters?.dateRange?.start,
    previewFilters?.dateRange?.end,
  ]);

  const handleWidgetMetaChange = React.useCallback((_widgetId, meta) => {
    const range = meta?.dateRange || null;
    if (!range?.start || !range?.end) return;
    const next = {
      preset: range.preset || null,
      start: range.start,
      end: range.end,
      timezone: meta?.timezone || null,
    };
    setOfficialDateRange((prev) => {
      if (
        prev &&
        prev.preset === next.preset &&
        prev.start === next.start &&
        prev.end === next.end &&
        prev.timezone === next.timezone
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const scrollToWidgetCard = React.useCallback((widgetId) => {
    if (!widgetId || typeof document === "undefined") return;
    const tryScroll = (attempt = 0) => {
      const node = document.querySelector(`[data-widget-id="${widgetId}"]`);
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (attempt >= 12) return;
      window.setTimeout(() => tryScroll(attempt + 1), 80);
    };
    tryScroll();
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["reportsV2-dashboard", id],
    queryFn: () => base44.reportsV2.getDashboard(id),
  });
  const shareStatusQuery = useQuery({
    queryKey: ["reportsV2-public-share", id],
    queryFn: () => base44.reportsV2.getPublicShareStatus(id),
    enabled: Boolean(id),
  });

  const versionsQuery = useQuery({
    queryKey: ["reportsV2-versions", id],
    queryFn: () => base44.reportsV2.listDashboardVersions(id),
    enabled: showHistory && Boolean(id),
  });

  const dashboard = data || null;
  const brandId = dashboard?.brandId || null;
  const layoutFromApi =
    dashboard?.latestVersion?.layoutJson ||
    dashboard?.publishedVersion?.layoutJson ||
    null;

  const connectionsQuery = useQuery({
    queryKey: ["reportsV2-editor-connections", brandId],
    queryFn: () => base44.reportsV2.listConnections({ brandId }),
    enabled: Boolean(brandId),
  });

  const ga4StatusQuery = useQuery({
    queryKey: ["ga4-status"],
    queryFn: () => base44.ga4.status(),
  });

  const ga4BrandSettingsQuery = useQuery({
    queryKey: ["ga4-brand-settings", brandId],
    queryFn: () => base44.ga4.getBrandSettings({ brandId }),
    enabled: Boolean(brandId),
    retry: false,
  });

  const ga4Settings = ga4BrandSettingsQuery.data?.settings || null;
  const ga4ActivePropertyId = ga4Settings?.propertyId
    ? String(ga4Settings.propertyId).trim()
    : "";

  const ga4Properties = React.useMemo(() => {
    const list = Array.isArray(ga4StatusQuery.data?.properties)
      ? ga4StatusQuery.data.properties
      : [];
    const options = list
      .map((prop) => {
        const propertyId = String(prop?.propertyId || "")
          .trim()
          .replace(/^properties\//, "");
        if (!propertyId) return null;
        const displayName = String(prop?.displayName || "").trim();
        return {
          value: propertyId,
          label: displayName
            ? `${displayName} (${propertyId})`
            : `Property ${propertyId}`,
        };
      })
      .filter(Boolean);

    const seen = new Set();
    const unique = [];
    options.forEach((opt) => {
      if (!opt?.value) return;
      if (seen.has(opt.value)) return;
      seen.add(opt.value);
      unique.push(opt);
    });

    // Ensure the active property is visible even if the list is stale.
    if (ga4ActivePropertyId && !seen.has(ga4ActivePropertyId)) {
      unique.unshift({
        value: ga4ActivePropertyId,
        label: `Property ${ga4ActivePropertyId}`,
      });
    }

    return unique;
  }, [ga4StatusQuery.data?.properties, ga4ActivePropertyId]);

  const setGa4PropertyMutation = useMutation({
    mutationFn: async (propertyId) => {
      return base44.ga4.upsertBrandSettings({
        brandId,
        propertyId,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ga4-brand-settings", brandId] }),
        queryClient.invalidateQueries({
          queryKey: ["reportsV2-editor-connections", brandId],
        }),
        queryClient.invalidateQueries({ queryKey: ["reportsV2-widget", id] }),
      ]);
      showToast("Propriedade GA4 atualizada para esta marca.", "success");
    },
    onError: (err) => {
      const status = err?.status || err?.response?.status || null;
      const message =
        err?.message ||
        (status === 403
          ? "Sem permissão para alterar a propriedade GA4."
          : "Falha ao atualizar a propriedade GA4.");
      showToast(message, "error");
    },
  });

  const connections = connectionsQuery.data?.items || [];
  const activeConnections = React.useMemo(() => {
    if (!Array.isArray(connections)) return [];
    return connections.filter(
      (item) => String(item?.status || "").toUpperCase() === "ACTIVE"
    );
  }, [connections]);
  const connectedPlatforms = React.useMemo(() => {
    const platforms = activeConnections.map((item) =>
      normalizePlatformValue(item?.platform)
    );
    return Array.from(new Set(platforms)).filter(Boolean);
  }, [activeConnections]);
  const metricsPlatformOptions = React.useMemo(() => {
    const buildOptions = (platforms) => {
      const unique = Array.from(
        new Set((platforms || []).map(normalizePlatformValue).filter(Boolean))
      );
      return unique
        .filter((platform) => getCatalogForPlatform(platform).length)
        .map((platform) => ({
          value: platform,
          label: PLATFORM_LABELS[platform] || platform,
        }));
    };
    const preferred = buildOptions(connectedPlatforms);
    if (preferred.length) return preferred;
    return buildOptions(METRICS_CATALOG_PLATFORMS);
  }, [connectedPlatforms]);
  const metricsForActivePlatform = React.useMemo(() => {
    const catalog = getCatalogForPlatform(activeMetricPlatform);
    if (catalog.length) return catalog;
    return METRIC_OPTIONS.map((metric) => ({
      value: metric.value,
      label: metric.label,
      queryMetric: metric.value,
      widgetType: "kpi",
      dimensions: [],
      group: metric.category || "Metricas",
    }));
  }, [activeMetricPlatform]);
  const metricGroupsForActivePlatform = React.useMemo(() => {
    const grouped = getGroupedCatalogForPlatform(activeMetricPlatform);
    if (grouped.length) return grouped;
    return [
      {
        key: "metricas",
        label: "Metricas",
        metrics: metricsForActivePlatform,
      },
    ];
  }, [activeMetricPlatform, metricsForActivePlatform]);
  const debouncedLayoutJson = useDebouncedValue(layoutJson, 1500);

  React.useEffect(() => {
    if (!layoutFromApi) return;
    const merged = mergeLayoutDefaults(layoutFromApi);
    const initialPayload = sanitizeLayoutForSave(merged);
    resetState(merged);
    setThemeDraft({
      brandColor: merged.theme.brandColor,
      accentColor: merged.theme.accentColor,
      radius: String(merged.theme.radius),
    });
    setThemeFormError("");
    setPreviewFilters(buildInitialFilters(merged));
    const firstPage = Array.isArray(merged.pages) ? merged.pages[0] : null;
    if (firstPage?.id) {
      setActivePageId(firstPage.id);
      if (firstPage.widgets?.length) {
        setSelectedWidgetId(firstPage.widgets[0].id);
      }
    }
    setLastSavedKey(stableStringify(initialPayload));
    setHasHydrated(true);
  }, [layoutFromApi, resetState]);

  React.useEffect(() => {
    const url = shareStatusQuery.data?.publicUrl || "";
    setShareUrl(url);
  }, [shareStatusQuery.data?.publicUrl]);

  React.useEffect(() => {
    const pages = Array.isArray(layoutJson.pages) ? layoutJson.pages : [];
    if (!pages.length) return;
    setActivePageId((current) => {
      if (current && pages.some((page) => page.id === current)) return current;
      return pages[0].id;
    });
  }, [layoutJson.pages]);

  React.useEffect(() => {
    if (!metricsPlatformOptions.length) return;
    setActiveMetricPlatform((current) => {
      if (
        current &&
        metricsPlatformOptions.some((option) => option.value === current)
      ) {
        return current;
      }
      return metricsPlatformOptions[0].value;
    });
  }, [metricsPlatformOptions]);

  React.useEffect(() => {
    const activePage = getActivePage(layoutJson, activePageId);
    if (!activePage) return;
    if (
      selectedWidgetId &&
      activePage.widgets?.some((widget) => widget.id === selectedWidgetId)
    ) {
      return;
    }
    setSelectedWidgetId(activePage.widgets?.[0]?.id || null);
  }, [activePageId, layoutJson.pages, selectedWidgetId]);

  React.useEffect(() => {
    const isEditableField = (element) => {
      if (!element) return false;
      const tag = String(element.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      return Boolean(element.isContentEditable);
    };

    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target;
      if (isEditableField(target) || isEditableField(document.activeElement)) return;

      const key = String(event.key || "").toLowerCase();
      const withModifier = event.metaKey || event.ctrlKey;

      if (withModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (event.ctrlKey && key === "y") {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const validation = React.useMemo(
    () => validateLayout(layoutJson),
    [layoutJson]
  );
  const hasValidationErrors = validation.issues.length > 0;

  const autoSaveMutation = useMutation({
    mutationFn: async (payload) =>
      base44.reportsV2.createDashboardVersion(id, { layoutJson: payload }),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload) =>
      base44.reportsV2.createDashboardVersion(id, { layoutJson: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      queryClient.invalidateQueries({ queryKey: ["reportsV2-versions", id] });
      setActionMessage({
        type: "success",
        text: "Rascunho salvo com sucesso.",
      });
    },
    onError: () => {
      setActionMessage({
        type: "error",
        text: "Não foi possível salvar o rascunho.",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (payload) => {
      const version = await base44.reportsV2.createDashboardVersion(id, {
        layoutJson: payload,
      });
      return base44.reportsV2.publishDashboard(id, { versionId: version.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      queryClient.invalidateQueries({ queryKey: ["reportsV2-versions", id] });
      setActionMessage({
        type: "success",
        text: "Dashboard publicado com sucesso.",
      });
    },
    onError: () => {
      setActionMessage({
        type: "error",
        text: "Não foi possível publicar.",
      });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (versionId) =>
      base44.reportsV2.rollbackDashboard(id, { versionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      queryClient.invalidateQueries({ queryKey: ["reportsV2-versions", id] });
      setActionMessage({
        type: "success",
        text: "Rollback publicado com sucesso.",
      });
    },
    onError: () => {
      setActionMessage({
        type: "error",
        text: "Não foi possível fazer rollback.",
      });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async () => base44.reportsV2.cloneDashboard(id),
    onSuccess: (cloned) => {
      if (cloned?.id) {
        navigate(`/relatorios/v2/${cloned.id}/edit`);
      }
    },
    onError: () => {
      setActionMessage({
        type: "error",
        text: "Não foi possível duplicar o dashboard.",
      });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (payload) => base44.reportsV2.createTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportsV2-templates"] });
      setShowSaveTemplate(false);
      showToast("Template salvo com sucesso.", "success");
    },
    onError: (error) => {
      const message =
        error?.data?.error?.message ||
        error?.message ||
        "Não foi possível salvar o template.";
      showToast(message, "error");
    },
  });

  const pages = Array.isArray(layoutJson.pages) ? layoutJson.pages : [];
  const activePage = getActivePage(layoutJson, activePageId);
  const activeWidgets = Array.isArray(activePage?.widgets) ? activePage.widgets : [];

  const selectedWidget = activeWidgets.find(
    (widget) => widget.id === selectedWidgetId
  );
  const versions = Array.isArray(versionsQuery.data?.items)
    ? versionsQuery.data.items
    : [];
  const controlFlags = normalizeControlFlags(layoutJson?.globalFilters?.controls);

  const validationSummary = React.useMemo(() => {
    if (!validation.issues.length) return [];
    const widgetLookup = new Map();
    pages.forEach((page) => {
      (page.widgets || []).forEach((widget) => {
        widgetLookup.set(widget.id, widget);
      });
    });
    return validation.issues.map((issue, index) => {
      const widget = widgetLookup.get(issue.widgetId);
      return {
        key: `${issue.widgetId}-${index}`,
        widgetTitle: widget?.title || "Widget",
        message: issue.pageName
          ? `${issue.pageName}: ${issue.message}`
          : issue.message,
      };
    });
  }, [pages, validation.issues]);

  const rglLayout = React.useMemo(() => {
    return activeWidgets.map((widget) => {
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
  }, [activeWidgets]);

  const activeStaticRects = React.useMemo(() => {
    return activeWidgets.map((widget) => {
      const layout = widget.layout || {};
      return {
        id: widget.id,
        x: normalizeLayoutValue(layout.x, 0),
        y: normalizeLayoutValue(layout.y, 0),
        w: Math.max(1, normalizeLayoutValue(layout.w, 1)),
        h: Math.max(1, normalizeLayoutValue(layout.h, 1)),
      };
    });
  }, [activePageId, activeWidgets]);

  const activeStaticRectById = React.useMemo(() => {
    const map = new Map();
    activeStaticRects.forEach((rect) => {
      map.set(rect.id, rect);
    });
    return map;
  }, [activeStaticRects]);

  const guidesCanvasHeight = React.useMemo(() => {
    const rows = rglLayout.reduce((maxRows, item) => {
      const bottom = normalizeLayoutValue(item?.y, 0) + Math.max(1, normalizeLayoutValue(item?.h, 1));
      return Math.max(maxRows, bottom);
    }, 1);
    const rowHeight = CANVAS_ROW_HEIGHT;
    const marginY = CANVAS_MARGIN[1];
    return Math.max(
      320,
      rows * rowHeight + Math.max(0, rows - 1) * marginY
    );
  }, [rglLayout]);

  const applyGuides = React.useCallback((guides) => {
    const normalized =
      Number.isFinite(guides?.vertical) || Number.isFinite(guides?.horizontal)
        ? {
            ...(Number.isFinite(guides?.vertical) ? { vertical: guides.vertical } : {}),
            ...(Number.isFinite(guides?.horizontal)
              ? { horizontal: guides.horizontal }
              : {}),
          }
        : null;
    const current = guidesRef.current;
    const same =
      (current === null && normalized === null) ||
      (current !== null &&
        normalized !== null &&
        current.vertical === normalized.vertical &&
        current.horizontal === normalized.horizontal);
    if (same) return;
    guidesRef.current = normalized;
    setActiveGuides(normalized);
  }, []);

  React.useEffect(() => {
    interactionRef.current = false;
    skipNextLayoutChangeRef.current = false;
    applyGuides(null);
  }, [activePageId, applyGuides]);

  const snapLayoutForInteraction = React.useCallback(
    (nextLayout, movingItem, operation) => {
      if (!Array.isArray(nextLayout)) {
        return {
          layout: [],
          guides: null,
        };
      }

      const normalizedLayout = nextLayout.map((item) => ({
        ...item,
        x: normalizeLayoutValue(item?.x, 0),
        y: normalizeLayoutValue(item?.y, 0),
        w: Math.max(1, normalizeLayoutValue(item?.w, 1)),
        h: Math.max(1, normalizeLayoutValue(item?.h, 1)),
        minW: Math.max(1, normalizeLayoutValue(item?.minW, 1)),
        minH: Math.max(1, normalizeLayoutValue(item?.minH, 1)),
      }));

      if (!movingItem?.i || width <= 0) {
        return {
          layout: normalizedLayout,
          guides: null,
        };
      }

      const movingRect = {
        x: normalizeLayoutValue(movingItem.x, 0),
        y: normalizeLayoutValue(movingItem.y, 0),
        w: Math.max(1, normalizeLayoutValue(movingItem.w, 1)),
        h: Math.max(1, normalizeLayoutValue(movingItem.h, 1)),
        minW: Math.max(1, normalizeLayoutValue(movingItem.minW, 1)),
        minH: Math.max(1, normalizeLayoutValue(movingItem.minH, 1)),
        operation,
      };

      const staticRects = normalizedLayout
        .filter((item) => item.i !== movingItem.i)
        .map((item) => {
          const fallback = activeStaticRectById.get(item.i);
          return {
            x: fallback ? fallback.x : item.x,
            y: fallback ? fallback.y : item.y,
            w: fallback ? fallback.w : item.w,
            h: fallback ? fallback.h : item.h,
          };
        });

      const snap = computeSnapPosition(
        movingRect,
        staticRects,
        {
          cols: CANVAS_COLS,
          rowHeight: CANVAS_ROW_HEIGHT,
          margin: CANVAS_MARGIN,
          containerWidth: width,
        },
        SNAP_THRESHOLD
      );

      const snappedLayout = normalizedLayout.map((item) => {
        if (item.i !== movingItem.i) return item;
        const nextItem = {
          ...item,
          x: snap.snappedX,
          y: snap.snappedY,
        };
        if (operation === "resize") {
          nextItem.w = snap.snappedW;
          nextItem.h = snap.snappedH;
        }
        return nextItem;
      });

      return {
        layout: snappedLayout,
        guides: snap.guides,
      };
    },
    [activeStaticRectById, width]
  );

  const updateWidget = React.useCallback(
    (widgetId, updater, options = {}) => {
      const applyMutation =
        options?.snapshot === false ? stageLayoutChange : commitLayoutChange;
      applyMutation((prev) => {
        const pages = prev.pages.map((page) => {
          if (page.id !== activePageId) return page;
          const nextWidgets = (page.widgets || []).map((widget) => {
            if (widget.id !== widgetId) return widget;
            const next = typeof updater === "function" ? updater(widget) : updater;
            return { ...widget, ...next };
          });
          return { ...page, widgets: nextWidgets };
        });
        return { ...prev, pages };
      });
    },
    [activePageId, commitLayoutChange, stageLayoutChange]
  );

  const applyGridLayout = React.useCallback(
    (prev, nextLayout) => {
      if (!Array.isArray(nextLayout)) return prev;
      const nextPages = prev.pages.map((page) => {
        if (page.id !== activePageId) return page;
        const nextWidgets = (page.widgets || []).map((widget) => {
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
        return { ...page, widgets: nextWidgets };
      });
      return { ...prev, pages: nextPages };
    },
    [activePageId]
  );

  const handleLayoutChange = React.useCallback(
    (nextLayout) => {
      if (skipNextLayoutChangeRef.current) {
        skipNextLayoutChangeRef.current = false;
        return;
      }
      if (interactionRef.current) return;
      stageLayoutChange((prev) => applyGridLayout(prev, nextLayout));
    },
    [applyGridLayout, stageLayoutChange]
  );

  const handleDragStart = React.useCallback(() => {
    interactionRef.current = true;
    skipNextLayoutChangeRef.current = false;
    applyGuides(null);
  }, [applyGuides]);

  const handleResizeStart = React.useCallback(() => {
    interactionRef.current = true;
    skipNextLayoutChangeRef.current = false;
    applyGuides(null);
  }, [applyGuides]);

  const handleDrag = React.useCallback(
    (nextLayout, _oldItem, newItem) => {
      const snapped = snapLayoutForInteraction(nextLayout, newItem, "drag");
      applyGuides(snapped.guides);
      stageLayoutChange((prev) => applyGridLayout(prev, snapped.layout));
    },
    [applyGridLayout, applyGuides, snapLayoutForInteraction, stageLayoutChange]
  );

  const handleResize = React.useCallback(
    (nextLayout, _oldItem, newItem) => {
      const snapped = snapLayoutForInteraction(nextLayout, newItem, "resize");
      applyGuides(snapped.guides);
      stageLayoutChange((prev) => applyGridLayout(prev, snapped.layout));
    },
    [applyGridLayout, applyGuides, snapLayoutForInteraction, stageLayoutChange]
  );

  const handleDragStop = React.useCallback(
    (nextLayout, _oldItem, newItem) => {
      const snapped = snapLayoutForInteraction(nextLayout, newItem, "drag");
      interactionRef.current = false;
      skipNextLayoutChangeRef.current = true;
      applyGuides(null);
      commitLayoutChange((prev) => {
        return applyGridLayout(prev, snapped.layout);
      });
    },
    [applyGridLayout, applyGuides, commitLayoutChange, snapLayoutForInteraction]
  );

  const handleResizeStop = React.useCallback(
    (nextLayout, _oldItem, newItem) => {
      const snapped = snapLayoutForInteraction(nextLayout, newItem, "resize");
      interactionRef.current = false;
      skipNextLayoutChangeRef.current = true;
      applyGuides(null);
      commitLayoutChange((prev) => {
        return applyGridLayout(prev, snapped.layout);
      });
    },
    [applyGridLayout, applyGuides, commitLayoutChange, snapLayoutForInteraction]
  );

  React.useEffect(() => {
    if (!autoSaveEnabled || !hasHydrated || !id) return;
    if (autoSaveMutation.isPending || saveMutation.isPending || publishMutation.isPending) {
      return;
    }
    const payload = sanitizeLayoutForSave(debouncedLayoutJson);
    const payloadKey = stableStringify(payload);
    if (!payloadKey || payloadKey === lastSavedKey) return;
    setAutoSaveStatus("saving");
    autoSaveMutation.mutate(payload, {
      onSuccess: () => {
        setLastSavedKey(payloadKey);
        setAutoSaveStatus("saved");
        queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
        queryClient.invalidateQueries({ queryKey: ["reportsV2-versions", id] });
      },
      onError: () => {
        setAutoSaveStatus("error");
      },
    });
  }, [
    autoSaveEnabled,
    autoSaveMutation,
    autoSaveMutation.isPending,
    debouncedLayoutJson,
    hasHydrated,
    id,
    lastSavedKey,
    publishMutation.isPending,
    queryClient,
    saveMutation.isPending,
  ]);

  const addWidgetToActivePage = React.useCallback(
    (widget, options = {}) => {
      if (!activePageId || !widget) return;
      commitLayoutChange((prev) => {
        const nextPages = prev.pages.map((page) => {
          if (page.id !== activePageId) return page;
          return {
            ...page,
            widgets: [...(page.widgets || []), widget],
          };
        });
        return { ...prev, pages: nextPages };
      });
      setSelectedWidgetId(widget.id);
      if (options.scrollIntoView) {
        setInspectorOpen(true);
        scrollToWidgetCard(widget.id);
      }
    },
    [activePageId, commitLayoutChange, scrollToWidgetCard]
  );

  const handleGlobalFiltersChange = React.useCallback(
    (nextFilters) => {
      const normalized = {
        ...DEFAULT_LAYOUT.globalFilters,
        ...(nextFilters || {}),
        dateRange: {
          ...DEFAULT_LAYOUT.globalFilters.dateRange,
          ...(nextFilters?.dateRange || {}),
        },
        controls: {
          ...DEFAULT_FILTER_CONTROLS,
          ...(nextFilters?.controls || {}),
        },
      };
      setPreviewFilters(normalized);
      commitLayoutChange((prev) => ({
        ...prev,
        globalFilters: {
          ...(prev.globalFilters || {}),
          ...normalized,
          dateRange: {
            ...(prev.globalFilters?.dateRange || {}),
            ...normalized.dateRange,
          },
          controls: {
            ...DEFAULT_FILTER_CONTROLS,
            ...(prev.globalFilters?.controls || {}),
            ...normalized.controls,
          },
        },
      }));
    },
    [commitLayoutChange]
  );

  const handleMetricDragStart = React.useCallback(
    (event, metric) => {
      if (!metric?.value) return;
      const payload = {
        metric: metric.queryMetric || metric.value,
        label: metric.label,
        platform: activeMetricPlatform,
        widgetType: metric.widgetType || "kpi",
        dimensions: Array.isArray(metric.dimensions) ? metric.dimensions : [],
      };
      try {
        event.dataTransfer.setData(METRIC_DRAG_TYPE, JSON.stringify(payload));
        event.dataTransfer.setData(
          "text/plain",
          String(metric.label || metric.value)
        );
      } catch (err) {
        // ignore drag payload errors
      }
      event.dataTransfer.effectAllowed = "copy";
    },
    [activeMetricPlatform]
  );

  const handleMetricClick = React.useCallback(
    (metric) => {
      if (!metric?.value) return;
      const position = getNextWidgetPosition(activeWidgets);
      const widget = buildMetricWidget({
        metricKey: metric.queryMetric || metric.value,
        label: metric.label,
        platform: activeMetricPlatform,
        position,
        widgetType: metric.widgetType || "kpi",
        dimensions: metric.dimensions || [],
      });
      addWidgetToActivePage(widget);
    },
    [activeMetricPlatform, activeWidgets, addWidgetToActivePage]
  );

  const hasMetricPayload = React.useCallback((event) => {
    const types = Array.from(event?.dataTransfer?.types || []);
    return types.includes(METRIC_DRAG_TYPE);
  }, []);

  const parseMetricPayload = React.useCallback((event) => {
    if (!event?.dataTransfer) return null;
    const raw = event.dataTransfer.getData(METRIC_DRAG_TYPE);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }, []);

  const handleMetricDragEnter = React.useCallback(
    (event) => {
      if (!hasMetricPayload(event)) return;
      event.preventDefault();
      metricDragCounterRef.current += 1;
      setIsMetricDragOver(true);
    },
    [hasMetricPayload]
  );

  const handleMetricDragOver = React.useCallback(
    (event) => {
      if (!hasMetricPayload(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [hasMetricPayload]
  );

  const handleMetricDragLeave = React.useCallback(
    (event) => {
      if (!hasMetricPayload(event)) return;
      event.preventDefault();
      metricDragCounterRef.current = Math.max(
        0,
        metricDragCounterRef.current - 1
      );
      if (metricDragCounterRef.current === 0) {
        setIsMetricDragOver(false);
      }
    },
    [hasMetricPayload]
  );

  const handleMetricDrop = React.useCallback(
    (event) => {
      const payload = parseMetricPayload(event);
      if (!payload?.metric) return;
      event.preventDefault();
      metricDragCounterRef.current = 0;
      setIsMetricDragOver(false);
      const rect = containerRef.current?.getBoundingClientRect();
      const position =
        rect && width
          ? resolveDropPosition({
              clientX: event.clientX,
              clientY: event.clientY,
              rect,
              containerWidth: width,
              cols: CANVAS_COLS,
              rowHeight: CANVAS_ROW_HEIGHT,
              margin: CANVAS_MARGIN,
            })
          : null;
      const fallback = getNextWidgetPosition(activeWidgets);
      const widget = buildMetricWidget({
        metricKey: payload.metric,
        label: payload.label,
        platform: payload.platform,
        position: position || fallback,
        widgetType: payload.widgetType || "kpi",
        dimensions: payload.dimensions || [],
      });
      addWidgetToActivePage(widget);
    },
    [activeWidgets, addWidgetToActivePage, containerRef, parseMetricPayload, width]
  );

  const handleAddWidget = (type, options = {}) => {
    if (!activePageId) return;
    const preset = WIDGET_PRESETS[type] || WIDGET_PRESETS.kpi;
    const position = getNextWidgetPosition(activeWidgets);
    const baseWidget = {
      id: generateUuid(),
      type,
      title: preset.title || "Widget",
      layout: {
        x: position.x,
        y: position.y,
        w: preset.layout.w,
        h: preset.layout.h,
        minW: preset.layout.minW,
        minH: preset.layout.minH,
      },
    };
    if (type === "text") {
      addWidgetToActivePage({
        ...baseWidget,
        content: {
          text: "Digite seu texto...",
          format: "plain",
        },
        viz: {
          variant: "default",
          showLegend: false,
          format: "auto",
          options: {},
        },
      }, options);
      return;
    }
    addWidgetToActivePage({
      ...baseWidget,
      query: {
        metrics: preset.query.metrics,
        dimensions: preset.query.dimensions,
        filters: [],
        ...(preset.query.sort ? { sort: preset.query.sort } : {}),
        ...(preset.query.limit ? { limit: preset.query.limit } : {}),
      },
      viz: {
        variant: type === "donut" ? "donut" : type === "pie" ? "pie" : "default",
        showLegend: true,
        format: "auto",
        options:
          type === "pie" || type === "donut"
            ? {
                topN: PIE_DEFAULTS.topN,
                showOthers: PIE_DEFAULTS.showOthers,
                othersLabel: PIE_DEFAULTS.othersLabel,
              }
            : {},
      },
    }, options);
  };

  const handleAddTextWidget = () => {
    handleAddWidget("text", { scrollIntoView: true });
  };

  const handleDuplicateWidget = (widgetId) => {
    const widget = activeWidgets.find((item) => item.id === widgetId);
    if (!widget) return;
    const clone = duplicateWidgetItem(widget, activeWidgets, 12);
    if (!clone) return;
    addWidgetToActivePage(clone);
  };

  const handleRemoveWidget = (widgetId) => {
    const ok = window.confirm("Tem certeza que deseja deletar este widget?");
    if (!ok) return;
    commitLayoutChange((prev) => {
      const pages = prev.pages.map((page) => {
        if (page.id !== activePageId) return page;
        return {
          ...page,
          widgets: (page.widgets || []).filter((widget) => widget.id !== widgetId),
        };
      });
      return { ...prev, pages };
    });
    if (selectedWidgetId === widgetId) {
      setSelectedWidgetId(null);
    }
  };

  const handleEnableControl = (controlKey) => {
    if (!controlKey) return;
    commitLayoutChange((prev) => ({
      ...prev,
      globalFilters: {
        ...(prev.globalFilters || {}),
        controls: {
          ...DEFAULT_FILTER_CONTROLS,
          ...(prev.globalFilters?.controls || {}),
          [controlKey]: true,
        },
      },
    }));
  };

  const handleToggleControl = (controlKey, checked) => {
    const enabled = Boolean(checked);
    commitLayoutChange((prev) => {
      const currentGlobal = prev.globalFilters || {};
      const nextGlobal = {
        ...currentGlobal,
        controls: {
          ...DEFAULT_FILTER_CONTROLS,
          ...(currentGlobal.controls || {}),
          [controlKey]: enabled,
        },
      };
      if (!enabled) {
        if (controlKey === "showPlatforms") nextGlobal.platforms = [];
        if (controlKey === "showAccounts") nextGlobal.accounts = [];
      }
      return {
        ...prev,
        globalFilters: nextGlobal,
      };
    });
    setPreviewFilters((prev) => {
      const next = {
        ...prev,
        controls: {
          ...DEFAULT_FILTER_CONTROLS,
          ...(prev?.controls || {}),
          [controlKey]: enabled,
        },
      };
      if (!enabled) {
        if (controlKey === "showPlatforms") next.platforms = [];
        if (controlKey === "showAccounts") next.accounts = [];
      }
      return next;
    });
  };

  const handleAddPage = () => {
    const nextIndex = pages.length + 1;
    const newPage = {
      id: generateUuid(),
      name: `Página ${nextIndex}`,
      widgets: [],
    };
    commitLayoutChange((prev) => ({
      ...prev,
      pages: [...prev.pages, newPage],
    }));
    setActivePageId(newPage.id);
    setSelectedWidgetId(null);
  };

  const handleRenamePage = () => {
    if (!activePage) return;
    setPageNameDraft(activePage.name || "");
    setShowRenamePage(true);
  };

  const handleConfirmRename = () => {
    const nextName = String(pageNameDraft || "").trim().slice(0, 60);
    if (!nextName || !activePageId) return;
    commitLayoutChange((prev) => ({
      ...prev,
      pages: prev.pages.map((page) =>
        page.id === activePageId ? { ...page, name: nextName } : page
      ),
    }));
    setShowRenamePage(false);
  };

  const handleRemovePage = () => {
    if (pages.length <= 1 || !activePageId) return;
    const ok = window.confirm(
      "Tem certeza que deseja remover esta pagina? Os widgets dela serao removidos."
    );
    if (!ok) return;
    commitLayoutChange((prev) => {
      const nextPages = prev.pages.filter((page) => page.id !== activePageId);
      return { ...prev, pages: nextPages.length ? nextPages : prev.pages };
    });
    const nextPage = pages.find((page) => page.id !== activePageId);
    if (nextPage) {
      setActivePageId(nextPage.id);
      setSelectedWidgetId(nextPage.widgets?.[0]?.id || null);
    }
  };

  const handleApplyDashboardTheme = () => {
    const brandColor = String(themeDraft.brandColor || "").trim();
    const accentColor = String(themeDraft.accentColor || "").trim();
    const radiusRaw = Number(themeDraft.radius);

    if (!HEX_COLOR_RE.test(brandColor) || !HEX_COLOR_RE.test(accentColor)) {
      setThemeFormError("Use cores validas no formato hexadecimal (#RRGGBB).");
      return;
    }

    const radius = Number.isFinite(radiusRaw)
      ? Math.max(0, Math.min(32, Math.round(radiusRaw)))
      : DEFAULT_LAYOUT.theme.radius;

    const normalizedTheme = normalizeThemeFront({
      ...(layoutJson.theme || {}),
      brandColor,
      accentColor,
      radius,
    });

    commitLayoutChange((prev) => ({
      ...prev,
      theme: normalizedTheme,
    }));
    setThemeDraft({
      brandColor: normalizedTheme.brandColor,
      accentColor: normalizedTheme.accentColor,
      radius: String(normalizedTheme.radius),
    });
    setThemeFormError("");
    setActionMessage({
      type: "success",
      text: "Tema aplicado ao dashboard.",
    });
  };

  const handleChangeWidgetType = (nextType) => {
    if (!selectedWidget) return;
    updateWidget(selectedWidget.id, (widget) => {
      if (nextType === "text") {
        return {
          ...widget,
          type: "text",
          content: {
            text: String(widget?.content?.text || "Digite seu texto..."),
            format: widget?.content?.format === "markdown" ? "markdown" : "plain",
          },
          viz: {
            ...widget.viz,
            showLegend: false,
          },
          query: undefined,
        };
      }

      const metrics = widget.query?.metrics?.length
        ? widget.query.metrics
        : WIDGET_PRESETS[nextType]?.query?.metrics || ["spend"];
      let dimensions = widget.query?.dimensions || [];
      let sort = widget.query?.sort;
      let limit = widget.query?.limit;
      if (nextType === "timeseries") {
        dimensions = ["date"];
      }
      if (nextType === "bar") {
        if (dimensions.length !== 1 || dimensions[0] === "date") {
          dimensions = ["platform"];
        }
      }
      if (nextType === "pie" || nextType === "donut") {
        const fallbackDimension =
          dimensions.find((value) => value && value !== "date") || "platform";
        dimensions = [fallbackDimension];
      }
      if (nextType === "kpi") {
        if (dimensions.length > 1) dimensions = dimensions.slice(0, 1);
        if (dimensions.length === 1 && dimensions[0] !== "date") {
          dimensions = [];
        }
      }
      const nextMetrics =
        nextType === "pie" || nextType === "donut"
          ? [metrics[0] || "spend"]
          : metrics;
      if (nextType === "table") {
        if (!limit) {
          limit = 25;
        }
        if (!sort?.field) {
          const fallbackSortField = dimensions[0] || metrics[0];
          sort = fallbackSortField
            ? { field: fallbackSortField, direction: "desc" }
            : undefined;
        }
      } else if (nextType === "pie" || nextType === "donut") {
        sort = null;
      } else {
        sort = null;
      }

      const nextQuery = {
        ...widget.query,
        metrics: nextMetrics,
        dimensions,
        ...(limit ? { limit } : {}),
      };
      if (sort) {
        nextQuery.sort = sort;
      } else {
        delete nextQuery.sort;
      }
      if (!limit) {
        delete nextQuery.limit;
      }
      const nextVizOptions =
        nextType === "pie" || nextType === "donut"
          ? {
              topN: Number.isFinite(Number(widget?.viz?.options?.topN))
                ? Math.max(3, Math.min(20, Math.round(Number(widget.viz.options.topN))))
                : PIE_DEFAULTS.topN,
              showOthers: widget?.viz?.options?.showOthers !== false,
              othersLabel:
                String(widget?.viz?.options?.othersLabel || "").trim() ||
                PIE_DEFAULTS.othersLabel,
            }
          : widget?.viz?.options || {};
      return {
        ...widget,
        type: nextType,
        query: nextQuery,
        viz: {
          ...widget.viz,
          variant:
            nextType === "donut"
              ? "donut"
              : nextType === "pie"
              ? "pie"
              : widget?.viz?.variant || "default",
          options: nextVizOptions,
        },
        content: undefined,
      };
    });
  };

  const handleToggleMetric = (metric) => {
    if (!selectedWidget) return;
    if (selectedWidget.type === "text") return;
    updateWidget(selectedWidget.id, (widget) => {
      const current = Array.isArray(widget.query?.metrics)
        ? widget.query.metrics
        : [];
      const dimensions = Array.isArray(widget.query?.dimensions)
        ? widget.query.dimensions
        : [];
      if (widget.type === "kpi" || widget.type === "pie" || widget.type === "donut") {
        const nextMetrics = [metric];
        const sort = sanitizeSortForFields(widget.query?.sort, [
          ...dimensions,
          ...nextMetrics,
        ]);
        const nextQuery = {
          ...widget.query,
          metrics: nextMetrics,
        };
        if (sort) {
          nextQuery.sort = sort;
        } else {
          delete nextQuery.sort;
        }
        return {
          ...widget,
          query: nextQuery,
        };
      }
      const next = current.includes(metric)
        ? current.filter((item) => item !== metric)
        : [...current, metric];
      const sort = sanitizeSortForFields(widget.query?.sort, [
        ...dimensions,
        ...next,
      ]);
      const nextQuery = {
        ...widget.query,
        metrics: next,
      };
      if (sort) {
        nextQuery.sort = sort;
      } else {
        delete nextQuery.sort;
      }
      return {
        ...widget,
        query: nextQuery,
      };
    });
  };

  const handleDimensionChange = (value) => {
    if (!selectedWidget) return;
    if (selectedWidget.type === "text") return;
    updateWidget(selectedWidget.id, (widget) => {
      const isPieLike = widget.type === "pie" || widget.type === "donut";
      const nextDimensions = isPieLike
        ? [value === "date" || value === "none" ? "platform" : value]
        : value === "none"
        ? []
        : [value];
      const metrics = Array.isArray(widget.query?.metrics) ? widget.query.metrics : [];
      const sort = sanitizeSortForFields(widget.query?.sort, [
        ...nextDimensions,
        ...metrics,
      ]);
      const nextQuery = {
        ...widget.query,
        dimensions: nextDimensions,
      };
      if (sort) {
        nextQuery.sort = sort;
      } else {
        delete nextQuery.sort;
      }
      return {
        ...widget,
        query: nextQuery,
      };
    });
  };

  const handleFiltersChange = (nextFilters) => {
    if (!selectedWidget) return;
    if (selectedWidget.type === "text") return;
    updateWidget(selectedWidget.id, (widget) => {
      return {
        ...widget,
        query: {
          ...widget.query,
          filters: Array.isArray(nextFilters) ? nextFilters : [],
        },
      };
    });
  };

  const handleSortChange = (sort) => {
    if (!selectedWidget) return;
    if (selectedWidget.type === "text") return;
    updateWidget(selectedWidget.id, (widget) => {
      const current = { ...(widget.query || {}) };
      if (!sort?.field) {
        delete current.sort;
      } else {
        current.sort = {
          field: String(sort.field),
          direction: sort.direction === "desc" ? "desc" : "asc",
        };
      }
      return {
        ...widget,
        query: current,
      };
    });
  };

  const handleLimitChange = (rawValue) => {
    if (!selectedWidget) return;
    if (selectedWidget.type === "text") return;
    const parsed = Number(rawValue);
    updateWidget(selectedWidget.id, (widget) => {
      const current = { ...(widget.query || {}) };
      if (!Number.isFinite(parsed) || rawValue === "") {
        delete current.limit;
      } else {
        current.limit = Math.max(1, Math.min(500, Math.round(parsed)));
      }
      return {
        ...widget,
        query: current,
      };
    });
  };

  const handleTitleChange = (title) => {
    if (!selectedWidget) return;
    updateWidget(selectedWidget.id, {
      title,
    });
  };

  const handleShowLegendChange = (checked) => {
    if (!selectedWidget) return;
    if (selectedWidget.type === "text") return;
    updateWidget(selectedWidget.id, {
      viz: {
        ...selectedWidget.viz,
        showLegend: Boolean(checked),
      },
    });
  };

  const handleShowTitleChange = (checked) => {
    if (!selectedWidget) return;
    updateWidget(selectedWidget.id, (widget) => ({
      ...widget,
      viz: {
        ...(widget.viz || {}),
        options: {
          ...(widget?.viz?.options || {}),
          showTitle: Boolean(checked),
        },
      },
    }));
  };

  const handleGridlinesChange = (checked) => {
    if (!selectedWidget) return;
    if (selectedWidget.type !== "timeseries" && selectedWidget.type !== "bar") return;
    updateWidget(selectedWidget.id, (widget) => ({
      ...widget,
      viz: {
        ...(widget.viz || {}),
        options: {
          ...(widget?.viz?.options || {}),
          showGrid: Boolean(checked),
        },
      },
    }));
  };

  const handleFormatChange = (value) => {
    if (!selectedWidget) return;
    updateWidget(selectedWidget.id, {
      viz: {
        ...selectedWidget.viz,
        format: value,
      },
    });
  };

  const handleVariantChange = (value) => {
    if (!selectedWidget) return;
    if (selectedWidget.type !== "pie" && selectedWidget.type !== "donut") return;
    const variant = value === "donut" ? "donut" : "pie";
    updateWidget(selectedWidget.id, {
      type: variant,
      viz: {
        ...selectedWidget.viz,
        variant,
        options: {
          topN: Number.isFinite(Number(selectedWidget?.viz?.options?.topN))
            ? Math.max(
                3,
                Math.min(20, Math.round(Number(selectedWidget.viz.options.topN)))
              )
            : PIE_DEFAULTS.topN,
          showOthers: selectedWidget?.viz?.options?.showOthers !== false,
          othersLabel:
            String(selectedWidget?.viz?.options?.othersLabel || "").trim() ||
            PIE_DEFAULTS.othersLabel,
        },
      },
    });
  };

  const handlePieOptionsChange = (patch) => {
    if (!selectedWidget) return;
    if (selectedWidget.type !== "pie" && selectedWidget.type !== "donut") return;
    updateWidget(selectedWidget.id, (widget) => {
      const currentOptions = {
        topN: Number.isFinite(Number(widget?.viz?.options?.topN))
          ? Math.max(3, Math.min(20, Math.round(Number(widget.viz.options.topN))))
          : PIE_DEFAULTS.topN,
        showOthers: widget?.viz?.options?.showOthers !== false,
        othersLabel:
          String(widget?.viz?.options?.othersLabel || "").trim() ||
          PIE_DEFAULTS.othersLabel,
      };
      const nextTopN = Object.prototype.hasOwnProperty.call(patch || {}, "topN")
        ? Math.max(3, Math.min(20, Math.round(Number(patch.topN) || PIE_DEFAULTS.topN)))
        : currentOptions.topN;
      const nextShowOthers = Object.prototype.hasOwnProperty.call(
        patch || {},
        "showOthers"
      )
        ? Boolean(patch.showOthers)
        : currentOptions.showOthers;
      const nextOthersLabel = Object.prototype.hasOwnProperty.call(
        patch || {},
        "othersLabel"
      )
        ? String(patch.othersLabel || "").trim() || PIE_DEFAULTS.othersLabel
        : currentOptions.othersLabel;

      return {
        ...widget,
        viz: {
          ...widget.viz,
          options: {
            ...widget?.viz?.options,
            topN: nextTopN,
            showOthers: nextShowOthers,
            othersLabel: nextOthersLabel,
          },
        },
      };
    });
  };

  const handleTextContentChange = (value) => {
    if (!selectedWidget || selectedWidget.type !== "text") return;
    updateWidget(selectedWidget.id, {
      content: {
        text: value,
        format: "plain",
      },
    });
  };

  const handleSave = async () => {
    setShowValidation(true);
    if (hasValidationErrors) return;
    setActionMessage(null);
    const payload = sanitizeLayoutForSave(layoutJson);
    const payloadKey = stableStringify(payload);
    try {
      await saveMutation.mutateAsync(payload);
      setLastSavedKey(payloadKey);
      setAutoSaveStatus("saved");
    } catch (err) {
      // handled by mutation
    }
  };

  const handlePublish = async () => {
    setShowValidation(true);
    if (hasValidationErrors) return;
    setActionMessage(null);
    const payload = sanitizeLayoutForSave(layoutJson);
    const payloadKey = stableStringify(payload);
    try {
      await publishMutation.mutateAsync(payload);
      setLastSavedKey(payloadKey);
      setAutoSaveStatus("saved");
    } catch (err) {
      // handled by mutation
    }
  };

  const handleCloneDashboard = async () => {
    setActionMessage(null);
    try {
      await cloneMutation.mutateAsync();
    } catch (err) {
      // handled by mutation
    }
  };

  const handleOpenSaveTemplate = () => {
    setTemplateName(`${dashboard?.name || "Novo dashboard"} - Template`);
    setTemplateCategory("Meus templates");
    setShowSaveTemplate(true);
  };

  const handleSaveTemplate = async () => {
    const name = String(templateName || "").trim();
    if (!name) {
      showToast("Informe o nome do template.", "error");
      return;
    }
    const layoutPayload = sanitizeLayoutForSave(layoutJson);
    await createTemplateMutation.mutateAsync({
      name,
      category: String(templateCategory || "").trim() || "Meus templates",
      layoutJson: layoutPayload,
    });
  };

  const handleViewClient = () => {
    if (!id) return;
    navigate(`/relatorios/v2/${id}`);
  };

  const handleRestoreVersion = (version) => {
    if (!version?.layoutJson) return;
    const merged = mergeLayoutDefaults(version.layoutJson);
    resetState(merged);
    setThemeDraft({
      brandColor: merged.theme.brandColor,
      accentColor: merged.theme.accentColor,
      radius: String(merged.theme.radius),
    });
    setThemeFormError("");
    setPreviewFilters(buildInitialFilters(merged));
    const firstPage = Array.isArray(merged.pages) ? merged.pages[0] : null;
    if (firstPage?.id) {
      setActivePageId(firstPage.id);
      setSelectedWidgetId(firstPage.widgets?.[0]?.id || null);
    }
    setPreviewMode(false);
    setShowHistory(false);
    setActionMessage({
      type: "success",
      text: `Versão ${version.versionNumber} restaurada como rascunho.`,
    });
  };

  const handleRollbackPublished = async (versionId) => {
    if (!versionId) return;
    setActionMessage(null);
    try {
      await rollbackMutation.mutateAsync(versionId);
      setShowHistory(false);
    } catch (err) {
      // handled by mutation
    }
  };

  if (isLoading) {
    return (
      <ThemeProvider
        theme={layoutJson?.theme}
        className="min-h-screen bg-[var(--surface-muted)]"
      >
        <div className="mx-auto max-w-[1400px] px-6 py-10">
          <div className="h-6 w-48 rounded-full kondor-shimmer" />
          <div className="mt-6 h-16 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
          <div className="mt-6 h-[420px] rounded-[24px] border border-[var(--border)] kondor-shimmer" />
        </div>
      </ThemeProvider>
    );
  }

  if (error || !dashboard) {
    return (
      <ThemeProvider
        theme={layoutJson?.theme}
        className="min-h-screen bg-[var(--surface-muted)]"
      >
        <div className="mx-auto max-w-[1200px] px-6 py-10">
          <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700">
            Não foi possível carregar o dashboard.
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (!dashboard.latestVersion) {
    return (
      <ThemeProvider
        theme={layoutJson?.theme}
        className="min-h-screen bg-[var(--surface-muted)]"
      >
        <div className="mx-auto max-w-[1200px] px-6 py-10">
          <div className="rounded-[16px] border border-purple-200 bg-purple-50 px-6 py-5 text-sm text-purple-700">
            Você não tem permissão para editar este dashboard.
          </div>
        </div>
      </ThemeProvider>
    );
  }
  const autoSaveLabel = autoSaveEnabled
    ? autoSaveStatus === "saving"
      ? "Salvando..."
      : autoSaveStatus === "error"
      ? "Erro"
      : autoSaveStatus === "saved"
      ? "Salvo"
      : "Ativo"
    : "Desligado";

  return (
    <ThemeProvider
      theme={layoutJson?.theme}
      className="min-h-screen reportei-theme bg-[var(--surface-muted)]"
    >
      <ReporteiTopbar />

      <ReporteiReportToolbar
        title={dashboard.name}
        statusLabel={autoSaveLabel}
        onBack={() => navigate("/relatorios/v2")}
        onSaveTemplate={handleOpenSaveTemplate}
        onViewClient={handleViewClient}
        onShare={() => setShowShareDialog(true)}
        leftContent={
          brandId ? (
            <div className="ml-2 hidden items-center gap-2 lg:flex">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                GA4
              </span>
              <div className="w-[320px]">
                <Select
                  value={ga4ActivePropertyId || ""}
                  onValueChange={(value) => {
                    if (!value) return;
                    if (value === ga4ActivePropertyId) return;
                    setGa4PropertyMutation.mutate(value);
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      "h-8 w-full rounded-full border-[#d1dae6] bg-white px-3 text-[12px] font-bold text-slate-600 hover:bg-slate-50",
                      setGa4PropertyMutation.isPending && "opacity-60"
                    )}
                    disabled={
                      setGa4PropertyMutation.isPending ||
                      ga4StatusQuery.isLoading ||
                      ga4Properties.length === 0
                    }
                  >
                    <SelectValue
                      placeholder={
                        ga4StatusQuery.isLoading
                          ? "Carregando properties..."
                          : ga4Properties.length
                          ? "Selecionar propriedade GA4"
                          : "Conecte o GA4"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    {ga4Properties.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {setGa4PropertyMutation.isPending ? (
                <span className="text-[11px] font-semibold text-slate-400">
                  Atualizando...
                </span>
              ) : null}
              {ga4BrandSettingsQuery.error?.status === 409 ? (
                <span className="text-[11px] font-semibold text-amber-700">
                  Selecione uma property para ativar o GA4.
                </span>
              ) : null}
            </div>
          ) : null
        }
        extraActions={
          <div className="hidden items-center gap-1.5 2xl:flex">
            <Button
              variant="secondary"
              onClick={() => setMetricsPanelOpen((prev) => !prev)}
              className="reportei-toolbar-button gap-1.5 px-3"
            >
              <Sidebar className="h-4 w-4" />
              {metricsPanelOpen ? "Fechar métricas" : "Adicionar métricas"}
            </Button>
            <Button variant="secondary" onClick={() => setInspectorOpen((prev) => !prev)} className="reportei-toolbar-button px-3">
              <SlidersHorizontal className="h-4 w-4" />
              {inspectorOpen ? "Fechar painel" : "Painel"}
            </Button>
            <Button variant="secondary" onClick={undo} disabled={!canUndo} className="reportei-toolbar-button w-8 p-0">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="secondary" onClick={redo} disabled={!canRedo} className="reportei-toolbar-button w-8 p-0">
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button variant="secondary" onClick={() => setShowHistory(true)} className="reportei-toolbar-button w-8 p-0">
              <History className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              onClick={handleCloneDashboard}
              disabled={cloneMutation.isPending}
              className="reportei-toolbar-button w-8 p-0"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              onClick={handleSave}
              disabled={saveMutation.isPending || publishMutation.isPending}
              className="reportei-toolbar-button gap-1.5 px-3"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button
              onClick={handlePublish}
              disabled={saveMutation.isPending || publishMutation.isPending}
              className="h-8 rounded-full px-3 text-xs font-bold"
            >
              <CheckCircle2 className="h-4 w-4" />
              {publishMutation.isPending ? "Publicando..." : "Publicar"}
            </Button>
          </div>
        }
      />

      {metricsPanelOpen ? (
        <>
          <div className="fixed bottom-0 left-0 top-[100px] z-50 w-[360px] max-w-[90vw] border-r border-[#d8e1ec] bg-white p-3 shadow-[0_18px_32px_rgba(15,23,42,0.14)]">
            <MetricsLibraryPanel
              mode="drawer"
              platforms={metricsPlatformOptions}
              activePlatform={activeMetricPlatform}
              onPlatformChange={setActiveMetricPlatform}
              groups={metricGroupsForActivePlatform}
              metrics={metricsForActivePlatform}
              searchTerm={metricsSearch}
              onSearchChange={setMetricsSearch}
              onMetricClick={handleMetricClick}
              onMetricDragStart={handleMetricDragStart}
            />
          </div>
        </>
      ) : null}

      <div className="mx-auto w-full max-w-[1760px] px-4 py-5 lg:px-6">
        <div className="mb-5" data-global-filters="true">
          <ReporteiFiltersCards
            filters={previewFilters}
            onChange={handleGlobalFiltersChange}
            shareUrl={shareUrl}
            officialDateRange={officialDateRange}
          />
        </div>

        <ReporteiLeftRail
          items={metricsPlatformOptions.map((platform) => {
            const badge = PLATFORM_BADGE[platform.value] || {
              short: platform.label.slice(0, 1).toUpperCase(),
              className: "bg-slate-100 text-slate-700",
            };
            return {
              value: platform.value,
              label: platform.label,
              shortLabel: badge.short,
              className: badge.className,
            };
          })}
          activeItem={activeMetricPlatform}
          onSelect={(value) => {
            setActiveMetricPlatform(value);
            setMetricsPanelOpen(true);
          }}
          onAdd={() => setMetricsPanelOpen(true)}
        />

        <div className="flex gap-4 lg:pl-8">
          <main className="min-w-0 flex-1">
            {pages.length > 1 ? (
              <div className="mb-4">
                <div
                  role="tablist"
                  aria-label="Páginas do dashboard"
                  className="mt-2 flex flex-wrap gap-2 rounded-[14px] border border-slate-200 bg-slate-50 p-1.5"
                >
                  {pages.map((page) => (
                    <button
                      key={page.id}
                      role="tab"
                      type="button"
                      aria-selected={page.id === activePageId}
                      className={
                        page.id === activePageId
                          ? "rounded-[12px] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                          : "rounded-[12px] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                      }
                      onClick={() => setActivePageId(page.id)}
                    >
                      {page.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <ReporteiCoverCard
              title={dashboard.name}
              subtitle={dashboard.subtitle || "Análise de desempenho"}
              filters={previewFilters}
              officialDateRange={officialDateRange}
              onAddAnalysis={handleAddTextWidget}
              className="mb-4"
            />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={handleAddTextWidget}
                  className="h-8 gap-1.5 rounded-full border-[#d1dae6] bg-white px-3 text-xs font-bold text-slate-600"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  + Adicionar análise
                </Button>
                <Button
                  variant="default"
                  onClick={() => setMetricsPanelOpen(true)}
                  className="h-8 gap-1.5 rounded-full bg-[var(--primary)] px-3 text-xs font-bold text-white"
                >
                  <Layers3 className="h-3.5 w-3.5" />
                  + Adicionar métricas
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={handleAddPage} className="h-8 rounded-full px-3 text-xs font-bold">
                  + Nova página
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleRenamePage}
                  disabled={!activePageId}
                  className="h-8 rounded-full px-3 text-xs font-bold"
                >
                  Renomear
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleRemovePage}
                  disabled={pages.length <= 1}
                  className="h-8 rounded-full px-3 text-xs font-bold"
                >
                  Remover
                </Button>
                <div className="ml-1 flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs">
                  <Checkbox
                    checked={autoSaveEnabled}
                    onCheckedChange={(checked) => {
                      const enabled = Boolean(checked);
                      setAutoSaveEnabled(enabled);
                      if (!enabled) setAutoSaveStatus("idle");
                    }}
                  />
                  <span className="font-semibold text-[var(--text)]">Auto-salvar</span>
                </div>
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
              className="rounded-[16px] border border-slate-200 border-t-[3px] border-t-[#0b5ed7] bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
              style={{ minHeight: "420px" }}
              onMouseDown={(event) => {
                if (event.target.closest("[data-editor-widget-card='true']")) return;
                if (event.target.closest("[data-global-filters='true']")) return;
                setSelectedWidgetId(null);
              }}
            >
              <AddMenu
                controls={controlFlags}
                onAddChart={handleAddWidget}
                onAddText={handleAddTextWidget}
                onEnableControl={handleEnableControl}
              />

              <div className="mt-4">
                {previewMode ? (
                  <DashboardRenderer
                    layout={layoutJson}
                    dashboardId={dashboard.id}
                    brandId={dashboard.brandId}
                    globalFilters={debouncedPreviewFilters}
                    activePageId={activePageId}
                    onWidgetMetaChange={handleWidgetMetaChange}
                  />
                ) : (
                  <div
                    className={cn(
                      "relative",
                      isMetricDragOver &&
                        "rounded-[16px] ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--surface)]"
                    )}
                    onDragEnter={handleMetricDragEnter}
                    onDragOver={handleMetricDragOver}
                    onDragLeave={handleMetricDragLeave}
                    onDrop={handleMetricDrop}
                  >
                    {activeWidgets.length ? (
                      <DashboardCanvas
                        layout={rglLayout}
                        items={activeWidgets}
                        width={width}
                        containerRef={containerRef}
                        isEditable
                        rowHeight={CANVAS_ROW_HEIGHT}
                        margin={CANVAS_MARGIN}
                        onLayoutChange={handleLayoutChange}
                        onDragStart={handleDragStart}
                        onDrag={handleDrag}
                        onDragStop={handleDragStop}
                        onResizeStart={handleResizeStart}
                        onResize={handleResize}
                        onResizeStop={handleResizeStop}
                        renderItem={(widget) => (
                          <EditorWidgetCard
                            widget={widget}
                            dashboardId={dashboard.id}
                            brandId={dashboard.brandId}
                            globalFilters={debouncedPreviewFilters}
                            pageId={activePageId}
                            selected={selectedWidgetId === widget.id}
                            hasErrors={Boolean(validation.widgetIssues[widget.id])}
                            errorCount={validation.widgetIssues[widget.id]?.length || 0}
                            onSelect={(widgetId) => {
                              setSelectedWidgetId(widgetId);
                              setInspectorOpen(true);
                            }}
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
                        <p className="font-semibold text-slate-900">
                          Sem widgets
                        </p>
                        <p className="max-w-[320px] text-xs text-slate-500">
                          Clique em "Adicionar métricas" ou arraste uma métrica para o dashboard.
                        </p>
                      </div>
                    )}

                    {isMetricDragOver ? (
                      <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-[14px] border-2 border-dashed border-[var(--primary)] bg-white/80 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
                        Solte para adicionar
                      </div>
                    ) : null}

                    <GuidesOverlay
                      guides={activeGuides}
                      width={width}
                      height={guidesCanvasHeight}
                    />
                  </div>
                )}
              </div>
            </div>
          </main>

          {inspectorOpen ? (
          <aside className="sticky top-[176px] hidden w-full max-w-[360px] space-y-4 self-start xl:block">
          <SidePanel
            selectedWidget={selectedWidget}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            validationSummary={validationSummary}
            widgetTypes={WIDGET_TYPES}
            metricOptions={METRIC_OPTIONS}
            dimensionOptions={DIMENSION_OPTIONS}
            formatOptions={FORMAT_OPTIONS}
            onWidgetTypeChange={handleChangeWidgetType}
            onToggleMetric={handleToggleMetric}
            onDimensionChange={handleDimensionChange}
            onFiltersChange={handleFiltersChange}
            onSortChange={handleSortChange}
            onLimitChange={handleLimitChange}
            onTitleChange={handleTitleChange}
            onShowTitleChange={handleShowTitleChange}
            onShowLegendChange={handleShowLegendChange}
            onGridlinesChange={handleGridlinesChange}
            onFormatChange={handleFormatChange}
            onTextContentChange={handleTextContentChange}
            onVariantChange={handleVariantChange}
            onPieOptionsChange={handlePieOptionsChange}
          />

          <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_12px_24px_rgba(15,23,42,0.1)]">
            <div className="mb-3">
              <p className="text-sm font-semibold text-[var(--text)]">
                Tema do dashboard
              </p>
              <p className="text-xs text-[var(--muted)]">
                Ajuste as cores e o raio para viewer e preview.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="dashboard-theme-brand"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]"
                >
                  Brand color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Cor principal do dashboard"
                    value={HEX_COLOR_RE.test(themeDraft.brandColor) ? themeDraft.brandColor : "#B050F0"}
                    onChange={(event) => {
                      setThemeDraft((prev) => ({
                        ...prev,
                        brandColor: event.target.value,
                      }));
                      setThemeFormError("");
                    }}
                    className="h-10 w-12 cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-1"
                  />
                  <Input
                    id="dashboard-theme-brand"
                    value={themeDraft.brandColor}
                    onChange={(event) => {
                      setThemeDraft((prev) => ({
                        ...prev,
                        brandColor: event.target.value,
                      }));
                      setThemeFormError("");
                    }}
                    placeholder="#B050F0"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="dashboard-theme-accent"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]"
                >
                  Accent color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Cor de destaque do dashboard"
                    value={HEX_COLOR_RE.test(themeDraft.accentColor) ? themeDraft.accentColor : "#22C55E"}
                    onChange={(event) => {
                      setThemeDraft((prev) => ({
                        ...prev,
                        accentColor: event.target.value,
                      }));
                      setThemeFormError("");
                    }}
                    className="h-10 w-12 cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-1"
                  />
                  <Input
                    id="dashboard-theme-accent"
                    value={themeDraft.accentColor}
                    onChange={(event) => {
                      setThemeDraft((prev) => ({
                        ...prev,
                        accentColor: event.target.value,
                      }));
                      setThemeFormError("");
                    }}
                    placeholder="#22C55E"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="dashboard-theme-radius"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]"
                >
                  Radius (0-32)
                </label>
                <Input
                  id="dashboard-theme-radius"
                  type="number"
                  min={0}
                  max={32}
                  value={themeDraft.radius}
                  onChange={(event) => {
                    setThemeDraft((prev) => ({
                      ...prev,
                      radius: event.target.value,
                    }));
                  }}
                />
              </div>
            </div>

            {themeFormError ? (
              <p className="mt-3 text-xs text-rose-600">{themeFormError}</p>
            ) : null}

            <Button className="mt-4 w-full" onClick={handleApplyDashboardTheme}>
              Aplicar tema
            </Button>
          </div>

          <div className="rounded-[16px] border border-[var(--border)] bg-white p-4 shadow-none transition-shadow hover:shadow-[var(--shadow-sm)]">
            <div className="mb-3">
              <p className="text-sm font-semibold text-[var(--text)]">
                Controles globais
              </p>
              <p className="text-xs text-[var(--muted)]">
                Defina quais filtros aparecem no viewer.
              </p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
                <span className="font-medium text-[var(--text)]">Date range</span>
                <Checkbox
                  checked={controlFlags.showDateRange}
                  onCheckedChange={(checked) =>
                    handleToggleControl("showDateRange", checked)
                  }
                />
              </label>

              <label className="flex items-center justify-between rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
                <span className="font-medium text-[var(--text)]">Plataformas</span>
                <Checkbox
                  checked={controlFlags.showPlatforms}
                  onCheckedChange={(checked) =>
                    handleToggleControl("showPlatforms", checked)
                  }
                />
              </label>

              <label className="flex items-center justify-between rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
                <span className="font-medium text-[var(--text)]">Contas</span>
                <Checkbox
                  checked={controlFlags.showAccounts}
                  onCheckedChange={(checked) =>
                    handleToggleControl("showAccounts", checked)
                  }
                />
              </label>
            </div>
          </div>
          </aside>
          ) : null}
        </div>
      </div>

      <Dialog open={showRenamePage} onOpenChange={setShowRenamePage}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Renomear pagina</DialogTitle>
            <DialogDescription>
              Defina um nome curto para identificar esta pagina.
            </DialogDescription>
          </DialogHeader>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Nome da pagina
            </label>
            <Input
              value={pageNameDraft}
              onChange={(event) => setPageNameDraft(event.target.value)}
              placeholder="Ex: Visao geral"
              maxLength={60}
            />
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowRenamePage(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmRename}
              disabled={!String(pageNameDraft || "").trim()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSaveTemplate} onOpenChange={setShowSaveTemplate}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Salvar como template</DialogTitle>
            <DialogDescription>
              Salve o layout atual para reutilizar em outros dashboards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Nome do template
              </label>
              <Input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Ex: Padrão Meta + GA4"
                maxLength={120}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Categoria
              </label>
              <Input
                value={templateCategory}
                onChange={(event) => setTemplateCategory(event.target.value)}
                placeholder="Meus templates"
                maxLength={80}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowSaveTemplate(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={createTemplateMutation.isPending}
            >
              {createTemplateMutation.isPending ? "Salvando..." : "Salvar template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReporteiShareDialog
        dashboardId={id}
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        onToast={showToast}
        onShareUrlChange={setShareUrl}
      />

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Historico de versoes</DialogTitle>
            <DialogDescription>
              Escolha uma versão para restaurar como rascunho ou publicar um rollback.
            </DialogDescription>
          </DialogHeader>

          {versionsQuery.isLoading ? (
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Carregando versoes...
            </div>
          ) : versionsQuery.error ? (
            <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Não foi possível carregar o histórico.
            </div>
          ) : versions.length ? (
            <div className="space-y-3">
              {versions.map((version) => {
                const isPublished = version.id === dashboard?.publishedVersionId;
                const isLatest = version.id === dashboard?.latestVersion?.id;
                const statusLabel = isPublished
                  ? "Publicado"
                  : isLatest
                  ? "Rascunho atual"
                  : "Rascunho";
                return (
                  <div
                    key={version.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[var(--border)] bg-white p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        Versão {version.versionNumber}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatVersionDate(version.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                          isPublished
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {statusLabel}
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => handleRestoreVersion(version)}
                      >
                        Restaurar rascunho
                      </Button>
                      <Button
                        onClick={() => handleRollbackPublished(version.id)}
                        disabled={rollbackMutation.isPending}
                      >
                        {rollbackMutation.isPending ? "Publicando..." : "Rollback publicado"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Nenhuma versão encontrada.
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowHistory(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toast toast={toast} />
    </ThemeProvider>
  );
}
