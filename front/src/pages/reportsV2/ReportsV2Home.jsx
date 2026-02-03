import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, LayoutGrid, Boxes, Zap, Search, ArrowRight } from "lucide-react";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { Card, CardContent } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { base44 } from "@/apiClient/base44Client";
import { cn } from "@/utils/classnames.js";

const FEATURE_CARDS = [
  {
    title: "Templates prontos",
    description: "Crie um relatorio completo em 1 clique.",
    icon: Sparkles,
  },
  {
    title: "Dashboards ao vivo",
    description: "Dados atualizados com filtros globais.",
    icon: LayoutGrid,
  },
  {
    title: "Widgets flexiveis",
    description: "KPIs, series, barras e tabelas.",
    icon: Boxes,
  },
  {
    title: "Automacoes",
    description: "Relatorios recorrentes (em breve).",
    icon: Zap,
  },
];

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

export default function ReportsV2Home() {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState("");
  const [brandId, setBrandId] = React.useState("");

  const { data: clients = [] } = useQuery({
    queryKey: ["reportsV2-clients"],
    queryFn: () => base44.entities.Clients.list(),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["reportsV2-dashboards", brandId],
    queryFn: () =>
      base44.reportsV2.listDashboards(brandId ? { brandId } : {}),
  });

  const dashboards = data?.items || [];
  const filteredDashboards = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return dashboards;
    return dashboards.filter((dashboard) =>
      String(dashboard.name || "").toLowerCase().includes(query)
    );
  }, [dashboards, search]);

  const brandLookup = React.useMemo(() => {
    const map = new Map();
    clients.forEach((client) => map.set(client.id, client.name));
    return map;
  }, [clients]);

  return (
    <div className="min-h-screen bg-white" style={themeStyle}>
      <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(245,158,11,0.08),rgba(34,197,94,0.04))]">
        <PageShell>
          <PageHeader
            kicker="Relatorios V2"
            title="Relatorios inteligentes"
            subtitle="Construa dashboards vivos com metricas normalizadas e filtros globais."
            actions={
              <Button onClick={() => navigate("/relatorios/v2/templates")} className="gap-2">
                Criar com template
                <ArrowRight className="h-4 w-4" />
              </Button>
            }
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.title} className="bg-white/70">
                  <CardContent className="flex h-full flex-col gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--primary-light)] text-[var(--primary)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-[var(--text)]">
                        {card.title}
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {card.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </PageShell>
      </div>

      <PageShell>
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 flex-wrap gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Buscar dashboard
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  className="pl-9"
                  placeholder="Digite o nome"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="min-w-[200px]">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Marca
              </label>
              <Select
                value={brandId || "all"}
                onValueChange={(value) => setBrandId(value === "all" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as marcas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as marcas</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button variant="secondary" onClick={() => navigate("/relatorios/v2/templates")}>
            Ver templates
          </Button>
        </div>

        <div className="rounded-[18px] border border-[var(--border)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Dashboards</p>
              <p className="text-xs text-[var(--text-muted)]">
                {filteredDashboards.length} resultados
              </p>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-6 py-3 text-xs font-semibold uppercase text-[var(--text-muted)]">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase text-[var(--text-muted)]">
                    Marca
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase text-[var(--text-muted)]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase text-[var(--text-muted)]">
                    Acoes
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className="border-b border-[var(--border)]">
                      <td className="px-6 py-4">
                        <div className="h-4 w-40 rounded-full kondor-shimmer" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-24 rounded-full kondor-shimmer" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-16 rounded-full kondor-shimmer" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-8 w-24 rounded-full kondor-shimmer" />
                      </td>
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-sm text-rose-600">
                      Falha ao carregar dashboards.
                    </td>
                  </tr>
                ) : filteredDashboards.length ? (
                  filteredDashboards.map((dashboard) => (
                    <tr key={dashboard.id} className="border-b border-[var(--border)]">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-[var(--text)]">{dashboard.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {dashboard.id}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--text-muted)]">
                        {brandLookup.get(dashboard.brandId) || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
                            dashboard.status === "PUBLISHED"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          )}
                        >
                          {dashboard.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => navigate(`/relatorios/v2/${dashboard.id}`)}
                          >
                            Ver
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/relatorios/v2/${dashboard.id}/edit`)}
                          >
                            Editar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-sm text-[var(--text-muted)]">
                      Nenhum dashboard encontrado. Use um template para comecar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </PageShell>
    </div>
  );
}
