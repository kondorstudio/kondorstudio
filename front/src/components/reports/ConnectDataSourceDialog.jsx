import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";

const SOURCE_FILTERS = {
  META_ADS: {
    providers: ["META"],
    kinds: ["meta_ads"],
    label: "Meta Ads",
  },
  META_SOCIAL: {
    providers: ["META"],
    kinds: ["meta_business", "instagram_only"],
    label: "Facebook/Instagram",
  },
  GOOGLE_ADS: {
    providers: ["GOOGLE", "GOOGLE_ADS"],
    kinds: ["google_ads"],
    label: "Google Ads",
  },
  GA4: {
    providers: ["GOOGLE"],
    kinds: ["google_analytics"],
    label: "Google Analytics 4",
  },
  GBP: {
    providers: ["GOOGLE"],
    kinds: ["google_business"],
    label: "Google Meu Negocio",
  },
  TIKTOK_ADS: {
    providers: ["TIKTOK"],
    kinds: ["tiktok_ads"],
    label: "TikTok Ads",
  },
  LINKEDIN_ADS: {
    providers: ["LINKEDIN"],
    kinds: ["linkedin_ads"],
    label: "LinkedIn Ads",
  },
};

function normalizeIntegrationKind(kind) {
  if (!kind) return "";
  return String(kind).toLowerCase();
}

function getIntegrationParams(source, brandId) {
  const filter = SOURCE_FILTERS[source];
  if (!filter) return { clientId: brandId };
  const params = {
    clientId: brandId,
    status: "CONNECTED",
  };
  if (filter.providers.length === 1) {
    params.provider = filter.providers[0];
  }
  if (filter.kinds.length === 1) {
    params.kind = filter.kinds[0];
  }
  return params;
}

function filterIntegrations(source, integrations = []) {
  const filter = SOURCE_FILTERS[source];
  if (!filter) return integrations;
  return integrations.filter((integration) => {
    const providerMatch = filter.providers.includes(integration.provider);
    const kind = normalizeIntegrationKind(
      integration.settings?.kind || integration.config?.kind
    );
    const kindMatch = filter.kinds.length ? filter.kinds.includes(kind) : true;
    return providerMatch && kindMatch;
  });
}

