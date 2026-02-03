import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageShell from "@/components/ui/page-shell.jsx";
import GlobalFiltersBar from "@/components/reportsV2/GlobalFiltersBar.jsx";
import DashboardRenderer from "@/components/reportsV2/DashboardRenderer.jsx";
import { base44 } from "@/apiClient/base44Client";
import { useDebouncedValue } from "@/components/reportsV2/utils.js";

const themeStyle = {
  "--background": "#FFFFFF",
  "--surface": "#FFFFFF",
  "--surface-muted": "#F8FAFC",
  "--border": "#E2E8F0",
  "--text": "#0F172A",
  "--text-muted": "#64748B",
  "--primary": "#F59E0B",
  "--primary-dark": "#D97706",
  "--accent": "#22C55E",
  "--shadow-sm": "0 2px 6px rgba(15, 23, 42, 0.08)",
  "--shadow-md": "0 18px 32px rgba(15, 23, 42, 0.12)",
  "--radius-card": "16px",
  "--radius-button": "16px",
  "--radius-input": "12px",
};

function buildInitialFilters(layout) {
  const base = {
    dateRange: { preset: "last_7_days" },
    platforms: [],
    accounts: [],
    compareTo: null,
    autoRefreshSec: 0,
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
  const [filters, setFilters] = React.useState(() => buildInitialFilters(layout));
  const debouncedFilters = useDebouncedValue(filters, 400);

  React.useEffect(() => {
    setFilters(buildInitialFilters(layout));
  }, [layout]);

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
      <div className="min-h-screen bg-white" style={themeStyle}>
        <PageShell>
          <div className="h-6 w-40 rounded-full kondor-shimmer" />
          <div className="mt-6 h-32 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
          <div className="mt-6 h-64 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
        </PageShell>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-white" style={themeStyle}>
        <PageShell>
          <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700">
            Relatorio publico nao encontrado.
          </div>
        </PageShell>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={themeStyle}>
      <PageShell className={isPdf ? "print:p-0" : ""}>
        {!isPdf ? (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Relatorio publico
            </p>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              {data.dashboard?.name || "Relatorio"}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Compartilhado para visualizacao externa.
            </p>
          </div>
        ) : null}

        {!isPdf ? (
          <div className="mb-6">
            <GlobalFiltersBar filters={filters} onChange={setFilters} />
          </div>
        ) : null}

        {layout ? (
          <DashboardRenderer
            layout={layout}
            dashboardId={data.dashboard?.id}
            publicToken={token}
            globalFilters={debouncedFilters}
          />
        ) : (
          <div className="rounded-[16px] border border-[var(--border)] bg-white px-6 py-5 text-sm text-[var(--text-muted)]">
            Layout nao encontrado.
          </div>
        )}
      </PageShell>
    </div>
  );
}
