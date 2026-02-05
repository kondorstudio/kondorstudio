// front/src/pages/admin/AdminIntegrations.jsx
import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Input } from "@/components/ui/input.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Loader2, Link2 } from "lucide-react";
import { hasAdminPermission } from "@/utils/adminPermissions";

const PAGE_SIZE = 12;

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "CONNECTED", label: "Conectado" },
  { value: "DISCONNECTED", label: "Desconectado" },
  { value: "ERROR", label: "Erro" },
];

const providerOptions = [
  { value: "", label: "Todos" },
  { value: "META", label: "Meta" },
  { value: "GOOGLE", label: "Google" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "WHATSAPP_META_CLOUD", label: "WhatsApp Cloud" },
  { value: "OTHER", label: "Outro" },
];

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (err) {
    return value;
  }
}

export default function AdminIntegrations() {
  const queryClient = useQueryClient();
  const authData = base44.storage.loadAuthFromStorage?.();
  const currentRole = authData?.user?.role;
  const canWrite = hasAdminPermission(currentRole, "integrations.write");

  const [filters, setFilters] = useState({
    tenantId: "",
    provider: "",
    status: "",
  });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [configText, setConfigText] = useState("");
  const [settingsText, setSettingsText] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [actionId, setActionId] = useState(null);

  const queryKey = useMemo(
    () => ["admin-integrations", { ...filters, page }],
    [filters, page],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      base44.admin.integrations({
        page,
        pageSize: PAGE_SIZE,
        tenantId: filters.tenantId || undefined,
        provider: filters.provider || undefined,
        status: filters.status || undefined,
      }),
    keepPreviousData: true,
  });

  const integrations = data?.items || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: integrations.length };

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => base44.admin.updateIntegration(id, payload),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Integracao atualizada." });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error?.data?.error || "Erro ao atualizar integracao.",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id) => base44.admin.disconnectIntegration(id),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Integracao desconectada." });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error?.data?.error || "Erro ao desconectar integracao.",
      });
    },
  });

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters({ tenantId: "", provider: "", status: "" });
    setPage(1);
  };

  const openEditor = (integration) => {
    setEditing(integration);
    setConfigText(
      integration?.config ? JSON.stringify(integration.config, null, 2) : "{}"
    );
    setSettingsText(
      integration?.settings ? JSON.stringify(integration.settings, null, 2) : "{}"
    );
  };

  const handleSave = async () => {
    if (!editing || !canWrite) return;
    setFeedback(null);
    setActionId(editing.id);
    try {
      const parsedConfig = configText ? JSON.parse(configText) : null;
      const parsedSettings = settingsText ? JSON.parse(settingsText) : null;
      await updateMutation.mutateAsync({
        id: editing.id,
        payload: {
          config: parsedConfig,
          settings: parsedSettings,
        },
      });
      setEditing(null);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "JSON invalido.",
      });
    } finally {
      setActionId(null);
    }
  };

  const handleStatusUpdate = async (integrationId, status) => {
    if (!canWrite) return;
    setFeedback(null);
    setActionId(integrationId);
    try {
      await updateMutation.mutateAsync({ id: integrationId, payload: { status } });
    } finally {
      setActionId(null);
    }
  };

  const handleDisconnect = async (integrationId) => {
    if (!canWrite) return;
    setFeedback(null);
    setActionId(integrationId);
    try {
      await disconnectMutation.mutateAsync(integrationId);
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-gray-500">Integracoes</p>
        <h1 className="text-3xl font-bold text-gray-900">Conexoes ativas</h1>
        <p className="text-gray-600">
          Gerencie status e credenciais de integracao por tenant.
        </p>
      </div>

      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base text-gray-900">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">
                Tenant ID
              </label>
              <Input
                value={filters.tenantId}
                onChange={(e) => handleFilterChange("tenantId", e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">
                Provider
              </label>
              <Select
                value={filters.provider}
                onValueChange={(value) => handleFilterChange("provider", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((option) => (
                    <SelectItem key={option.value || "all"} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">
                Status
              </label>
              <Select
                value={filters.status}
                onValueChange={(value) => handleFilterChange("status", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value || "all"} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </form>
        </CardContent>
      </Card>

      {feedback && (
        <div
          className={
            "text-sm rounded-lg border px-4 py-2 " +
            (feedback.type === "success"
              ? "border-emerald-200 text-emerald-700 bg-emerald-50"
              : "border-red-200 text-red-700 bg-red-50")
          }
        >
          {feedback.message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Integracao</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Tenant</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Criada</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {integrations.map((integration) => (
                  <tr key={integration.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-purple-500" />
                        <div>
                          <p className="font-medium text-gray-900">
                            {integration.provider}
                          </p>
                          <p className="text-xs text-gray-500">
                            {integration.ownerType} • {integration.ownerKey || "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {integration.tenantId || "—"}
                    </td>
                    <td className="px-4 py-3">
                    <Select
                      value={integration.status || ""}
                      onValueChange={(value) => handleStatusUpdate(integration.id, value)}
                    >
                      <SelectTrigger className="w-40" disabled={!canWrite}>
                        <SelectValue />
                      </SelectTrigger>
                        <SelectContent>
                          {statusOptions
                            .filter((option) => option.value)
                            .map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Badge variant="outline" className="text-xs mt-2">
                        {integration.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatDate(integration.createdAt)}
                    </td>
                    <td className="px-4 py-3 space-y-2">
                      <button
                        type="button"
                        onClick={() => openEditor(integration)}
                        className="block text-xs text-purple-600 hover:text-purple-800"
                      >
                        Editar JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDisconnect(integration.id)}
                        disabled={!canWrite || actionId === integration.id}
                        className="block text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                      >
                        Desconectar
                      </button>
                    </td>
                  </tr>
                ))}
                {!isLoading && integrations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <p>Nenhuma integracao encontrada para os filtros atuais.</p>
                        <Button size="sm" variant="secondary" onClick={resetFilters}>
                          Limpar filtros
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {(isLoading || isFetching) && (
            <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Atualizando integracoes...
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 text-sm text-gray-600 border-t border-gray-100">
            <span>
              Pagina {pagination.page} de {pagination.totalPages || 1} — {pagination.total} registros
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                className="px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={pagination.page >= (pagination.totalPages || 1)}
                onClick={() =>
                  setPage((prev) => Math.min(prev + 1, pagination.totalPages || prev + 1))
                }
                className="px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 disabled:opacity-50"
              >
                Proxima
              </button>
            </div>
          </div>
        </div>

        <Card className="border border-gray-200 h-fit">
          <CardHeader>
            <CardTitle className="text-base text-gray-900">Editor rapido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!editing && (
              <p className="text-sm text-gray-500">
                Selecione uma integracao para editar config e settings.
              </p>
            )}
            {editing && (
              <>
                <div className="text-sm text-gray-700">
                  <p className="font-semibold">{editing.provider}</p>
                  <p className="text-xs text-gray-500">{editing.id}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-gray-500">
                    Config JSON
                  </label>
                  <textarea
                    className="w-full min-h-[140px] rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-700"
                    value={configText}
                    onChange={(e) => setConfigText(e.target.value)}
                    readOnly={!canWrite}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-gray-500">
                    Settings JSON
                  </label>
                  <textarea
                    className="w-full min-h-[140px] rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-700"
                    value={settingsText}
                    onChange={(e) => setSettingsText(e.target.value)}
                    readOnly={!canWrite}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={!canWrite || actionId === editing.id}
                  >
                    Salvar
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  >
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
