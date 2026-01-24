import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Eye,
  Facebook,
  Instagram,
  Linkedin,
  MapPin,
  Megaphone,
  Music,
  RefreshCw,
  Search,
} from "lucide-react";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { useActiveClient } from "@/hooks/useActiveClient.js";
import ReportsIntro from "@/components/reports/ReportsIntro.jsx";
import ConnectDataSourceDialog from "@/components/reports/ConnectDataSourceDialog.jsx";
import MetricCatalogPanel from "@/components/reports/MetricCatalogPanel.jsx";

const DATA_SOURCES = [
  {
    key: "META_ADS",
    label: "Meta Ads",
    description: "Campanhas e anuncios",
    icon: Megaphone,
  },
  {
    key: "GOOGLE_ADS",
    label: "Google Ads",
    description: "Campanhas e conversoes",
    icon: Megaphone,
  },
  {
    key: "TIKTOK_ADS",
    label: "TikTok Ads",
    description: "Campanhas TikTok",
    icon: Music,
  },
  {
    key: "LINKEDIN_ADS",
    label: "LinkedIn Ads",
    description: "Campanhas B2B",
    icon: Linkedin,
  },
  {
    key: "GA4",
    label: "Google Analytics 4",
    description: "Analytics do site",
    icon: BarChart3,
  },
  {
    key: "GBP",
    label: "Google Meu Negocio",
    description: "Visibilidade local",
    icon: MapPin,
  },
  {
    key: "META_SOCIAL",
    label: "Facebook/Instagram",
    description: "Paginas e Instagram",
    icon: Instagram,
  },
];

export default function ReportsHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeClientId, setActiveClientId] = useActiveClient();
  const [selectedBrandId, setSelectedBrandId] = useState(activeClientId || "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultSource, setDefaultSource] = useState("META_ADS");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!selectedBrandId && activeClientId) {
      setSelectedBrandId(activeClientId);
    }
  }, [activeClientId, selectedBrandId]);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["reporting-brand-groups"],
    queryFn: () => base44.reporting.listBrandGroups(),
  });

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ["reporting-reports"],
    queryFn: () => base44.reporting.listReports(),
  });

  const { data: connectionsData, isLoading: connectionsLoading } = useQuery({
    queryKey: ["reporting-connections", selectedBrandId],
    queryFn: () =>
      base44.jsonFetch(`/reporting/brands/${selectedBrandId}/connections`, {
        method: "GET",
      }),
    enabled: Boolean(selectedBrandId),
  });

  const connections = useMemo(
    () => connectionsData?.items || [],
    [connectionsData]
  );

  const connectionsBySource = useMemo(() => {
    return connections.reduce((acc, connection) => {
      const key = connection.source;
      if (!acc[key]) acc[key] = [];
      acc[key].push(connection);
      return acc;
    }, {});
  }, [connections]);

  const brandMap = useMemo(
    () => new Map(clients.map((client) => [client.id, client.name])),
    [clients]
  );
  const groupMap = useMemo(
    () => new Map((groupsData?.items || []).map((group) => [group.id, group.name])),
    [groupsData]
  );

  const reports = reportsData?.items || [];
  const filteredReports = useMemo(() => {
    if (!search.trim()) return reports;
    const query = search.trim().toLowerCase();
    return reports.filter((report) =>
      String(report.name || "").toLowerCase().includes(query)
    );
  }, [reports, search]);

  const refreshMutation = useMutation({
    mutationFn: async (reportId) => base44.reporting.refreshReport(reportId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reporting-reports"] });
    },
  });

  const formatDateRange = (report) => {
    if (!report?.dateFrom || !report?.dateTo) return "-";
    return `${new Date(report.dateFrom).toLocaleDateString("pt-BR")} - ${new Date(report.dateTo).toLocaleDateString("pt-BR")}`;
  };

  const formatCreatedAt = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString("pt-BR");
  };

  const openDialog = (sourceKey) => {
    setDefaultSource(sourceKey);
    setDialogOpen(true);
  };

  return (
    <PageShell>
      <div className="space-y-8">
        <ReportsIntro />
        <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">
                Relatorios
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Gerencie aqui seus relatorios por marca e grupo.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => navigate("/reports/templates")}>
                Templates
              </Button>
              <Button onClick={() => navigate("/reports/new")}>
                Novo Relatorio
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar relatorio"
                className="pl-9"
              />
            </div>
          </div>

          <div className="mt-4 rounded-[16px] border border-[var(--border)] bg-white">
            {reportsLoading ? (
              <div className="h-32 animate-pulse rounded-[16px] bg-[var(--surface-muted)]" />
            ) : filteredReports.length ? (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Marca/Grupo</th>
                    <th className="px-4 py-3 text-left">Periodo</th>
                    <th className="px-4 py-3 text-left">Criado em</th>
                    <th className="px-4 py-3 text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((report) => (
                    <tr
                      key={report.id}
                      className="border-b border-[var(--border)] last:border-b-0"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {report.name}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {report.scope === "GROUP"
                          ? groupMap.get(report.groupId) || "Grupo"
                          : brandMap.get(report.brandId) || "Marca"}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {formatDateRange(report)}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {formatCreatedAt(report.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/reports/${report.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => refreshMutation.mutate(report.id)}
                            disabled={refreshMutation.isLoading}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6">
                <EmptyState
                  icon={BarChart3}
                  title="Voce ainda nao criou um relatorio."
                  description="Vamos criar um agora?"
                  action={
                    <Button onClick={() => navigate("/reports/new")}>
                      Criar relatorio
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        </section>
        <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">
                Dashboards ao vivo
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Ajuste filtros globais e acompanhe os dados em tempo real.
              </p>
            </div>
            <Button onClick={() => navigate("/reports/dashboards")}>
              Ver dashboards
            </Button>
          </div>
        </section>
        <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">
                Conexoes por marca
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Vincule contas das fontes para desbloquear widgets.
              </p>
            </div>
            <div className="min-w-[220px]">
              <SelectNative
                value={selectedBrandId}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedBrandId(value);
                  setActiveClientId(value);
                }}
              >
                <option value="">
                  {clients.length ? "Selecione a marca" : "Sem marcas"}
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </SelectNative>
            </div>
          </div>

          {!selectedBrandId ? (
            <div className="mt-6">
              <EmptyState
                icon={Facebook}
                title="Selecione uma marca"
                description="Escolha uma marca para visualizar ou associar contas."
                action={
                  <Button variant="secondary" onClick={() => navigate("/clients")}>
                    Ver clientes
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {DATA_SOURCES.map((source) => {
                const Icon = source.icon;
                const items = connectionsBySource[source.key] || [];
                return (
                  <div
                    key={source.key}
                    className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--surface-muted)]">
                          <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">
                            {source.label}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {source.description}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openDialog(source.key)}
                      >
                        Associar conta
                      </Button>
                    </div>

                    <div className="mt-4 text-sm text-[var(--text-muted)]">
                      {connectionsLoading ? (
                        "Carregando conexoes..."
                      ) : items.length ? (
                        <div className="space-y-1">
                          {items.slice(0, 3).map((item) => (
                            <div key={item.id} className="text-[var(--text)]">
                              {item.displayName}
                            </div>
                          ))}
                          {items.length > 3 ? (
                            <div className="text-xs text-[var(--text-muted)]">
                              +{items.length - 3} outras contas
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        "Sem conta associada"
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <MetricCatalogPanel />
      </div>

      <ConnectDataSourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        brandId={selectedBrandId}
        defaultSource={defaultSource}
      />
    </PageShell>
  );
}
