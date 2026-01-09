import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import PageShell from "@/components/ui/page-shell.jsx";
import { Button } from "@/components/ui/button.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { base44 } from "@/apiClient/base44Client";

export default function DashboardsHome() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["reporting-dashboards"],
    queryFn: () => base44.reporting.listDashboards(),
  });

  const dashboards = data?.items || [];

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Dashboards ao vivo
            </p>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              Painel de desempenho
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Use filtros globais para atualizar tudo em tempo real.
            </p>
          </div>
          <Button onClick={() => navigate("/reports/dashboards/new")}>
            Novo dashboard
          </Button>
        </div>

        {isLoading ? (
          <div className="rounded-[18px] border border-[var(--border)] bg-white/70 p-6 animate-pulse" />
        ) : dashboards.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dashboards.map((dashboard) => (
              <button
                key={dashboard.id}
                type="button"
                onClick={() => navigate(`/reports/dashboards/${dashboard.id}`)}
                className="rounded-[16px] border border-[var(--border)] bg-white px-4 py-4 text-left shadow-[var(--shadow-sm)] transition hover:border-[var(--primary)]"
              >
                <p className="text-sm font-semibold text-[var(--text)]">
                  {dashboard.name}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Escopo: {dashboard.scope}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum dashboard ao vivo"
            description="Crie um dashboard para acompanhar resultados em tempo real."
            action={
              <Button onClick={() => navigate("/reports/dashboards/new")}>
                Criar dashboard
              </Button>
            }
          />
        )}
      </div>
    </PageShell>
  );
}
