import React from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, PlusCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { Card, CardContent, CardFooter } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.jsx";
import { Input } from "@/components/ui/input.jsx";
import { cn } from "@/utils/classnames.js";
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

const PLATFORMS = [
  {
    value: "META_ADS",
    label: "Meta Ads",
    description: "Contas de anuncios do Meta Ads.",
  },
  {
    value: "GOOGLE_ADS",
    label: "Google Ads",
    description: "Contas e campanhas do Google Ads.",
  },
  {
    value: "TIKTOK_ADS",
    label: "TikTok Ads",
    description: "Contas de anuncios do TikTok Ads.",
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
    label: "Google Meu Negocio",
    description: "Perfis do Google Business.",
  },
  {
    value: "FB_IG",
    label: "Facebook/Instagram",
    description: "Conexoes sociais do Meta.",
  },
];

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
  const queryClient = useQueryClient();
  const [brandId, setBrandId] = React.useState("");
  const [selectedPlatform, setSelectedPlatform] = React.useState(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [selectedAccountId, setSelectedAccountId] = React.useState("");
  const [nameOverride, setNameOverride] = React.useState("");

  const { data: clients = [] } = useQuery({
    queryKey: ["reportsV2-clients"],
    queryFn: () => base44.entities.Clients.list(),
  });

  React.useEffect(() => {
    if (brandId || !clients.length) return;
    setBrandId(clients[0].id);
  }, [brandId, clients]);

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
  });

  const openDialog = (platform) => {
    setSelectedPlatform(platform);
    setDialogOpen(true);
    setSelectedAccountId("");
    setNameOverride("");
  };

  const isBrandSelected = Boolean(brandId);

  return (
    <div className="min-h-screen bg-white" style={themeStyle}>
      <PageShell>
        <PageHeader
          kicker="Relatorios"
          title="Conexoes por marca"
          subtitle="Associe contas de dados para liberar widgets e plataformas."
          actions={
            <Button variant="secondary" onClick={() => navigate("/relatorios/v2")}
              className="gap-2">
              Voltar
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
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!isBrandSelected ? (
            <div className="col-span-full rounded-[16px] border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-700">
              Selecione uma marca para habilitar as conexoes.
            </div>
          ) : null}
          {PLATFORMS.map((platform) => {
            const items = connectionsByPlatform.get(platform.value) || [];
            const activeItems = items.filter((item) => item.status === "ACTIVE");
            const statusLabel = activeItems.length
              ? `${activeItems.length} conta${activeItems.length > 1 ? "s" : ""}`
              : "Sem conta";

            return (
              <Card
                key={platform.value}
                className={cn(!isBrandSelected && "pointer-events-none opacity-60")}
              >
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--primary-light)] text-[var(--primary)]">
                      <Link2 className="h-5 w-5" />
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
                        activeItems.length
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-[var(--text)]">
                      {platform.label}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
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
                          className="flex items-center gap-2 text-xs text-[var(--text-muted)]"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          {item.externalAccountName || item.externalAccountId}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
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
                  >
                    Associar conta
                  </Button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    Resumo da fonte
                  </button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </PageShell>

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
                Falha ao carregar contas disponiveis.
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
                Nenhuma conta disponivel para esta plataforma.
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
    </div>
  );
}
