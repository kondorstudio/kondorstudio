import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import PageShell from "@/components/ui/page-shell.jsx";
import { Button } from "@/components/ui/button.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { Input } from "@/components/ui/input.jsx";
import { base44 } from "@/apiClient/base44Client";

export default function DashboardsHome() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["reporting-dashboards"],
    queryFn: () => base44.reporting.listDashboards(),
  });

  const dashboards = data?.items || [];
  const filteredDashboards = useMemo(() => {
    if (!search.trim()) return dashboards;
    const query = search.trim().toLowerCase();
    return dashboards.filter((dashboard) =>
      String(dashboard.name || "").toLowerCase().includes(query)
    );
  }, [dashboards, search]);

  return (
    <PageShell className="reporting-surface">
      <div className="space-y-6">
        <div className="looker-toolbar">
          <div>
            <p className="looker-section-title">Dashboards</p>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              Dashboards
            </h1>
            <p className="text-sm looker-muted">
              Gerencie seus dashboards ao vivo.
            </p>
          </div>
          <Button onClick={() => navigate("/reports/dashboards/new")}>
            Novo Dashboard
          </Button>
        </div>

        <section className="looker-panel p-4">
          <div className="looker-toolbar">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar dashboard"
                className="pl-9"
              />
            </div>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="looker-panel p-6 bg-white/70 animate-pulse" />
            ) : filteredDashboards.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredDashboards.map((dashboard) => (
                  <button
                    key={dashboard.id}
                    type="button"
                    onClick={() => navigate(`/reports/dashboards/${dashboard.id}`)}
                    className="looker-card px-4 py-4 text-left transition hover:border-[var(--primary)]"
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
                title="Voce ainda nao criou um dashboard."
                description="Vamos criar agora?"
                action={
                  <Button onClick={() => navigate("/reports/dashboards/new")}>
                    Criar dashboard
                  </Button>
                }
              />
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