export default function ConnectDataSourceDialog({
  open,
  onOpenChange,
  brandId,
  defaultSource,
}) {
  const queryClient = useQueryClient();
  const [source, setSource] = useState(defaultSource || "META_ADS");
  const [integrationId, setIntegrationId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [ga4SyncError, setGa4SyncError] = useState("");
  const isGa4 = source === "GA4";

  useEffect(() => {
    if (!open) return;
    setSource(defaultSource || "META_ADS");
    setIntegrationId("");
    setAccountId("");
    setDisplayName("");
    setError("");
    setGa4SyncError("");
  }, [open, defaultSource]);

  const { data: integrationData, isLoading: integrationsLoading } = useQuery({
    queryKey: ["reporting-integrations", brandId, source],
    queryFn: async () => {
      if (!brandId || !source) return { items: [] };
      const params = getIntegrationParams(source, brandId);
      const data = await base44.entities.Integration.list(params);
      return data;
    },
    enabled: open && Boolean(brandId) && Boolean(source) && !isGa4,
  });

  const integrations = useMemo(() => {
    const items = Array.isArray(integrationData)
      ? integrationData
      : integrationData?.items || [];
    return filterIntegrations(source, items);
  }, [integrationData, source]);

  const { data: accountData, isLoading: accountsLoading } = useQuery({
    queryKey: ["reporting-accounts", integrationId, source],
    queryFn: async () => {
      if (!integrationId || !source) return { items: [] };
      return base44.jsonFetch(
        `/reporting/integrations/${integrationId}/accounts?source=${source}`,
        { method: "GET" }
      );
    },
    enabled: open && Boolean(integrationId) && Boolean(source) && !isGa4,
  });

  const { data: ga4Status, isLoading: ga4Loading } = useQuery({
    queryKey: ["ga4-status"],
    queryFn: () => base44.ga4.status(),
    enabled: open && isGa4,
  });

  const ga4Accounts = useMemo(() => {
    const list = ga4Status?.properties || [];
    return list.map((prop) => ({
      id: prop.propertyId,
      displayName: prop.displayName
        ? `${prop.displayName} (${prop.propertyId})`
        : String(prop.propertyId),
    }));
  }, [ga4Status]);

  const accounts = useMemo(() => {
    if (isGa4) return ga4Accounts;
    return accountData?.items || [];
  }, [accountData, ga4Accounts, isGa4]);

  const ga4NeedsReconnect = Boolean(ga4Status?.lastError);
  const isGa4Connected = ga4Status?.status === "CONNECTED" && !ga4NeedsReconnect;
  const ga4HasProperties = ga4Accounts.length > 0;

  useEffect(() => {
    if (!integrations.length) {
      setIntegrationId("");
      return;
    }
    if (!integrationId) {
      setIntegrationId(integrations[0].id);
    }
  }, [integrations, integrationId]);

  useEffect(() => {
    if (!accounts.length) {
      setAccountId("");
      return;
    }
    if (!accountId) {
      setAccountId(accounts[0].id);
      setDisplayName(accounts[0].displayName || "");
    }
  }, [accounts, accountId]);

  const syncMutation = useMutation({
    mutationFn: () => base44.ga4.syncProperties(),
    onSuccess: () => {
      setGa4SyncError("");
      queryClient.invalidateQueries({ queryKey: ["ga4-status"] });
    },
    onError: (err) => {
      const message =
        err?.data?.error ||
        err?.message ||
        "Falha ao sincronizar propriedades GA4.";
      setGa4SyncError(message);
    },
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("Selecione uma marca.");
      if (!source) throw new Error("Selecione a fonte.");
      if (!integrationId && !isGa4) throw new Error("Selecione a integração.");
      if (!accountId) throw new Error("Selecione a conta.");
      if (!displayName) throw new Error("Informe um nome de exibicao.");

      const payload = {
        source,
        externalAccountId: accountId,
        displayName,
      };
      if (!isGa4) payload.integrationId = integrationId;

      return base44.jsonFetch(
        `/reporting/brands/${brandId}/connections/link`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
    },
    onSuccess: async () => {
      setError("");
      setGa4SyncError("");
      if (brandId) {
        queryClient.invalidateQueries({ queryKey: ["reporting-connections", brandId] });
        queryClient.invalidateQueries({
          queryKey: ["reporting-widget-connections", brandId],
        });
        if (source) {
          queryClient.invalidateQueries({
            queryKey: ["reporting-integrations", brandId, source],
          });
          if (integrationId) {
            queryClient.invalidateQueries({
              queryKey: ["reporting-accounts", integrationId, source],
            });
          }
        }
        onOpenChange(false);
        await queryClient.refetchQueries({
          queryKey: ["reporting-connections", brandId],
          type: "active",
        });
        await queryClient.refetchQueries({
          queryKey: ["reporting-widget-connections", brandId],
          type: "active",
        });
        return;
      }
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err?.message || "Erro ao vincular conta.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Associar conta</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Fonte de dados</Label>
            <SelectNative
              value={source}
              onChange={(event) => {
                const value = event.target.value;
                setSource(value);
                setIntegrationId("");
                setAccountId("");
                setDisplayName("");
              }}
            >
              {Object.entries(SOURCE_FILTERS).map(([value, data]) => (
                <option key={value} value={value}>
                  {data.label}
                </option>
              ))}
            </SelectNative>
          </div>

          {isGa4 ? (
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
              {isGa4Connected
                ? "Usando a conexão GA4 do usuário atual."
                : "Conecte o GA4 na tela de integrações para liberar as propriedades."}
              {!isGa4Connected ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-2"
                  onClick={() => {
                    window.location.href = "/integrations/ga4";
                  }}
                >
                  {ga4NeedsReconnect ? "Reconectar GA4" : "Conectar GA4"}
                </Button>
              ) : null}
              {isGa4Connected && !ga4HasProperties ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span>Nenhuma propriedade sincronizada ainda.</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                  >
                    {syncMutation.isPending ? "Sincronizando..." : "Sincronizar"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <Label>Integracao</Label>
              <SelectNative
                value={integrationId}
                onChange={(event) => {
                  const value = event.target.value;
                  setIntegrationId(value);
                  setAccountId("");
                  setDisplayName("");
                }}
              >
                <option value="">
                  {integrationsLoading
                    ? "Carregando integracoes..."
                    : integrations.length
                    ? "Selecione"
                    : "Nenhuma integracao conectada"}
                </option>
                {integrations.map((integration) => (
                  <option key={integration.id} value={integration.id}>
                    {integration.providerName || integration.provider}
                  </option>
                ))}
              </SelectNative>
            </div>
          )}

          <div>
            <Label>Conta</Label>
            <SelectNative
              value={accountId}
              onChange={(event) => {
                const value = event.target.value;
                setAccountId(value);
                const match = accounts.find((acc) => acc.id === value);
                if (match) setDisplayName(match.displayName || "");
              }}
              disabled={
                (!integrationId && !isGa4) ||
                (isGa4 && (!isGa4Connected || !ga4HasProperties))
              }
            >
              <option value="">
                {(isGa4 ? ga4Loading : accountsLoading)
                  ? isGa4
                    ? "Carregando propriedades..."
                    : "Carregando contas..."
                  : accounts.length
                  ? "Selecione"
                  : isGa4
                    ? "Nenhuma propriedade retornada"
                    : "Nenhuma conta retornada"}
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName || account.id}
                </option>
              ))}
            </SelectNative>
          </div>

          <div>
            <Label>Nome de exibicao</Label>
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ex: Conta principal"
            />
          </div>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          {ga4SyncError ? (
            <p className="text-xs text-rose-600">{ga4SyncError}</p>
          ) : null}
          {isGa4 && ga4Status?.lastError ? (
            <p className="text-xs text-rose-600">{ga4Status.lastError}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => linkMutation.mutate()}
              disabled={linkMutation.isLoading}
            >
              {linkMutation.isLoading ? "Salvando..." : "Associar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
