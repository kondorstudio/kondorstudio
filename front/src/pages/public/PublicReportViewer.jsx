import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageShell from "@/components/ui/page-shell.jsx";
import GlobalFiltersBar from "@/components/reportsV2/GlobalFiltersBar.jsx";
import DashboardRenderer from "@/components/reportsV2/DashboardRenderer.jsx";
import ThemeProvider from "@/components/reportsV2/ThemeProvider.jsx";
import { base44 } from "@/apiClient/base44Client";
import {
  useDebouncedValue,
  normalizeLayoutFront,
  DEFAULT_FILTER_CONTROLS,
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

export default function PublicReportViewer() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const isPdf = searchParams.get("pdf") === "1";
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-report", token],
    queryFn: () => base44.publicReports.getReport(token),
    enabled: Boolean(token),
  });

  const layout = data?.layoutJson || null;
  const normalizedLayout = normalizeLayoutFront(layout);
  const pages = normalizedLayout?.pages || [];
  const globalFilterControls = normalizedLayout?.globalFilters?.controls;
  const [activePageId, setActivePageId] = React.useState(pages[0]?.id || null);
  const [filters, setFilters] = React.useState(() =>
    buildInitialFilters(normalizedLayout)
  );
  const debouncedFilters = useDebouncedValue(filters, 400);

  React.useEffect(() => {
    setFilters(buildInitialFilters(normalizedLayout));
  }, [normalizedLayout]);

  React.useEffect(() => {
    if (!pages.length) return;
    setActivePageId((current) => {
      if (current && pages.some((page) => page.id === current)) return current;
      return pages[0].id;
    });
  }, [pages]);

  React.useEffect(() => {
    if (isPdf) return undefined;
    const refreshSec = Number(filters?.autoRefreshSec || 0);
    if (!refreshSec || !token) return undefined;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["reportsV2-widget", data?.dashboard?.id] });
    }, refreshSec * 1000);
    return () => clearInterval(interval);
  }, [filters?.autoRefreshSec, token, queryClient, data?.dashboard?.id, isPdf]);

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
            Relatorio publico nao encontrado.
          </div>
        </PageShell>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={normalizedLayout?.theme} className="min-h-screen bg-[var(--bg)]">
      <PageShell className={isPdf ? "print:p-0" : ""}>
        {!isPdf ? (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Relatorio publico
            </p>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              {data.dashboard?.name || "Relatorio"}
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Compartilhado para visualizacao externa.
            </p>
          </div>
        ) : null}

        {!isPdf ? (
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
            {!isPdf && pages.length > 1 ? (
              <div
                role="tablist"
                aria-label="Paginas do dashboard"
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
            <DashboardRenderer
              layout={normalizedLayout}
              dashboardId={data.dashboard?.id}
              publicToken={token}
              globalFilters={debouncedFilters}
              activePageId={activePageId}
            />
          </>
        ) : (
          <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-6 py-5 text-sm text-[var(--muted)]">
            Layout nao encontrado.
          </div>
        )}
      </PageShell>
    </ThemeProvider>
  );
}
