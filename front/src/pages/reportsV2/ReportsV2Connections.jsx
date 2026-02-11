import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, PlusCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.jsx";
import { Input } from "@/components/ui/input.jsx";
import ReporteiTopbar from "@/components/reportsV2/ReporteiTopbar.jsx";
import Toast from "@/components/ui/toast.jsx";
import useToast from "@/hooks/useToast.js";
import { cn } from "@/utils/classnames.js";
import { base44 } from "@/apiClient/base44Client";

const PLATFORMS = [
  {
    value: "META_ADS",
    label: "Meta Ads",
    description: "Contas de anúncios do Meta Ads.",
  },
  {
    value: "GOOGLE_ADS",
    label: "Google Ads",
    description: "Contas e campanhas do Google Ads.",
  },
  {
    value: "TIKTOK_ADS",
    label: "TikTok Ads",
    description: "Contas de anúncios do TikTok Ads.",
  },
  {
    value: "LINKEDIN_ADS",
    label: "LinkedIn Ads",
    description: "Contas e campanhas do LinkedIn Ads.",
  },
  {
    value: "GA4",
    label: "GA4",
    description: "Propriedades do Google Analytics 4.",
  },
  {
    value: "GMB",
    label: "Google Meu Negócio",
    description: "Perfis do Google Business.",
  },
  {
    value: "FB_IG",
    label: "Facebook/Instagram",
    description: "Conexões sociais do Meta.",
  },
];

const PLATFORM_STYLE = {
  META_ADS: "border-[#0b5ed7] bg-[#0b5ed7] text-white",
  GA4: "border-[#ff5d2b] bg-[#ff5d2b] text-white",
};

function groupConnections(items) {
  const map = new Map();
  (items || []).forEach((item) => {
    const list = map.get(item.platform) || [];
    list.push(item);
    map.set(item.platform, list);
  });
  return map;
}

