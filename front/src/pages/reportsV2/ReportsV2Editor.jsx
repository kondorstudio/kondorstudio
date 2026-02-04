import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useContainerWidth } from "react-grid-layout";
import {
  ArrowLeft,
  Plus,
  Copy,
  Eye,
  Pencil,
  Save,
  CheckCircle2,
  History,
  Undo2,
  Redo2,
} from "lucide-react";
import DashboardCanvas from "@/components/reports/widgets/DashboardCanvas.jsx";
import DashboardRenderer from "@/components/reportsV2/DashboardRenderer.jsx";
import GlobalFiltersBar from "@/components/reportsV2/GlobalFiltersBar.jsx";
import ThemeProvider from "@/components/reportsV2/ThemeProvider.jsx";
import SidePanel from "@/components/reportsV2/editor/SidePanel.jsx";
import AddMenu from "@/components/reportsV2/editor/AddMenu.jsx";
import WidgetContextMenu from "@/components/reportsV2/editor/WidgetContextMenu.jsx";
import useHistoryState from "@/components/reportsV2/editor/useHistoryState.js";
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
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Checkbox } from "@/components/ui/checkbox.jsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.jsx";
import { cn } from "@/utils/classnames.js";
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
      name: "Pagina 1",
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

const FORMAT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "compact", label: "Compacto" },
  { value: "full", label: "Completo" },
];

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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
          : `Pagina ${index + 1}`,
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
        name: "Pagina 1",
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
      errors.push("Selecione pelo menos uma metrica");
    }

    if (!isTextWidget && widget?.type === "kpi" && metrics.length > 1) {
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

    if (widget?.type === "bar") {
      if (dimensions.length !== 1 || dimensions[0] === "date") {
        errors.push("Grafico exige uma dimensao nao-date");
      }
    }

    if (widget?.type === "pie" || widget?.type === "donut") {
      if (dimensions.length !== 1 || dimensions[0] === "date") {
        errors.push("Pie/Donut exige exatamente 1 dimensao nao-date");
      }
      if (metrics.length !== 1) {
        errors.push("Pie/Donut exige exatamente 1 metrica");
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
          errors.push("Ordenacao deve usar dimensao ou metrica selecionada");
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
        errors.push("Texto do bloco nao pode ficar vazio");
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

  const metricLabel = metrics.length ? metrics.join(", ") : "Sem metricas";
  const dimensionLabel = dimensions.length ? dimensions.join(", ") : "Sem dimensao";
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
  const debouncedPreviewFilters = useDebouncedValue(previewFilters, 400);
  const [actionMessage, setActionMessage] = React.useState(null);
  const [showValidation, setShowValidation] = React.useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = React.useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = React.useState("idle");
  const [showHistory, setShowHistory] = React.useState(false);
  const [showRenamePage, setShowRenamePage] = React.useState(false);
  const [pageNameDraft, setPageNameDraft] = React.useState("");
  const [themeDraft, setThemeDraft] = React.useState(() => ({
    brandColor: DEFAULT_LAYOUT.theme.brandColor,
    accentColor: DEFAULT_LAYOUT.theme.accentColor,
    radius: String(DEFAULT_LAYOUT.theme.radius),
  }));
  const [themeFormError, setThemeFormError] = React.useState("");
  const [lastSavedKey, setLastSavedKey] = React.useState("");
  const [hasHydrated, setHasHydrated] = React.useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["reportsV2-dashboard", id],
    queryFn: () => base44.reportsV2.getDashboard(id),
  });

  const versionsQuery = useQuery({
    queryKey: ["reportsV2-versions", id],
    queryFn: () => base44.reportsV2.listDashboardVersions(id),
    enabled: showHistory && Boolean(id),
  });

  const dashboard = data || null;
  const layoutFromApi =
    dashboard?.latestVersion?.layoutJson ||
    dashboard?.publishedVersion?.layoutJson ||
    null;
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
    const pages = Array.isArray(layoutJson.pages) ? layoutJson.pages : [];
    if (!pages.length) return;
    setActivePageId((current) => {
      if (current && pages.some((page) => page.id === current)) return current;
      return pages[0].id;
    });
  }, [layoutJson.pages]);

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
        text: "Nao foi possivel salvar o rascunho.",
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
        text: "Nao foi possivel publicar.",
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
        text: "Nao foi possivel fazer rollback.",
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
        text: "Nao foi possivel duplicar o dashboard.",
      });
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
      stageLayoutChange((prev) => applyGridLayout(prev, nextLayout));
    },
    [applyGridLayout, stageLayoutChange]
  );

  const handleLayoutCommit = React.useCallback(
    (nextLayout) => {
      commitLayoutChange((prev) => {
        return applyGridLayout(prev, nextLayout);
      });
    },
    [applyGridLayout, commitLayoutChange]
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
    (widget) => {
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
    },
    [activePageId, commitLayoutChange]
  );

  const handleAddWidget = (type) => {
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
      });
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
    });
  };

  const handleAddTextWidget = () => {
    handleAddWidget("text");
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
      name: `Pagina ${nextIndex}`,
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
      text: `Versao ${version.versionNumber} restaurada como rascunho.`,
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
      <ThemeProvider theme={layoutJson?.theme} className="min-h-screen bg-[var(--bg)]">
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
      <ThemeProvider theme={layoutJson?.theme} className="min-h-screen bg-[var(--bg)]">
        <div className="mx-auto max-w-[1200px] px-6 py-10">
          <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700">
            Nao foi possivel carregar o dashboard.
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (!dashboard.latestVersion) {
    return (
      <ThemeProvider theme={layoutJson?.theme} className="min-h-screen bg-[var(--bg)]">
        <div className="mx-auto max-w-[1200px] px-6 py-10">
          <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-700">
            Voce nao tem permissao para editar este dashboard.
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
    <ThemeProvider theme={layoutJson?.theme} className="min-h-screen bg-[var(--bg)]">
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
            <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-xs">
              <Checkbox
                checked={autoSaveEnabled}
                onCheckedChange={(checked) => {
                  const enabled = Boolean(checked);
                  setAutoSaveEnabled(enabled);
                  if (!enabled) setAutoSaveStatus("idle");
                }}
              />
              <span className="font-semibold text-[var(--text)]">Auto-salvar</span>
              <span className="text-[var(--text-muted)]">{autoSaveLabel}</span>
            </div>
            <Button
              variant="secondary"
              onClick={undo}
              disabled={!canUndo}
              leftIcon={Undo2}
              aria-label="Desfazer"
              title="Desfazer"
            >
              Desfazer
            </Button>
            <Button
              variant="secondary"
              onClick={redo}
              disabled={!canRedo}
              leftIcon={Redo2}
              aria-label="Refazer"
              title="Refazer"
            >
              Refazer
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowHistory(true)}
              leftIcon={History}
            >
              Historico
            </Button>
            <Button
              variant="secondary"
              onClick={handleCloneDashboard}
              disabled={cloneMutation.isPending}
              leftIcon={Copy}
            >
              {cloneMutation.isPending ? "Duplicando..." : "Duplicar dashboard"}
            </Button>
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Pagina atual
              </p>
              <div
                role="tablist"
                aria-label="Paginas do dashboard"
                className="mt-2 flex flex-wrap gap-2 rounded-[16px] border border-[var(--border)] bg-white p-2"
              >
                {pages.map((page) => (
                  <button
                    key={page.id}
                    role="tab"
                    type="button"
                    aria-selected={page.id === activePageId}
                    className={
                      page.id === activePageId
                        ? "rounded-[12px] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        : "rounded-[12px] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                    }
                    onClick={() => setActivePageId(page.id)}
                  >
                    {page.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={handleAddPage}>
                + Nova pagina
              </Button>
              <Button
                variant="secondary"
                onClick={handleRenamePage}
                disabled={!activePageId}
              >
                Renomear
              </Button>
              <Button
                variant="secondary"
                onClick={handleRemovePage}
                disabled={pages.length <= 1}
              >
                Remover
              </Button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">
                Canvas do dashboard
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Arraste, redimensione e configure os widgets.
              </p>
            </div>
            <AddMenu
              controls={controlFlags}
              onAddChart={handleAddWidget}
              onAddText={handleAddTextWidget}
              onEnableControl={handleEnableControl}
            />
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
            onMouseDown={(event) => {
              if (event.target.closest("[data-editor-widget-card='true']")) return;
              setSelectedWidgetId(null);
            }}
          >
            {previewMode ? (
              <div>
                <div className="mb-4">
                  <GlobalFiltersBar
                    filters={previewFilters}
                    controls={controlFlags}
                    onChange={setPreviewFilters}
                  />
                </div>
                <DashboardRenderer
                  layout={layoutJson}
                  dashboardId={dashboard.id}
                  brandId={dashboard.brandId}
                  globalFilters={debouncedPreviewFilters}
                  activePageId={activePageId}
                />
              </div>
            ) : activeWidgets.length ? (
              <DashboardCanvas
                layout={rglLayout}
                items={activeWidgets}
                width={width}
                containerRef={containerRef}
                isEditable
                rowHeight={28}
                margin={[16, 16]}
                onLayoutChange={handleLayoutChange}
                onDragStop={handleLayoutCommit}
                onResizeStop={handleLayoutCommit}
                renderItem={(widget) => (
                  <EditorWidgetCard
                    widget={widget}
                    selected={selectedWidgetId === widget.id}
                    hasErrors={Boolean(validation.widgetIssues[widget.id])}
                    errorCount={validation.widgetIssues[widget.id]?.length || 0}
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
            onShowLegendChange={handleShowLegendChange}
            onFormatChange={handleFormatChange}
            onTextContentChange={handleTextContentChange}
            onVariantChange={handleVariantChange}
            onPieOptionsChange={handlePieOptionsChange}
          />

          <div className="mt-4 rounded-[20px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
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
                    value={HEX_COLOR_RE.test(themeDraft.brandColor) ? themeDraft.brandColor : "#F59E0B"}
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
                    placeholder="#F59E0B"
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

          <div className="mt-4 rounded-[20px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
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

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Historico de versoes</DialogTitle>
            <DialogDescription>
              Escolha uma versao para restaurar como rascunho ou publicar um rollback.
            </DialogDescription>
          </DialogHeader>

          {versionsQuery.isLoading ? (
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Carregando versoes...
            </div>
          ) : versionsQuery.error ? (
            <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Nao foi possivel carregar o historico.
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
                        Versao {version.versionNumber}
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
              Nenhuma versao encontrada.
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowHistory(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ThemeProvider>
  );
}
