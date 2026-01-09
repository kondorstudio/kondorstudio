import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import FilterBar from "@/components/ui/filter-bar.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Input } from "@/components/ui/input.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { Button } from "@/components/ui/button.jsx";
import StatPill from "@/components/ui/stat-pill.jsx";
import Toast from "@/components/ui/toast.jsx";
import useToast from "@/hooks/useToast.js";
import { useActiveClient } from "@/hooks/useActiveClient.js";
import CompetitorFormDialog from "@/components/competitors/CompetitorFormDialog.jsx";
import {
  ArrowUpRight,
  BarChart3,
  Heart,
  MessageCircle,
  RefreshCw,
  Search,
  Users,
  UserRound,
  UsersRound,
} from "lucide-react";

const PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
];

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function formatPercent(value) {
  const number = Number(value || 0);
  return `${number.toFixed(2)}%`;
}

function formatDate(value) {
  if (!value) return "Sem coleta";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem coleta";
  return date.toLocaleDateString("pt-BR");
}

function resolveStatusVariant(status) {
  if (status === "ACTIVE") return "success";
  if (status === "INACTIVE") return "warning";
  return "default";
}

export default function Competitors() {
  const [activeClientId, setActiveClientId] = useActiveClient();
  const [selectedClientId, setSelectedClientId] = React.useState(activeClientId || "");
  const [platform, setPlatform] = React.useState("instagram");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedCompetitorId, setSelectedCompetitorId] = React.useState(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingCompetitor, setEditingCompetitor] = React.useState(null);
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();

  React.useEffect(() => {
    if (activeClientId === selectedClientId) return;
    setSelectedClientId(activeClientId || "");
  }, [activeClientId, selectedClientId]);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const filters = React.useMemo(() => {
    const trimmed = searchTerm.trim();
    return {
      clientId: selectedClientId || undefined,
      platform: platform || undefined,
      q: trimmed || undefined,
    };
  }, [selectedClientId, platform, searchTerm]);

  const competitorsQuery = useQuery({
    queryKey: ["competitors", filters],
    queryFn: () => base44.entities.Competitor.list(filters),
  });

  const competitors = Array.isArray(competitorsQuery.data)
    ? competitorsQuery.data
    : [];

  React.useEffect(() => {
    if (!competitors.length) {
      setSelectedCompetitorId(null);
      return;
    }
    if (!selectedCompetitorId) {
      setSelectedCompetitorId(competitors[0].id);
      return;
    }
    const stillExists = competitors.some((item) => item.id === selectedCompetitorId);
    if (!stillExists) {
      setSelectedCompetitorId(competitors[0].id);
    }
  }, [competitors, selectedCompetitorId]);

  const selectedCompetitor = competitors.find(
    (item) => item.id === selectedCompetitorId
  );

  const createMutation = useMutation({
    mutationFn: (payload) => base44.entities.Competitor.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      setDialogOpen(false);
      setEditingCompetitor(null);
    },
    onError: (error) => {
      showToast(error?.message || "Erro ao criar concorrente.", "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Competitor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      setDialogOpen(false);
      setEditingCompetitor(null);
    },
    onError: (error) => {
      showToast(error?.message || "Erro ao atualizar concorrente.", "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Competitor.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
    },
    onError: (error) => {
      showToast(error?.message || "Erro ao remover concorrente.", "error");
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id) => base44.entities.Competitor.sync(id),
    onSuccess: (response) => {
      showToast(response?.message || "Solicitacao enviada com sucesso.", "info");
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
    },
    onError: (error) => {
      showToast(error?.message || "Erro ao solicitar atualizacao.", "error");
    },
  });

  const handleSubmit = (payload) => {
    if (editingCompetitor?.id) {
      updateMutation.mutate({ id: editingCompetitor.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (competitor) => {
    setEditingCompetitor(competitor);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingCompetitor(null);
    setDialogOpen(true);
  };

  const handleRemove = (competitorId) => {
    if (!competitorId) return;
    if (!window.confirm("Deseja remover este concorrente?")) return;
    deleteMutation.mutate(competitorId);
  };

  const listEmpty = !competitorsQuery.isLoading && competitors.length === 0;

  return (
    <PageShell>
      <PageHeader
        title="Concorrentes"
        subtitle="Compare desempenho e monitore o mercado por rede."
        actions={
          <Button leftIcon={UsersRound} onClick={handleAdd}>
            Adicionar concorrente
          </Button>
        }
      />

      <FilterBar className="mt-6">
        <div className="min-w-[220px] flex-1">
          <Label>Cliente</Label>
          <SelectNative
            value={selectedClientId}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedClientId(value);
              setActiveClientId(value);
            }}
          >
            <option value="">Todos os clientes</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </SelectNative>
        </div>

        <div className="min-w-[180px]">
          <Label>Rede</Label>
          <SelectNative
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
          >
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectNative>
        </div>

        <div className="min-w-[240px] flex-1">
          <Label>Busca</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar concorrente"
              className="pl-9"
            />
          </div>
        </div>
      </FilterBar>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Panorama competitivo</CardTitle>
                <p className="text-sm text-[var(--text-muted)]">
                  {competitors.length} concorrente(s) monitorados
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                leftIcon={RefreshCw}
                onClick={() => {
                  if (selectedCompetitor?.id) {
                    syncMutation.mutate(selectedCompetitor.id);
                  } else {
                    showToast("Selecione um concorrente para atualizar.", "info");
                  }
                }}
                disabled={!selectedCompetitor?.id || syncMutation.isPending}
              >
                Atualizar dados
              </Button>
            </div>
            {selectedCompetitor?.metadata?.lastSyncRequestedAt ? (
              <p className="text-xs text-[var(--text-muted)]">
                Ultima solicitacao:{" "}
                {formatDate(selectedCompetitor.metadata.lastSyncRequestedAt)}
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            {competitorsQuery.isLoading ? (
              <EmptyState
                title="Carregando concorrentes"
                description="Estamos reunindo os dados de monitoramento."
                action={
                  <Button variant="ghost" onClick={() => competitorsQuery.refetch()}>
                    Atualizar agora
                  </Button>
                }
              />
            ) : listEmpty ? (
              <EmptyState
                title="Sem concorrentes monitorados"
                description="Adicione concorrentes para comparar performance e capturar oportunidades."
                action={
                  <Button leftIcon={UsersRound} onClick={handleAdd}>
                    Adicionar concorrente
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {competitors.map((competitor) => {
                  const snapshot = competitor.latestSnapshot || null;
                  const status = competitor.status || "ACTIVE";
                  return (
                    <button
                      key={competitor.id}
                      type="button"
                      onClick={() => setSelectedCompetitorId(competitor.id)}
                      className={`w-full text-left transition ${
                        competitor.id === selectedCompetitorId
                          ? "bg-[var(--surface-muted)]"
                          : "hover:bg-[var(--surface-muted)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-4 px-4 py-4">
                        <div className="flex items-center gap-3 min-w-[220px]">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-light)] text-sm font-semibold text-[var(--primary)]">
                            {(competitor.name || competitor.username || "?")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text)]">
                              {competitor.name || `@${competitor.username}`}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              @{competitor.username}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <StatPill
                            label="Status"
                            value={status === "ACTIVE" ? "Ativo" : status}
                            variant={resolveStatusVariant(status)}
                          />
                          {snapshot ? (
                            <StatPill
                              label="Seguidores"
                              value={formatNumber(snapshot.followers)}
                              variant="default"
                            />
                          ) : (
                            <StatPill
                              label="Seguidores"
                              value="--"
                              variant="default"
                            />
                          )}
                        </div>

                        <div className="ml-auto flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleEdit(competitor);
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemove(competitor.id);
                            }}
                          >
                            Remover
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
                        <div className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-xs">
                          <p className="text-[var(--text-muted)]">Engajamento</p>
                          <p className="text-sm font-semibold text-[var(--text)]">
                            {snapshot ? formatPercent(snapshot.engagementRate) : "--"}
                          </p>
                        </div>
                        <div className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-xs">
                          <p className="text-[var(--text-muted)]">Posts</p>
                          <p className="text-sm font-semibold text-[var(--text)]">
                            {snapshot ? formatNumber(snapshot.postsCount) : "--"}
                          </p>
                        </div>
                        <div className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-xs">
                          <p className="text-[var(--text-muted)]">Ultima coleta</p>
                          <p className="text-sm font-semibold text-[var(--text)]">
                            {snapshot ? formatDate(snapshot.collectedAt) : "Pendente"}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detalhes do concorrente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedCompetitor ? (
              <>
                <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-base font-semibold text-[var(--primary)]">
                      {(selectedCompetitor.name || selectedCompetitor.username || "?")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {selectedCompetitor.name || `@${selectedCompetitor.username}`}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        @{selectedCompetitor.username}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <Users className="h-4 w-4" />
                    {selectedCompetitor.latestSnapshot
                      ? `${formatNumber(selectedCompetitor.latestSnapshot.followers)} seguidores`
                      : "Aguardando dados de seguidores"}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[12px] border border-[var(--border)] bg-white px-4 py-3">
                    <p className="text-xs text-[var(--text-muted)]">Engajamento</p>
                    <p className="mt-1 text-lg font-semibold text-[var(--text)]">
                      {selectedCompetitor.latestSnapshot
                        ? formatPercent(selectedCompetitor.latestSnapshot.engagementRate)
                        : "--"}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-[var(--border)] bg-white px-4 py-3">
                    <p className="text-xs text-[var(--text-muted)]">Posts</p>
                    <p className="mt-1 text-lg font-semibold text-[var(--text)]">
                      {selectedCompetitor.latestSnapshot
                        ? formatNumber(selectedCompetitor.latestSnapshot.postsCount)
                        : "--"}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-[var(--border)] bg-white px-4 py-3">
                    <p className="text-xs text-[var(--text-muted)]">Interacoes</p>
                    <p className="mt-1 text-lg font-semibold text-[var(--text)]">
                      {selectedCompetitor.latestSnapshot
                        ? formatNumber(selectedCompetitor.latestSnapshot.interactions)
                        : "--"}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-[var(--border)] bg-white px-4 py-3">
                    <p className="text-xs text-[var(--text-muted)]">Ultima coleta</p>
                    <p className="mt-1 text-lg font-semibold text-[var(--text)]">
                      {selectedCompetitor.latestSnapshot
                        ? formatDate(selectedCompetitor.latestSnapshot.collectedAt)
                        : "Pendente"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-[14px] border border-[var(--border)] bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                        <Users className="h-4 w-4 text-[var(--text-muted)]" />
                        Top posts
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        Em breve
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {[1, 2, 3].map((item) => (
                        <div
                          key={`placeholder-post-${item}`}
                          className="flex items-center justify-between rounded-[10px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2"
                        >
                          <div>
                            <p className="text-xs font-semibold text-[var(--text)]">
                              Post #{item}
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)]">
                              Sem dados de performance
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                            <span className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              --
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" />
                              --
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[14px] border border-[var(--border)] bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                        <BarChart3 className="h-4 w-4 text-[var(--text-muted)]" />
                        Evolucao diaria
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        Em breve
                      </span>
                    </div>
                    <div className="mt-4 flex h-24 items-end gap-2">
                      {[32, 48, 24, 56, 40, 28, 52].map((height, index) => (
                        <div
                          key={`bar-${index}`}
                          className="flex-1 rounded-[6px] bg-[var(--surface-muted)]"
                          style={{ height: `${height}%` }}
                        />
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-[var(--text-muted)]">
                      Ative a integracao Meta para visualizar a evolucao diaria.
                    </p>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  leftIcon={ArrowUpRight}
                  onClick={() => syncMutation.mutate(selectedCompetitor.id)}
                  disabled={syncMutation.isPending}
                >
                  Solicitar atualizacao
                </Button>
              </>
            ) : (
              <EmptyState
                title="Selecione um concorrente"
                description="Escolha um nome na lista para abrir o resumo completo."
                icon={UserRound}
                action={
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (competitors[0]?.id) {
                        setSelectedCompetitorId(competitors[0].id);
                      }
                    }}
                  >
                    Selecionar primeiro da lista
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <CompetitorFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingCompetitor(null);
        }}
        onSubmit={handleSubmit}
        isSaving={createMutation.isPending || updateMutation.isPending}
        clients={clients}
        defaultClientId={selectedClientId}
        competitor={editingCompetitor}
      />

      <Toast toast={toast} />
    </PageShell>
  );
}
