// front/src/pages/admin/AdminBilling.jsx
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
import { CreditCard, Loader2, RefreshCw, Search } from "lucide-react";
import { hasAdminPermission } from "@/utils/adminPermissions";

const PAGE_SIZE = 10;

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "ACTIVE", label: "Ativo" },
  { value: "TRIAL", label: "Trial" },
  { value: "SUSPENDED", label: "Suspenso" },
  { value: "CANCELLED", label: "Cancelado" },
];

function formatDate(value) {
  if (!value) return "—";
  try {
    const date = new Date(value);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (err) {
    return value;
  }
}

export default function AdminBilling() {
  const queryClient = useQueryClient();
  const authData = base44.storage.loadAuthFromStorage?.();
  const currentRole = authData?.user?.role;
  const canWrite = hasAdminPermission(currentRole, "billing.write");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState(null);
  const [actionId, setActionId] = useState(null);

  const queryKey = useMemo(
    () => ["admin-billing", { search, status, page }],
    [search, status, page],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      base44.admin.billingTenants({
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
      }),
    keepPreviousData: true,
  });

  const tenants = data?.items || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: tenants.length };

  const syncMutation = useMutation({
    mutationFn: (tenantId) => base44.admin.syncTenantBilling(tenantId),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Stripe sincronizado." });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error?.data?.error || "Erro ao sincronizar Stripe.",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ subscriptionId, cancelAtPeriodEnd }) =>
      base44.admin.cancelSubscription(subscriptionId, { cancelAtPeriodEnd }),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Assinatura atualizada." });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error?.data?.error || "Erro ao cancelar assinatura.",
      });
    },
  });

  const handleSync = async (tenantId) => {
    if (!canWrite) return;
    setFeedback(null);
    setActionId(tenantId);
    try {
      await syncMutation.mutateAsync(tenantId);
    } finally {
      setActionId(null);
    }
  };

  const handleCancel = async (subscriptionId) => {
    if (!canWrite || !subscriptionId) return;
    setFeedback(null);
    setActionId(subscriptionId);
    try {
      await cancelMutation.mutateAsync({
        subscriptionId,
        cancelAtPeriodEnd: true,
      });
    } finally {
      setActionId(null);
    }
  };

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-gray-500">Billing</p>
        <h1 className="text-3xl font-bold text-gray-900">Assinaturas & Stripe</h1>
        <p className="text-gray-600">
          Controle MRR, status de assinatura e sincronizacao com Stripe.
        </p>
      </div>

      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base text-gray-900">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSearch}>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-600 mb-1 block">
                Buscar tenant
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome ou slug"
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">
                Status
              </label>
              <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value || "all"} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-3 flex justify-end">
              <Button type="submit" className="px-6">
                Aplicar filtros
              </Button>
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

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tenant</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Plano</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Assinatura</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ciclo</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tenants.map((tenant) => {
                const subscription = tenant.subscription;
                return (
                  <tr key={tenant.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-purple-500" />
                        <div>
                          <p className="font-medium text-gray-900">{tenant.name}</p>
                          <p className="text-xs text-gray-500">{tenant.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {tenant.plan?.name || "Sem plano"}
                      {tenant.plan?.key && (
                        <p className="text-xs text-gray-500">{tenant.plan.key}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {subscription?.status || "Sem assinatura"}
                      </Badge>
                      {subscription?.cancelAtPeriodEnd && (
                        <p className="text-xs text-purple-600 mt-1">
                          Cancelamento agendado
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {subscription?.currentPeriodEnd
                        ? `Renova em ${formatDate(subscription.currentPeriodEnd)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 space-y-2">
                      <button
                        type="button"
                        onClick={() => handleSync(tenant.id)}
                        disabled={!canWrite || actionId === tenant.id}
                        className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Sincronizar Stripe
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancel(subscription?.id)}
                        disabled={!canWrite || !subscription?.id || actionId === subscription?.id}
                        className="block text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                      >
                        Cancelar assinatura
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && tenants.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <p>Nenhum tenant encontrado com os filtros atuais.</p>
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
            <Loader2 className="w-4 h-4 animate-spin" /> Atualizando billing...
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 text-sm text-gray-600 border-t border-gray-100">
          <span>
            Pagina {pagination.page} de {pagination.totalPages || 1} — {pagination.total} tenants
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
    </div>
  );
}
