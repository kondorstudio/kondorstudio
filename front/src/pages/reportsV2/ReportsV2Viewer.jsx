import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Edit3 } from "lucide-react";
import PageShell from "@/components/ui/page-shell.jsx";
import { Button } from "@/components/ui/button.jsx";
import GlobalFiltersBar from "@/components/reportsV2/GlobalFiltersBar.jsx";
import DashboardRenderer from "@/components/reportsV2/DashboardRenderer.jsx";
import { base44 } from "@/apiClient/base44Client";

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

export default function ReportsV2Viewer() {
  const navigate = useNavigate();
  const { id } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["reportsV2-dashboard", id],
    queryFn: () => base44.reportsV2.getDashboard(id),
  });

  const dashboard = data || null;
  const layout =
    dashboard?.latestVersion?.layoutJson ||
    dashboard?.publishedVersion?.layoutJson ||
    null;

  const [filters, setFilters] = React.useState(() => buildInitialFilters(layout));

  React.useEffect(() => {
    setFilters(buildInitialFilters(layout));
  }, [layout]);

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

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-white" style={themeStyle}>
        <PageShell>
          <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700">
            Dashboard nao encontrado.
          </div>
        </PageShell>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={themeStyle}>
      <PageShell>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]"
              onClick={() => navigate("/relatorios/v2")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </button>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              {dashboard.name}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {dashboard.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
            </p>
          </div>
          <Button
            variant="secondary"
            leftIcon={Edit3}
            onClick={() => navigate(`/relatorios/v2/${dashboard.id}/edit`)}
          >
            Editar
          </Button>
        </div>

        <div className="mt-6">
          <GlobalFiltersBar filters={filters} onChange={setFilters} />
        </div>

        <div className="mt-8">
          {layout ? (
            <DashboardRenderer
              layout={layout}
              dashboardId={dashboard.id}
              brandId={dashboard.brandId}
              globalFilters={filters}
            />
          ) : (
            <div className="rounded-[16px] border border-[var(--border)] bg-white px-6 py-5 text-sm text-[var(--text-muted)]">
              Layout nao encontrado para este dashboard.
            </div>
          )}
        </div>
      </PageShell>
    </div>
  );
}