export default function ReportsV2Connections() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();
  const [brandId, setBrandId] = React.useState("");
  const requestedPlatform = React.useMemo(
    () => String(searchParams.get("platform") || "").toUpperCase(),
    [searchParams]
  );
  const [selectedPlatform, setSelectedPlatform] = React.useState(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [selectedAccountId, setSelectedAccountId] = React.useState("");
  const [nameOverride, setNameOverride] = React.useState("");
  const [highlightPlatform, setHighlightPlatform] = React.useState("");
  const [platformSearch, setPlatformSearch] = React.useState("");
  const platformRefs = React.useRef({});

  const { data: clients = [] } = useQuery({
    queryKey: ["reportsV2-clients"],
    queryFn: () => base44.entities.Clients.list(),
  });

  React.useEffect(() => {
    if (brandId || !clients.length) return;
    const fromQuery = searchParams.get("brandId");
    const match = fromQuery
      ? clients.find((client) => client.id === fromQuery)
      : null;
    setBrandId(match ? match.id : clients[0].id);
  }, [brandId, clients, searchParams]);

  React.useEffect(() => {
    if (!brandId || !requestedPlatform) return;
    const isKnownPlatform = PLATFORMS.some((item) => item.value === requestedPlatform);
    if (!isKnownPlatform) return;
    setSelectedPlatform(requestedPlatform);
    setHighlightPlatform(requestedPlatform);

    const handle = window.setTimeout(() => {
      const target = platformRefs.current[requestedPlatform];
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 120);

    const clearHandle = window.setTimeout(() => {
      setHighlightPlatform((current) =>
        current === requestedPlatform ? "" : current
      );
    }, 4000);

    return () => {
      window.clearTimeout(handle);
      window.clearTimeout(clearHandle);
    };
  }, [brandId, requestedPlatform]);

  const { data: connectionsData, isLoading: connectionsLoading } = useQuery({
    queryKey: ["reportsV2-connections", brandId],
    queryFn: () => base44.reportsV2.listConnections({ brandId }),
    enabled: Boolean(brandId),
  });

  const connections = connectionsData?.items || [];
  const connectionsByPlatform = React.useMemo(
    () => groupConnections(connections),
    [connections]
  );
  const visiblePlatforms = React.useMemo(() => {
    const query = String(platformSearch || "").trim().toLowerCase();
    if (!query) return PLATFORMS;
    return PLATFORMS.filter((item) =>
      `${item.label} ${item.description}`.toLowerCase().includes(query)
    );
  }, [platformSearch]);

  const { data: availableData, isLoading: availableLoading, error: availableError } = useQuery({
    queryKey: ["reportsV2-available", brandId, selectedPlatform],
    queryFn: () =>
      base44.reportsV2.listAvailableConnections({
        brandId,
        platform: selectedPlatform,
      }),
    enabled: Boolean(brandId && selectedPlatform && dialogOpen),
  });

  const availableAccounts = availableData?.items || [];

  const linkMutation = useMutation({
    mutationFn: () =>
      base44.reportsV2.linkConnection({
        brandId,
        platform: selectedPlatform,
        externalAccountId: selectedAccountId,
        externalAccountName: nameOverride || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportsV2-connections", brandId] });
      setDialogOpen(false);
      setSelectedAccountId("");
      setNameOverride("");
    },
    onError: (error) => {
      const message =
        error?.data?.error?.message ||
        error?.message ||
        "Não foi possível associar a conta.";
      showToast(message, "error");
    },
  });

  const openDialog = (platform) => {
    setSelectedPlatform(platform);
    setDialogOpen(true);
    setSelectedAccountId("");
    setNameOverride("");
  };

  const isBrandSelected = Boolean(brandId);

  return (
    <div className="reportei-theme min-h-screen bg-[var(--surface-muted)]">
      <ReporteiTopbar />

      <div className="border-b border-[#dbe3ed] bg-white">
        <div className="mx-auto flex h-[48px] max-w-[1760px] items-center justify-between gap-3 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/relatorios/v2")}
              className="inline-flex h-8 items-center rounded-full border border-[#d1dae6] px-3 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
            >
              Voltar
            </button>
            <p className="truncate text-[23px] font-extrabold text-[var(--primary)]">
              Integrações
            </p>
          </div>
          <span className="hidden rounded-full border border-[#d1dae6] bg-white px-3 py-1 text-xs font-semibold text-[var(--text-muted)] md:inline-flex">
            Gestão de conexões
          </span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1760px] px-4 py-5 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="h-fit px-4 py-2">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border-4 border-emerald-500 bg-white text-lg font-bold text-[var(--primary)]">
              2/2
            </span>
            <h2 className="mt-4 text-[30px] font-extrabold leading-tight text-[var(--primary)] lg:text-[42px]">
              Integrações
            </h2>
            <p className="mt-2 text-[16px] leading-tight text-[var(--text-muted)] lg:text-[24px]">
              Conecte as plataformas para liberar dados no editor.
            </p>
          </aside>

          <main className="space-y-5">
            <div className="reportei-card p-4">
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

            <div className="reportei-card p-4">
              <div className="mb-4">
                <p className="text-2xl font-extrabold text-[var(--primary)]">
                  Adicione suas redes
                </p>
                <p className="text-sm text-[var(--text-muted)]">
                  Escolha a plataforma e associe uma conta.
                </p>
              </div>

              <Input
                placeholder="Pesquisar integrações..."
                value={platformSearch}
                onChange={(event) => setPlatformSearch(event.target.value)}
                className="mb-4"
              />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {!isBrandSelected ? (
                  <div className="col-span-full rounded-[16px] border border-purple-200 bg-purple-50 px-6 py-4 text-sm text-purple-700">
                    Selecione uma marca para habilitar as conexões.
                  </div>
                ) : null}
                {visiblePlatforms.map((platform) => {
                  const items = connectionsByPlatform.get(platform.value) || [];
                  const activeItems = items.filter((item) => item.status === "ACTIVE");
                  const statusLabel = activeItems.length
                    ? `${activeItems.length} conta${activeItems.length > 1 ? "s" : ""}`
                    : "Sem conta";

                  return (
                    <Card
                      key={platform.value}
                      ref={(element) => {
                        if (element) platformRefs.current[platform.value] = element;
                      }}
                      className={cn(
                        !isBrandSelected && "pointer-events-none opacity-60",
                        activeItems.length && PLATFORM_STYLE[platform.value],
                        highlightPlatform === platform.value &&
                          "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-white"
                      )}
                    >
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--primary-light)] text-[var(--primary)]",
                            activeItems.length && "bg-white/20 text-current"
                          )}>
                            <Link2 className="h-5 w-5" />
                          </div>
                          <span
                            className={cn(
                              "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
                              activeItems.length
                                ? "border-white/30 bg-white/15 text-current"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            )}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div>
                          <p className={cn("text-base font-semibold text-[var(--text)]", activeItems.length && "text-current")}>
                            {platform.label}
                          </p>
                          <p className={cn("mt-1 text-sm text-[var(--text-muted)]", activeItems.length && "text-white/90")}>
                            {platform.description}
                          </p>
                        </div>

                        {connectionsLoading ? (
                          <div className="space-y-2">
                            <div className="h-3 w-32 rounded-full kondor-shimmer" />
                            <div className="h-3 w-24 rounded-full kondor-shimmer" />
                          </div>
                        ) : activeItems.length ? (
                          <div className="space-y-1">
                            {activeItems.slice(0, 3).map((item) => (
                              <div
                                key={item.id}
                                className={cn(
                                  "flex items-center gap-2 text-xs text-[var(--text-muted)]",
                                  activeItems.length && "text-white/90"
                                )}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                {item.externalAccountName || item.externalAccountId}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className={cn("flex items-center gap-2 text-xs text-[var(--text-muted)]", activeItems.length && "text-white/90")}>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Nenhuma conta vinculada.
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="flex items-center justify-between">
                        <Button
                          variant="secondary"
                          onClick={() => openDialog(platform.value)}
                          disabled={!brandId}
                          className={cn(activeItems.length && "border-white/35 bg-white/15 text-white hover:bg-white/25")}
                        >
                          Associar conta
                        </Button>
                        <Button variant="ghost" size="sm" disabled className={cn("text-xs", activeItems.length && "text-white/90")}>
                          Resumo da fonte
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </div>
          </main>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Associar conta</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm text-[var(--text-muted)]">
            <p>
              Selecione a conta para associar a plataforma{' '}
              <span className="font-semibold text-[var(--text)]">
                {PLATFORMS.find((p) => p.value === selectedPlatform)?.label || ""}
              </span>.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {availableLoading ? (
              <div className="space-y-2">
                <div className="h-10 rounded-[12px] border border-[var(--border)] kondor-shimmer" />
                <div className="h-10 rounded-[12px] border border-[var(--border)] kondor-shimmer" />
              </div>
            ) : availableError ? (
              <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                Falha ao carregar contas disponíveis.
              </div>
            ) : availableAccounts.length ? (
              availableAccounts.map((account) => (
                <button
                  key={account.externalAccountId}
                  type="button"
                  onClick={() => setSelectedAccountId(account.externalAccountId)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[12px] border px-4 py-3 text-left text-sm transition",
                    selectedAccountId === account.externalAccountId
                      ? "border-[var(--primary)] bg-[var(--primary-light)]"
                      : "border-[var(--border)] hover:border-slate-300"
                  )}
                >
                  <div>
                    <p className="font-semibold text-[var(--text)]">
                      {account.externalAccountName || account.externalAccountId}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {account.externalAccountId}
                    </p>
                  </div>
                  {selectedAccountId === account.externalAccountId ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <PlusCircle className="h-5 w-5 text-[var(--text-muted)]" />
                  )}
                </button>
              ))
            ) : (
              <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--text-muted)]">
                Nenhuma conta disponível para esta plataforma.
              </div>
            )}
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Nome (opcional)
            </label>
            <Input
              value={nameOverride}
              onChange={(event) => setNameOverride(event.target.value)}
              placeholder="Ex: Conta principal"
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => linkMutation.mutate()}
              disabled={!selectedAccountId || linkMutation.isPending}
            >
              {linkMutation.isPending ? "Associando..." : "Associar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Toast toast={toast} />
    </div>
  );
}
