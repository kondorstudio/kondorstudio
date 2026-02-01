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
  Pencil,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.jsx";
import { Label } from "@/components/ui/label.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
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

const COMPARE_OPTIONS = [
  { value: "NONE", label: "Sem comparacao" },
  { value: "PREVIOUS_PERIOD", label: "Periodo anterior" },
  { value: "PREVIOUS_YEAR", label: "Ano anterior" },
  { value: "CUSTOM", label: "Personalizado" },
];

const toDateKey = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

export default function ReportsHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeClientId, setActiveClientId] = useActiveClient();
  const [selectedBrandId, setSelectedBrandId] = useState(activeClientId || "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultSource, setDefaultSource] = useState("META_ADS");
  const [search, setSearch] = useState("");
  const [editReport, setEditReport] = useState(null);
  const [deleteReport, setDeleteReport] = useState(null);
  const [editValues, setEditValues] = useState({
    name: "",
    dateFrom: "",
    dateTo: "",
    compareMode: "NONE",
    compareDateFrom: "",
    compareDateTo: "",
  });

  const { data: meData } = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const allowedBrandIds = useMemo(() => {
    const ids = meData?.reportingScope?.allowedBrandIds;
    return Array.isArray(ids) ? ids.map(String) : null;
  }, [meData]);

  const isClientScoped = Array.isArray(allowedBrandIds);
  const allowedBrandSet = useMemo(
    () => (isClientScoped ? new Set(allowedBrandIds) : null),
    [isClientScoped, allowedBrandIds]
  );

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
    enabled: !isClientScoped,
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

  const connections = useMemo(() => {
    const items = connectionsData?.items || [];
    return items.filter((item) => item.status === "CONNECTED");
  }, [connectionsData]);

  const connectionsBySource = useMemo(() => {
    return connections.reduce((acc, connection) => {
      const key = connection.source;
      if (!acc[key]) acc[key] = [];
      acc[key].push(connection);
      return acc;
    }, {});
  }, [connections]);

  const scopedClients = useMemo(() => {
    if (!isClientScoped) return clients;
    if (!allowedBrandSet || !allowedBrandSet.size) return [];
    return clients.filter((client) => allowedBrandSet.has(String(client.id)));
  }, [clients, isClientScoped, allowedBrandSet]);

  const brandMap = useMemo(
    () => new Map(scopedClients.map((client) => [client.id, client.name])),
    [scopedClients]
  );
  const groupMap = useMemo(
    () => new Map((groupsData?.items || []).map((group) => [group.id, group.name])),
    [groupsData]
  );

  useEffect(() => {
    if (!isClientScoped) return;
    if (!scopedClients.length) {
      if (selectedBrandId) setSelectedBrandId("");
      if (activeClientId) setActiveClientId("");
      return;
    }
    const allowedIds = new Set(scopedClients.map((client) => String(client.id)));
    const fallback = scopedClients[0].id;
    if (selectedBrandId && !allowedIds.has(String(selectedBrandId))) {
      setSelectedBrandId(fallback);
    }
    if (activeClientId && !allowedIds.has(String(activeClientId))) {
      setActiveClientId(fallback);
    }
    if (!selectedBrandId && fallback) {
      setSelectedBrandId(fallback);
      setActiveClientId(fallback);
    }
  }, [
    isClientScoped,
    scopedClients,
    selectedBrandId,
    activeClientId,
    setActiveClientId,
  ]);

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

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) =>
      base44.reporting.updateReport(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reporting-reports"] });
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: ["reporting-report", data.id] });
      }
      setEditReport(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reportId) => base44.reporting.deleteReport(reportId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reporting-reports"] });
      setDeleteReport(null);
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

  useEffect(() => {
    if (!editReport) return;
    setEditValues({
      name: editReport?.name || "",
      dateFrom: toDateKey(editReport?.dateFrom),
      dateTo: toDateKey(editReport?.dateTo),
      compareMode: editReport?.compareMode || "NONE",
      compareDateFrom: toDateKey(editReport?.compareDateFrom),
      compareDateTo: toDateKey(editReport?.compareDateTo),
    });
  }, [editReport]);

  const handleSaveEdit = () => {
    if (!editReport) return;
    const payload = {
      name: editValues.name?.trim() || undefined,
      dateFrom: editValues.dateFrom || undefined,
      dateTo: editValues.dateTo || undefined,
      compareMode: editValues.compareMode || "NONE",
      compareDateFrom:
        editValues.compareMode === "CUSTOM"
          ? editValues.compareDateFrom || undefined
          : undefined,
      compareDateTo:
        editValues.compareMode === "CUSTOM"
          ? editValues.compareDateTo || undefined
          : undefined,
    };
    updateMutation.mutate({ id: editReport.id, payload });
  };

  const totalReports = reports.length;
  const totalBrands = scopedClients.length;
  const totalGroups = isClientScoped ? 0 : groupsData?.items?.length || 0;
  const connectedCount = selectedBrandId ? connections.length : null;
  const connectionBadgeVariant =
    selectedBrandId && connectedCount
      ? "success"
      : selectedBrandId
        ? "warning"
        : "outline";
  const connectionBadgeLabel = selectedBrandId
    ? connectedCount
      ? "Conexoes ok"
      : "Sem conexoes"
    : "Selecione marca";

  return (
    <PageShell className="reporting-surface">
      <div className="space-y-8">
        <ReportsIntro />
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "Relatorios ativos",
              value: totalReports,
              helper: totalReports ? "Total criados" : "Crie o primeiro relatorio",
            },
            {
              title: "Marcas",
              value: totalBrands,
              helper: totalBrands ? "No workspace" : "Sem marcas cadastradas",
            },
            {
              title: "Grupos",
              value: totalGroups,
              helper: totalGroups ? "Organizacao por grupos" : "Sem grupos ativos",
            },
            {
              title: "Conexoes ativas",
              value: connectedCount ?? "—",
              helper: selectedBrandId ? "Marca selecionada" : "Selecione uma marca",
              badge: (
                <Badge variant={connectionBadgeVariant} className="text-[10px] uppercase tracking-[0.16em]">
                  {connectionBadgeLabel}
                </Badge>
              ),
            },
          ].map((stat) => (
            <div
              key={stat.title}
              className="looker-card px-5 py-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  {stat.title}
                </p>
                {stat.badge || null}
              </div>
              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{stat.value}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{stat.helper}</p>
            </div>
          ))}
        </section>
        <section className="looker-panel px-6 py-6">
          <div className="looker-toolbar">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Relatorios
                </h2>
                <Badge variant="outline" className="text-[10px] uppercase tracking-[0.18em]">
                  {filteredReports.length} itens
                </Badge>
              </div>
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

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar relatorio"
                className="pl-9"
              />
            </div>
            <Badge variant="outline" className="text-[10px] uppercase tracking-[0.2em]">
              Atualizado agora
            </Badge>
          </div>

          <div className="mt-4 overflow-hidden rounded-[12px] border border-[var(--border)] bg-white">
            {reportsLoading ? (
              <div className="h-32 animate-pulse rounded-[16px] bg-[var(--surface-muted)]" />
            ) : filteredReports.length ? (
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
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
                      className="border-b border-[var(--border)] transition-colors duration-150 hover:bg-[var(--surface-muted)] last:border-b-0"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {report.name}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        <div className="flex items-center gap-2">
                          <span>
                            {report.scope === "GROUP"
                              ? groupMap.get(report.groupId) || "Grupo"
                              : brandMap.get(report.brandId) || "Marca"}
                          </span>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-[0.16em]">
                            {report.scope === "GROUP" ? "Grupo" : "Marca"}
                          </Badge>
                        </div>
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
                            onClick={() => setEditReport(report)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => refreshMutation.mutate(report.id)}
                            disabled={refreshMutation.isLoading}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteReport(report)}
                          >
                            <Trash2 className="h-4 w-4" />
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
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section className="looker-panel px-6 py-6">
            <div className="looker-toolbar">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-[var(--text)]">
                    Dashboards ao vivo
                  </h2>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-[0.18em]">
                    Live
                  </Badge>
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  Ajuste filtros globais e acompanhe os dados em tempo real.
                </p>
              </div>
              <Button onClick={() => navigate("/reports/dashboards")}>
                Ver dashboards
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { title: "Filtros globais", description: "Controle total do periodo" },
                { title: "Auto-refresh", description: "Atualizacao rapida" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="looker-card px-4 py-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text)]">{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="looker-panel px-6 py-6">
            <div className="looker-toolbar">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-[var(--text)]">
                    Conexoes por marca
                  </h2>
                  <Badge variant={connectionBadgeVariant} className="text-[10px] uppercase tracking-[0.16em]">
                    {connectionBadgeLabel}
                  </Badge>
                </div>
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
                    {scopedClients.length ? "Selecione a marca" : "Sem marcas"}
                  </option>
                  {scopedClients.map((client) => (
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
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {DATA_SOURCES.map((source) => {
                  const Icon = source.icon;
                  const items = connectionsBySource[source.key] || [];
                  const statusVariant = items.length ? "success" : "outline";
                  const statusLabel = items.length
                    ? `${items.length} conta${items.length > 1 ? "s" : ""}`
                    : "Sem conta";
                  return (
                    <div
                      key={source.key}
                      className="looker-card p-4"
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

                      <div className="mt-4 flex items-center justify-between gap-2 text-sm text-[var(--text-muted)]">
                        <Badge variant={statusVariant} className="text-[10px] uppercase tracking-[0.16em]">
                          {connectionsLoading ? "Carregando" : statusLabel}
                        </Badge>
                        <span className="text-xs text-[var(--text-muted)]">
                          {connectionsLoading ? "Buscando conexoes..." : "Resumo da fonte"}
                        </span>
                      </div>

                      <div className="mt-3 text-sm text-[var(--text-muted)]">
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
        </div>

        <MetricCatalogPanel />
      </div>

      <ConnectDataSourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        brandId={selectedBrandId}
        defaultSource={defaultSource}
      />

      <Dialog open={Boolean(editReport)} onOpenChange={(open) => !open && setEditReport(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar relatorio</DialogTitle>
            <DialogDescription>
              Atualize o nome e o periodo do relatorio selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={editValues.name}
                onChange={(event) =>
                  setEditValues((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Nome do relatorio"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Periodo inicial</Label>
                <DateField
                  value={editValues.dateFrom}
                  onChange={(event) =>
                    setEditValues((prev) => ({ ...prev, dateFrom: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Periodo final</Label>
                <DateField
                  value={editValues.dateTo}
                  onChange={(event) =>
                    setEditValues((prev) => ({ ...prev, dateTo: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Comparacao</Label>
              <SelectNative
                value={editValues.compareMode}
                onChange={(event) =>
                  setEditValues((prev) => ({
                    ...prev,
                    compareMode: event.target.value,
                  }))
                }
              >
                {COMPARE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectNative>
            </div>
            {editValues.compareMode === "CUSTOM" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Comparacao de</Label>
                  <DateField
                    value={editValues.compareDateFrom}
                    onChange={(event) =>
                      setEditValues((prev) => ({
                        ...prev,
                        compareDateFrom: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Comparacao ate</Label>
                  <DateField
                    value={editValues.compareDateTo}
                    onChange={(event) =>
                      setEditValues((prev) => ({
                        ...prev,
                        compareDateTo: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="mt-6">
            <Button
              variant="ghost"
              onClick={() => setEditReport(null)}
              disabled={updateMutation.isLoading}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isLoading}>
              {updateMutation.isLoading ? "Salvando..." : "Salvar alteracoes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteReport)} onOpenChange={(open) => !open && setDeleteReport(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir relatorio</DialogTitle>
            <DialogDescription>
              Esta acao remove o relatorio e seus widgets. Essa mudanca nao pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-[var(--text-muted)]">
            {deleteReport?.name}
          </div>
          <DialogFooter className="mt-6">
            <Button
              variant="ghost"
              onClick={() => setDeleteReport(null)}
              disabled={deleteMutation.isLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteMutation.mutate(deleteReport.id)}
              disabled={deleteMutation.isLoading}
            >
              {deleteMutation.isLoading ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
