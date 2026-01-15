import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Card, CardContent } from "@/components/ui/card.jsx";

export default function AnalyticsDashboardsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics-dashboards"],
    queryFn: () => base44.analytics.listDashboards(),
  });

  const dashboards = data?.items || [];

  return (
    <PageShell>
      <PageHeader
        title="Dashboards GA4"
        subtitle="Crie e acompanhe dashboards personalizados para GA4."
        action={
          <Button onClick={() => navigate("/analytics/dashboards/new")}>
            Criar dashboard
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Carregando...</p>
      ) : error ? (
        <p className="text-sm text-rose-600">Falha ao carregar dashboards.</p>
      ) : dashboards.length ? (
        <div className="grid gap-4">
          {dashboards.map((dashboard) => (
            <Card key={dashboard.id}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text)]">
                      {dashboard.name}
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">
                      {dashboard.integrationProperty?.displayName ||
                        "Propriedade GA4"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate(`/analytics/dashboards/${dashboard.id}`)
                    }
                  >
                    Abrir
                  </Button>
                </div>
                {dashboard.description ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    {dashboard.description}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          Nenhum dashboard criado ainda.
        </p>
      )}
    </PageShell>
  );
}
