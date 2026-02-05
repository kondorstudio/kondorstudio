import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, useIsFetching } from "@tanstack/react-query";
import PageShell from "@/components/ui/page-shell.jsx";
import GlobalFiltersBar from "@/components/reportsV2/GlobalFiltersBar.jsx";
import DashboardRenderer from "@/components/reportsV2/DashboardRenderer.jsx";
import ThemeProvider from "@/components/reportsV2/ThemeProvider.jsx";
import { base44 } from "@/apiClient/base44Client";
import {
  useDebouncedValue,
  normalizeLayoutFront,
  DEFAULT_FILTER_CONTROLS,
  stableStringify,
} from "@/components/reportsV2/utils.js";

function buildInitialFilters(layout) {
  const base = {
    dateRange: { preset: "last_7_days" },
    platforms: [],
    accounts: [],
    compareTo: null,
    autoRefreshSec: 0,
    controls: DEFAULT_FILTER_CONTROLS,
  };
  if (!layout?.globalFilters) return base;
  return {
    ...base,
    ...layout.globalFilters,
    dateRange: {
      ...base.dateRange,
      ...(layout.globalFilters?.dateRange || {}),
    },
  };
}

function parseExportFilters(rawValue) {
  if (!rawValue) return null;
  try {
    const decoded = decodeURIComponent(rawValue);
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

function mergeFilters(base, incoming) {
  if (!incoming || typeof incoming !== "object") return base;
  return {
    ...base,
    ...incoming,
    dateRange: {
      ...base.dateRange,
      ...(incoming.dateRange || {}),
    },
    controls: {
      ...DEFAULT_FILTER_CONTROLS,
      ...(base.controls || {}),
      ...(incoming.controls || {}),
    },
  };
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function PublicReportViewer() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const isPdf = searchParams.get("pdf") === "1";
  const isExport = searchParams.get("export") === "1";
  const exportPageMode = searchParams.get("page") === "all" ? "all" : "current";
  const exportOrientation =
    searchParams.get("orientation") === "landscape" ? "landscape" : "portrait";
  const exportActivePageId = searchParams.get("activePageId") || null;
  const exportFilters = React.useMemo(
    () => parseExportFilters(searchParams.get("filters")),
    [searchParams]
  );
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-report", token],
    queryFn: () => base44.publicReports.getReport(token),
    enabled: Boolean(token),
  });

  const layout = data?.layoutJson || null;
  const normalizedLayout = normalizeLayoutFront(layout);
  const pages = normalizedLayout?.pages || [];
  const health = data?.health || null;
  const globalFilterControls = normalizedLayout?.globalFilters?.controls;
  const [activePageId, setActivePageId] = React.useState(
    exportActivePageId || pages[0]?.id || null
  );
  const [widgetStatusesByPage, setWidgetStatusesByPage] = React.useState({});
  const [isAutoRefreshing, setIsAutoRefreshing] = React.useState(false);
  const [isFilterRefreshing, setIsFilterRefreshing] = React.useState(false);
  const previousFiltersKeyRef = React.useRef("");
  const [filters, setFilters] = React.useState(() =>
    mergeFilters(buildInitialFilters(normalizedLayout), exportFilters)
  );
  const debouncedFilters = useDebouncedValue(filters, 400);
  const debouncedFiltersKey = React.useMemo(
    () => stableStringify(debouncedFilters),
    [debouncedFilters]
  );
  const widgetFetchingCount = useIsFetching({
    queryKey: ["reportsV2-widget", data?.dashboard?.id],
  });
  const shouldRenderAllPages = isExport && exportPageMode === "all";
  const pagesToRender = React.useMemo(() => {
    if (shouldRenderAllPages) return pages;
    const current = pages.filter((page) => page.id === activePageId);
    return current.length ? current : pages.slice(0, 1);
  }, [activePageId, pages, shouldRenderAllPages]);
  const healthIssuesByWidgetId = React.useMemo(() => {
    const map = {};
    const widgets = Array.isArray(health?.widgets) ? health.widgets : [];
    widgets.forEach((issue) => {
      if (!issue?.widgetId || issue?.status === "OK") return;
      map[issue.widgetId] = issue;
    });
    return map;
  }, [health?.widgets]);

  React.useEffect(() => {
    setWidgetStatusesByPage({});
  }, [token]);

  React.useEffect(() => {
    const initial = buildInitialFilters(normalizedLayout);
    setFilters(mergeFilters(initial, exportFilters));
  }, [normalizedLayout, exportFilters]);

  React.useEffect(() => {
    if (!pages.length) return;
    if (isExport) {
      if (
        exportPageMode === "current" &&
        exportActivePageId &&
        pages.some((page) => page.id === exportActivePageId)
      ) {
        setActivePageId(exportActivePageId);
        return;
      }
      setActivePageId(pages[0].id);
      return;
    }
    setActivePageId((current) => {
      if (current && pages.some((page) => page.id === current)) return current;
      return pages[0].id;
    });
  }, [exportActivePageId, exportPageMode, isExport, pages]);

  React.useEffect(() => {
    if (isPdf || isExport) return undefined;
    const refreshSec = Number(filters?.autoRefreshSec || 0);
    if (!refreshSec || !token) return undefined;
    const interval = setInterval(() => {
      setIsAutoRefreshing(true);
      queryClient.invalidateQueries({ queryKey: ["reportsV2-widget", data?.dashboard?.id] });
    }, refreshSec * 1000);
    return () => clearInterval(interval);
  }, [filters?.autoRefreshSec, token, queryClient, data?.dashboard?.id, isPdf, isExport]);

  React.useEffect(() => {
    if (isPdf || isExport) return;
    const previousKey = previousFiltersKeyRef.current;
    if (!previousKey) {
      previousFiltersKeyRef.current = debouncedFiltersKey;
      return;
    }
    if (previousKey !== debouncedFiltersKey) {
      previousFiltersKeyRef.current = debouncedFiltersKey;
      setIsFilterRefreshing(true);
    }
  }, [debouncedFiltersKey, isExport, isPdf]);

  React.useEffect(() => {
    if (widgetFetchingCount > 0) return;
    setIsAutoRefreshing(false);
    setIsFilterRefreshing(false);
  }, [widgetFetchingCount]);

  const fetchReason = React.useMemo(() => {
    if (isAutoRefreshing) return "auto";
    if (isFilterRefreshing) return "filters";
    return "manual";
  }, [isAutoRefreshing, isFilterRefreshing]);

  const refreshNotice = React.useMemo(() => {
    if (widgetFetchingCount <= 0) return null;
    if (isAutoRefreshing) return "Atualizando automaticamente...";
    if (isFilterRefreshing) return "Aplicando filtros...";
    return "Atualizando...";
  }, [isAutoRefreshing, isFilterRefreshing, widgetFetchingCount]);

  const handleWidgetStatusesChange = React.useCallback(({ pageId, statuses }) => {
    if (!pageId || !statuses || typeof statuses !== "object") return;
    setWidgetStatusesByPage((prev) => {
      const current = prev?.[pageId] || {};
      if (stableStringify(current) === stableStringify(statuses)) return prev;
      return {
        ...(prev || {}),
        [pageId]: statuses,
      };
    });
  }, []);

  const exportReady = React.useMemo(() => {
    if (!(isExport || isPdf)) return false;
    if (isLoading || error || !normalizedLayout) return false;
    if (widgetFetchingCount > 0) return false;

    const widgetsToCheck = pagesToRender.flatMap((page) =>
      Array.isArray(page?.widgets) ? page.widgets.map((widget) => ({ pageId: page.id, widget })) : []
    );
    if (!widgetsToCheck.length) return true;

    return widgetsToCheck.every(({ pageId, widget }) => {
      const status = widgetStatusesByPage?.[pageId]?.[widget?.id]?.status || "loading";
      return status !== "loading";
    });
  }, [
    error,
    isExport,
    isLoading,
    isPdf,
    normalizedLayout,
    pagesToRender,
    widgetFetchingCount,
    widgetStatusesByPage,
  ]);

  React.useEffect(() => {
    if (!isExport && !isPdf) {
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-export-ready");
        document.body.removeAttribute("data-export-orientation");
      }
      return undefined;
    }
    if (typeof document !== "undefined") {
      document.body.setAttribute("data-export-ready", exportReady ? "true" : "false");
      document.body.setAttribute(
        "data-export-orientation",
        isExport ? exportOrientation : "portrait"
      );
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-export-ready");
        document.body.removeAttribute("data-export-orientation");
      }
    };
  }, [exportOrientation, exportReady, isExport, isPdf]);

  if (isLoading) {
    return (
      <ThemeProvider theme={normalizedLayout?.theme} className="min-h-screen bg-[var(--bg)]">
        <PageShell>
          <div className="h-6 w-40 rounded-full kondor-shimmer" />
          <div className="mt-6 h-32 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
          <div className="mt-6 h-64 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
        </PageShell>
      </ThemeProvider>
    );
  }

  if (error || !data) {
    return (
      <ThemeProvider theme={normalizedLayout?.theme} className="min-h-screen bg-[var(--bg)]">
        <PageShell>
          <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700">
            Relatório público não encontrado.
          </div>
        </PageShell>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={normalizedLayout?.theme} className="min-h-screen bg-[var(--bg)]">
      <PageShell className={isPdf || isExport ? "print:p-0" : ""}>
        {!isPdf && !isExport ? (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Relatório público
            </p>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              {data.dashboard?.name || "Relatório"}
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Compartilhado para visualização externa.
            </p>
            {refreshNotice ? (
              <p className="mt-2 text-xs text-[var(--muted)]">{refreshNotice}</p>
            ) : null}
          </div>
        ) : null}

        {isExport ? (
          <div className="mb-6 rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              KONDOR STUDIO • RELATORIO
            </p>
            <h1 className="mt-1 text-xl font-semibold text-[var(--text)]">
              {data.dashboard?.name || "Relatório"}
            </h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Gerado em {formatDateTime(data?.meta?.generatedAt)}
            </p>
          </div>
        ) : null}

        {!isPdf && !isExport ? (
          <div className="mb-6">
            <GlobalFiltersBar
              filters={filters}
              controls={globalFilterControls}
              onChange={setFilters}
            />
          </div>
        ) : null}

        {normalizedLayout ? (
          <>
            {!isPdf && !isExport && pages.length > 1 ? (
              <div
                role="tablist"
                aria-label="Páginas do dashboard"
                className="mb-4 flex flex-wrap gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-2"
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
                        : "rounded-[12px] px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                    }
                    onClick={() => setActivePageId(page.id)}
                  >
                    {page.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="space-y-8">
              {pagesToRender.map((page) => (
                <section key={page.id} className="space-y-3">
                  {isExport && pagesToRender.length > 1 ? (
                    <header className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-4 py-2">
                      <p className="text-sm font-semibold text-[var(--text)]">{page.name}</p>
                    </header>
                  ) : null}
                  <DashboardRenderer
                    layout={normalizedLayout}
                    dashboardId={data.dashboard?.id}
                    publicToken={token}
                    globalFilters={debouncedFilters}
                    activePageId={page.id}
                    healthIssuesByWidgetId={healthIssuesByWidgetId}
                    fetchReason={fetchReason}
                    onWidgetStatusesChange={handleWidgetStatusesChange}
                  />
                </section>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-6 py-5 text-sm text-[var(--muted)]">
            Layout não encontrado.
          </div>
        )}
      </PageShell>
    </ThemeProvider>
  );
}
