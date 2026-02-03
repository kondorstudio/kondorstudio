import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, PlusCircle } from "lucide-react";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { Card, CardContent, CardFooter } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { Input } from "@/components/ui/input.jsx";
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

export default function ReportsV2Templates() {
  const navigate = useNavigate();
  const [brandId, setBrandId] = React.useState("");
  const [nameOverride, setNameOverride] = React.useState("");

  const { data: templatesData, isLoading, error } = useQuery({
    queryKey: ["reportsV2-templates"],
    queryFn: () => base44.reportsV2.listTemplates(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["reportsV2-clients"],
    queryFn: () => base44.entities.Clients.list(),
  });

  React.useEffect(() => {
    if (brandId || !clients.length) return;
    setBrandId(clients[0].id);
  }, [brandId, clients]);

  const templates = templatesData?.items || [];

  const instantiate = useMutation({
    mutationFn: ({ templateId }) =>
      base44.reportsV2.instantiateTemplate(templateId, {
        brandId,
        nameOverride: nameOverride || undefined,
      }),
    onSuccess: (data) => {
      if (data?.dashboardId) {
        navigate(`/relatorios/v2/${data.dashboardId}`);
      }
    },
  });

  return (
    <div className="min-h-screen bg-white" style={themeStyle}>
      <PageShell>
        <PageHeader
          kicker="Templates"
          title="Galeria de templates"
          subtitle="Escolha um template e crie um dashboard em 1 clique."
          actions={
            <Button variant="secondary" onClick={() => navigate("/relatorios/v2")}>
              Voltar para dashboards
            </Button>
          }
        />

        <div className="mt-8 flex flex-wrap gap-4 rounded-[16px] border border-[var(--border)] bg-white p-4">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Marca
            </label>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a marca" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Nome do dashboard (opcional)
            </label>
            <Input
              placeholder="Ex: Ads Overview - Janeiro"
              value={nameOverride}
              onChange={(event) => setNameOverride(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <Card key={`skeleton-${index}`}>
                <CardContent className="space-y-3">
                  <div className="h-4 w-32 rounded-full kondor-shimmer" />
                  <div className="h-3 w-40 rounded-full kondor-shimmer" />
                  <div className="h-16 w-full rounded-[12px] kondor-shimmer" />
                </CardContent>
              </Card>
            ))
          ) : error ? (
            <div className="col-span-full rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700">
              Falha ao carregar templates.
            </div>
          ) : templates.length ? (
            templates.map((template) => (
              <Card key={template.id} className="flex h-full flex-col">
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--primary-light)] text-[var(--primary)]">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[11px] font-semibold uppercase text-[var(--text-muted)]">
                      {template.category}
                    </span>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-[var(--text)]">
                      {template.name}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Template pronto para dashboards vivos.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between">
                  <Button
                    size="sm"
                    onClick={() => instantiate.mutate({ templateId: template.id })}
                    disabled={!brandId || instantiate.isLoading}
                    leftIcon={PlusCircle}
                  >
                    Criar
                  </Button>
                  {!brandId ? (
                    <span className="text-xs text-[var(--text-muted)]">
                      Selecione uma marca
                    </span>
                  ) : null}
                </CardFooter>
              </Card>
            ))
          ) : (
            <div className="col-span-full rounded-[16px] border border-[var(--border)] bg-white px-6 py-6 text-sm text-[var(--text-muted)]">
              Nenhum template disponivel.
            </div>
          )}
        </div>
      </PageShell>
    </div>
  );
}
