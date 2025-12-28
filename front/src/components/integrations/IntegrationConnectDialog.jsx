import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";

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
}) {
  const queryClient = useQueryClient();
  const fields = definition?.fields || [];
  const isClientScope = definition?.scope === "client";
  const [selectedClientId, setSelectedClientId] = useState("");
  const [oauthError, setOauthError] = useState("");

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

  useEffect(() => {
    if (!open) {
      if (selectedClientId) setSelectedClientId("");
      if (oauthError) setOauthError("");
      return;
    }
    if (isClientScope && !selectedClientId && clients.length === 1) {
      setSelectedClientId(clients[0].id);
    }
    setFormData(initialValues);
    if (oauthError) setOauthError("");
  }, [open, initialValues, isClientScope, clients, selectedClientId, oauthError]);

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

  if (!definition) return null;

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
                <p className="mt-2 text-[11px] text-amber-600">
                  Selecione um cliente para conectar esta integração.
                </p>
              ) : null}
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
                <select
                  value={selectedClientId}
                  onChange={(event) => setSelectedClientId(event.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                >
                  <option value="">Selecione um cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {clients.length === 0 ? (
                  <p className="text-[11px] text-amber-600">
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
                    required={field.required}
                  />
                )}
                {field.helper ? (
                  <p className="text-[11px] text-gray-500">{field.helper}</p>
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
