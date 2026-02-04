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
  History,
} from "lucide-react";
import DashboardCanvas from "@/components/reports/widgets/DashboardCanvas.jsx";
import DashboardRenderer from "@/components/reportsV2/DashboardRenderer.jsx";
import GlobalFiltersBar from "@/components/reportsV2/GlobalFiltersBar.jsx";
import ThemeProvider from "@/components/reportsV2/ThemeProvider.jsx";
import SidePanel from "@/components/reportsV2/editor/SidePanel.jsx";
import {
  useDebouncedValue,
  stableStringify,
  normalizeLayoutFront,
  getActivePage,
  generateUuid,
  normalizeThemeFront,
  DEFAULT_REPORT_THEME,
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
    title: "Pie",
    layout: { w: 4, h: 4, minW: 3, minH: 3 },
    query: { metrics: ["spend"], dimensions: ["platform"] },
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
  const sanitizeWidget = (widget) => {
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
    const sortField = String(widget?.query?.sort?.field || "").trim();
    const sortDirection = widget?.query?.sort?.direction === "desc" ? "desc" : "asc";
    const sort = sortField ? { field: sortField, direction: sortDirection } : null;
    const limitValue = Number(widget?.query?.limit);
    const limit = Number.isFinite(limitValue)
      ? Math.max(1, Math.min(500, Math.round(limitValue)))
      : null;

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
        ...(requiredPlatforms.length ? { requiredPlatforms } : {}),
        ...(sort ? { sort } : {}),
        ...(limit ? { limit } : {}),
      },
      viz: {
        variant: widget?.viz?.variant || "default",
        showLegend: widget?.viz?.showLegend !== false,
        format: widget?.viz?.format || "auto",
        options: widget?.viz?.options || {},
      },
    };
  };

  return {
    theme: merged.theme,
    globalFilters: merged.globalFilters,
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
  const [activePageId, setActivePageId] = React.useState(null);
  const [selectedWidgetId, setSelectedWidgetId] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState("data");
  const [previewMode, setPreviewMode] = React.useState(false);
  const [showAddMenu, setShowAddMenu] = React.useState(false);
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
  const addMenuRef = React.useRef(null);

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
    setLayoutJson(merged);
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
    (widgetId, updater) => {
      setLayoutJson((prev) => {
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
    [activePageId]
  );

  const handleLayoutChange = React.useCallback(
    (nextLayout) => {
      setLayoutJson((prev) => {
        const pages = prev.pages.map((page) => {
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
        return { ...prev, pages };
      });
    },
    [activePageId]
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

  const handleAddWidget = (type) => {
    const preset = WIDGET_PRESETS[type] || WIDGET_PRESETS.kpi;
    if (!activePageId) return;
    const position = getNextWidgetPosition(activeWidgets);
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
        ...(preset.query.sort ? { sort: preset.query.sort } : {}),
        ...(preset.query.limit ? { limit: preset.query.limit } : {}),
      },
      viz: {
        variant: "default",
        showLegend: true,
        format: "auto",
        options: {},
      },
    };
    setLayoutJson((prev) => {
      const pages = prev.pages.map((page) => {
        if (page.id !== activePageId) return page;
        return {
          ...page,
          widgets: [...(page.widgets || []), newWidget],
        };
      });
      return { ...prev, pages };
    });
    setSelectedWidgetId(newWidget.id);
    setShowAddMenu(false);
  };

  const handleDuplicateWidget = (widgetId) => {
    const widget = activeWidgets.find((item) => item.id === widgetId);
    if (!widget) return;
    const position = getNextWidgetPosition(activeWidgets);
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
    setLayoutJson((prev) => {
      const pages = prev.pages.map((page) => {
        if (page.id !== activePageId) return page;
        return {
          ...page,
          widgets: [...(page.widgets || []), clone],
        };
      });
      return { ...prev, pages };
    });
    setSelectedWidgetId(clone.id);
  };

  const handleRemoveWidget = (widgetId) => {
    setLayoutJson((prev) => {
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

  const handleAddPage = () => {
    const nextIndex = pages.length + 1;
    const newPage = {
      id: generateUuid(),
      name: `Pagina ${nextIndex}`,
      widgets: [],
    };
    setLayoutJson((prev) => ({
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
    setLayoutJson((prev) => ({
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
    setLayoutJson((prev) => {
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

    setLayoutJson((prev) => ({
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
      const metrics = widget.query?.metrics?.length
        ? widget.query.metrics
        : WIDGET_PRESETS[nextType]?.query?.metrics || ["spend"];
      let dimensions = widget.query?.dimensions || [];
      let sort = widget.query?.sort;
      let limit = widget.query?.limit;
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
      } else {
        sort = undefined;
      }
      return {
        ...widget,
        type: nextType,
        query: {
          ...widget.query,
          metrics,
          dimensions,
          ...(sort ? { sort } : {}),
          ...(limit ? { limit } : {}),
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

  const handleFiltersChange = (nextFilters) => {
    if (!selectedWidget) return;
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
    setLayoutJson(merged);
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
