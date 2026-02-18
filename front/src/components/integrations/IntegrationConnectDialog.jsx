import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";

function normalizeValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function buildSettings(fields, formData, kind) {
  const settings = { kind };
  fields.forEach((field) => {
    let value = formData[field.name];
    if (typeof value === "string") value = value.trim();
    if (!value) return;

    if (field.format === "json") {
      try {
        settings[field.name] = JSON.parse(value);
        return;
      } catch (_) {
        settings[field.name] = value;
        return;
      }
    }

    settings[field.name] = value;
  });
  return settings;
}

function buildClientOwnerKey(clientId, definition) {
  if (!clientId || !definition) return clientId || "";
  const suffix = definition.kind || definition.ownerKey || definition.provider || "CLIENT";
  return `${clientId}:${suffix}`;
}

export default function IntegrationConnectDialog({
  open,
  onOpenChange,
  definition,
  existing,
  integrations = [],
  clients = [],
  initialClientId = "",
}) {
  const queryClient = useQueryClient();
  const fields = definition?.fields || [];
  const isClientScope = definition?.scope === "client";
  const isMetaProvider = definition?.provider === "META";
  const [selectedClientId, setSelectedClientId] = useState("");
  const [oauthError, setOauthError] = useState("");
  const [metaSelectionError, setMetaSelectionError] = useState("");
  const [selectedMetaAccountId, setSelectedMetaAccountId] = useState("");
  const [selectedMetaPageId, setSelectedMetaPageId] = useState("");

  const effectiveExisting = useMemo(() => {
    if (!definition) return null;
    if (!isClientScope) return existing || null;
    if (!selectedClientId) return null;
    return (
      (integrations || []).find(
        (item) =>
          item.provider === definition.provider &&
          item.ownerType === "CLIENT" &&
          item.clientId === selectedClientId &&
          (!definition.kind || item.settings?.kind === definition.kind)
      ) || null
    );
  }, [definition, existing, integrations, isClientScope, selectedClientId]);

  const initialValues = useMemo(() => {
    const base = {};
    fields.forEach((field) => {
      base[field.name] = normalizeValue(effectiveExisting?.settings?.[field.name] ?? "");
    });
    return base;
  }, [effectiveExisting, fields]);

  const [formData, setFormData] = useState(initialValues);

  const metaAccounts = useMemo(() => {
    if (!effectiveExisting?.config || typeof effectiveExisting.config !== "object") return [];
    const accounts = effectiveExisting.config.accounts;
    return Array.isArray(accounts) ? accounts : [];
  }, [effectiveExisting]);

  const metaKind = useMemo(() => {
    if (definition?.kind) return String(definition.kind).toLowerCase();
    if (effectiveExisting?.settings?.kind) return String(effectiveExisting.settings.kind).toLowerCase();
    return "";
  }, [definition, effectiveExisting]);

  const isMetaAds = metaKind === "meta_ads";
  const isInstagramOnly = metaKind === "instagram_only";

  const metaAdOptions = useMemo(() => {
    if (!metaAccounts.length) return [];
    return metaAccounts
      .filter((account) => account?.adAccountId)
      .map((account) => ({
        value: account.adAccountId,
        label: account.name
          ? `${account.name} (${account.adAccountId})`
          : account.adAccountId,
      }));
  }, [metaAccounts]);

  const metaPageOptions = useMemo(() => {
    if (!metaAccounts.length) return [];
    return metaAccounts
      .filter((account) => account?.pageId)
      .filter((account) => (isInstagramOnly ? account?.igBusinessAccountId : true))
      .map((account) => ({
        value: account.pageId,
        label: account.pageName
          ? `${account.pageName}${account.igUsername ? ` • @${account.igUsername}` : ""}`
          : account.pageId,
        igBusinessAccountId: account.igBusinessAccountId || null,
        igUsername: account.igUsername || null,
      }));
  }, [metaAccounts, isInstagramOnly]);

  const hasMetaOauthConnection = useMemo(() => {
    if (!isMetaProvider || !effectiveExisting) return false;
    const status = String(
      effectiveExisting.connectionStatus || effectiveExisting.status || ""
    ).toUpperCase();
    return status === "CONNECTED";
  }, [isMetaProvider, effectiveExisting]);

  useEffect(() => {
    if (!open) {
      if (selectedClientId) setSelectedClientId("");
      if (oauthError) setOauthError("");
      if (metaSelectionError) setMetaSelectionError("");
      return;
    }
    if (isClientScope && initialClientId) {
      setSelectedClientId(initialClientId);
    } else if (isClientScope && !selectedClientId && clients.length === 1) {
      setSelectedClientId(clients[0].id);
    }
    setFormData(initialValues);
    if (oauthError) setOauthError("");
    if (metaSelectionError) setMetaSelectionError("");
  }, [
    open,
    initialValues,
    isClientScope,
    clients,
    selectedClientId,
    initialClientId,
    oauthError,
    metaSelectionError,
  ]);

  useEffect(() => {
    if (!effectiveExisting || !isMetaProvider) return;
    if (isMetaAds) {
      const current = effectiveExisting.settings?.adAccountId || "";
      const fallback = metaAdOptions[0]?.value || "";
      setSelectedMetaAccountId(current || fallback);
      return;
    }

    const currentPage = effectiveExisting.settings?.pageId || "";
    const fallbackPage = metaPageOptions[0]?.value || "";
    setSelectedMetaPageId(currentPage || fallbackPage);
  }, [effectiveExisting, isMetaProvider, isMetaAds, metaAdOptions, metaPageOptions]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!definition) throw new Error("Integração inválida.");
      const settings = buildSettings(fields, formData, definition.kind);
      if (isClientScope) {
        if (!selectedClientId) {
          throw new Error("Selecione um cliente antes de salvar.");
        }
        if (effectiveExisting?.id) {
          return base44.entities.Integration.update(effectiveExisting.id, {
            status: "CONNECTED",
            settings,
          });
        }
        return base44.jsonFetch(
          `/integrations/clients/${selectedClientId}/integrations/${definition.provider}/connect`,
          {
            method: "POST",
            body: JSON.stringify({
              providerName: definition.title,
              status: "CONNECTED",
              settings,
              ownerKey: buildClientOwnerKey(selectedClientId, definition),
            }),
          }
        );
      }

      if (existing?.id) {
        return base44.entities.Integration.update(existing.id, {
          status: "CONNECTED",
          settings,
        });
      }
      return base44.entities.Integration.create({
        provider: definition.provider,
        providerName: definition.title,
        ownerType: "AGENCY",
        ownerKey: definition.ownerKey,
        status: "CONNECTED",
        settings,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      onOpenChange(false);
    },
  });

  const oauthMutation = useMutation({
    mutationFn: async () => {
      if (!definition?.oauth?.endpoint) {
        throw new Error("Conexão OAuth indisponível.");
      }
      if (isClientScope && !selectedClientId) {
        throw new Error("Selecione um cliente antes de conectar.");
      }

      const params = new URLSearchParams();
      if (isClientScope && selectedClientId) {
        params.set("clientId", selectedClientId);
      }
      if (definition.kind) {
        params.set("kind", definition.kind);
      }

      const endpoint = params.toString()
        ? `${definition.oauth.endpoint}${
            definition.oauth.endpoint.includes("?") ? "&" : "?"
          }${params.toString()}`
        : definition.oauth.endpoint;

      const data = await base44.jsonFetch(endpoint, { method: "GET" });
      if (!data?.url) throw new Error("Resposta inválida do servidor (faltou url).");
      return data.url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err) => {
      setOauthError(err?.message || "Erro ao iniciar conexão OAuth.");
    },
  });

  const metaSelectionMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveExisting?.id) {
        throw new Error("Conexão não encontrada.");
      }
      if (!isMetaProvider) {
        throw new Error("Seleção disponível apenas para Meta.");
      }

      const currentSettings =
        effectiveExisting.settings && typeof effectiveExisting.settings === "object"
          ? effectiveExisting.settings
          : {};

      const nextSettings = { ...currentSettings, kind: metaKind || currentSettings.kind };

      if (isMetaAds) {
        if (!selectedMetaAccountId) {
          throw new Error("Selecione uma conta de anúncios.");
        }
        const account = metaAccounts.find(
          (item) => item?.adAccountId === selectedMetaAccountId
        );
        nextSettings.adAccountId = selectedMetaAccountId;
        nextSettings.accountId = selectedMetaAccountId;
        nextSettings.adAccountName = account?.name || null;
      } else {
        if (!selectedMetaPageId) {
          throw new Error("Selecione uma página do Facebook.");
        }
        const page = metaAccounts.find(
          (item) => item?.pageId === selectedMetaPageId
        );
        nextSettings.pageId = selectedMetaPageId;
        nextSettings.pageName = page?.pageName || null;
        nextSettings.igBusinessId = page?.igBusinessAccountId || null;
        nextSettings.igUsername = page?.igUsername || null;
      }

      return base44.entities.Integration.update(effectiveExisting.id, {
        status: "CONNECTED",
        settings: nextSettings,
      });
    },
    onSuccess: () => {
      setMetaSelectionError("");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (err) => {
      setMetaSelectionError(err?.message || "Falha ao salvar seleção.");
    },
  });

  if (!definition) return null;

  const metaSelectedLabel = isMetaAds
    ? metaAdOptions.find((item) => item.value === selectedMetaAccountId)?.label
    : metaPageOptions.find((item) => item.value === selectedMetaPageId)?.label;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{definition.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm text-gray-600">{definition.dialogDescription}</p>
          </div>

          {definition.oauth ? (
            <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{definition.oauth.title}</p>
                  <p className="text-xs text-gray-600">{definition.oauth.subtitle}</p>
                </div>
                <Button
                  type="button"
                  onClick={() => oauthMutation.mutate()}
                  disabled={oauthMutation.isPending || (isClientScope && !selectedClientId)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {oauthMutation.isPending ? "Conectando..." : definition.oauth.label}
                </Button>
              </div>
              {oauthError ? (
                <p className="mt-3 text-[11px] text-red-600">{oauthError}</p>
              ) : null}
              {isClientScope && !selectedClientId ? (
                <p className="mt-2 text-[11px] text-purple-600">
                  Selecione um cliente para conectar esta integração.
                </p>
              ) : null}
            </div>
          ) : null}

          {isMetaProvider && effectiveExisting && !metaAccounts.length ? (
            <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4">
              <p className="text-sm font-semibold text-purple-900">
                Conexão feita, mas sem contas disponíveis
              </p>
              <p className="text-xs text-purple-700 mt-1">
                Verifique permissões do app Meta ou conecte outro usuário com acesso às contas.
              </p>
            </div>
          ) : null}

          {isMetaProvider && effectiveExisting && metaAccounts.length ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Selecionar conta principal
                </p>
                <p className="text-xs text-gray-600">
                  Defina a página ou conta de anúncios usada nas automações.
                </p>
              </div>

              {isMetaAds ? (
                <div className="space-y-2">
                  <Label>Conta de anúncios</Label>
                  <SelectNative
                    value={selectedMetaAccountId}
                    onChange={(event) => setSelectedMetaAccountId(event.target.value)}
                  >
                    {metaAdOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectNative>
                  {metaAdOptions.length === 0 ? (
                    <div className="text-[11px] text-purple-600">
                      <p>Nenhuma conta de anuncios disponivel para este usuario.</p>
                      <a
                        href="https://business.facebook.com"
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold underline-offset-2 hover:underline"
                      >
                        Abrir Business Manager
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Página do Facebook</Label>
                  <SelectNative
                    value={selectedMetaPageId}
                    onChange={(event) => setSelectedMetaPageId(event.target.value)}
                  >
                    {metaPageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectNative>
                  {metaPageOptions.length === 0 ? (
                    <div className="text-[11px] text-purple-600">
                      <p>Nenhuma pagina com Instagram Business vinculada.</p>
                      <a
                        href="https://business.facebook.com"
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold underline-offset-2 hover:underline"
                      >
                        Vincular pagina no Meta
                      </a>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex items-center justify-between">
                {metaSelectionError ? (
                  <p className="text-[11px] text-red-600">{metaSelectionError}</p>
                ) : (
                  <span className="text-[11px] text-gray-500">
                    {metaSelectedLabel
                      ? `Selecionado: ${metaSelectedLabel}`
                      : "Você pode alterar essa escolha quando quiser."}
                  </span>
                )}
                <Button
                  type="button"
                  onClick={() => metaSelectionMutation.mutate()}
                  disabled={metaSelectionMutation.isPending}
                  className="bg-slate-900 hover:bg-slate-800"
                >
                  {metaSelectionMutation.isPending ? "Salvando..." : "Salvar seleção"}
                </Button>
              </div>
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              connectMutation.mutate();
            }}
            className="space-y-5"
          >
            {isClientScope ? (
              <div className="space-y-2">
                <Label>Cliente</Label>
                <SelectNative
                  value={selectedClientId}
                  onChange={(event) => setSelectedClientId(event.target.value)}
                  required
                >
                  <option value="">Selecione um cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </SelectNative>
                {clients.length === 0 ? (
                  <p className="text-[11px] text-purple-600">
                    Cadastre um cliente antes de conectar esta integração.
                  </p>
                ) : null}
                {effectiveExisting ? (
                  <p className="text-[11px] text-emerald-700">
                    Já existe uma conexão para este cliente. Você pode atualizar os dados.
                  </p>
                ) : null}
              </div>
            ) : null}

            {fields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label>{field.label}</Label>
                {field.type === "textarea" ? (
                  <Textarea
                    rows={field.rows || 6}
                    value={formData[field.name] || ""}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        [field.name]: event.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                ) : (
                  <Input
                    type={field.type || "text"}
                    value={formData[field.name] || ""}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        [field.name]: event.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    required={
                      field.required &&
                      !(
                        isMetaProvider &&
                        hasMetaOauthConnection &&
                        field.name === "accessToken"
                      )
                    }
                    disabled={
                      isMetaProvider &&
                      hasMetaOauthConnection &&
                      field.name === "accessToken"
                    }
                  />
                )}
                {field.helper ? (
                  <p className="text-[11px] text-gray-500">{field.helper}</p>
                ) : null}
                {isMetaProvider &&
                hasMetaOauthConnection &&
                field.name === "accessToken" ? (
                  <p className="text-[11px] text-emerald-700">
                    Conectado via Meta. O token já foi salvo automaticamente.
                  </p>
                ) : null}
              </div>
            ))}

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={connectMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700"
                disabled={
                  connectMutation.isPending ||
                  (isClientScope && (!selectedClientId || clients.length === 0))
                }
              >
                {connectMutation.isPending ? "Salvando..." : "Salvar conexão"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
