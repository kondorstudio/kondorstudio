// front/src/pages/admin/AdminUsers.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Input } from "@/components/ui/input.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Loader2, Search, UserCog, ShieldCheck } from "lucide-react";
import {
  hasAdminPermission,
  getAdminRoleLabel,
} from "@/utils/adminPermissions";
import { setImpersonationState, useImpersonationState } from "@/hooks/useImpersonation";

const PAGE_SIZE = 12;

const roleOptions = [
  { value: "", label: "Todos" },
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "MEMBER", label: "Member" },
  { value: "CLIENT", label: "Client" },
  { value: "GUEST", label: "Guest" },
  { value: "SUPPORT", label: "Support" },
  { value: "FINANCE", label: "Finance" },
  { value: "TECH", label: "Tech" },
];

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "ACTIVE", label: "Ativo" },
  { value: "INACTIVE", label: "Inativo" },
];

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const impersonation = useImpersonationState();
  const authData = base44.storage.loadAuthFromStorage?.();
  const currentRole = authData?.user?.role;
  const canUpdate = hasAdminPermission(currentRole, "users.update");
  const canImpersonate = hasAdminPermission(currentRole, "impersonate");

  const [filters, setFilters] = useState({
    search: "",
    role: "",
    status: "",
    tenantId: "",
  });
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);
  const [actionId, setActionId] = useState(null);

  const queryKey = useMemo(
    () => ["admin-users", { ...filters, page }],
    [filters, page],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      base44.admin.users({
        page,
        pageSize: PAGE_SIZE,
        search: filters.search || undefined,
        role: filters.role || undefined,
        status: filters.status || undefined,
        tenantId: filters.tenantId || undefined,
      }),
    keepPreviousData: true,
  });

  const users = data?.users || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: users.length };

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => base44.admin.updateUser(id, payload),
    onSuccess: (payload) => {
      const updated = payload?.user;
      if (updated) {
        queryClient.setQueryData(queryKey, (old) => {
          if (!old?.users) return old;
          return {
            ...old,
            users: old.users.map((user) =>
              user.id === updated.id ? { ...user, ...updated } : user
            ),
          };
        });
      }
      setFeedback({ type: "success", message: "Usuario atualizado." });
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error?.data?.error || "Falha ao atualizar usuario.",
      });
    },
  });

  const resetFilters = () => {
    setFilters({
      search: "",
      role: "",
      status: "",
      tenantId: "",
    });
    setPage(1);
  };

  const handleUpdate = (id, payload) => {
    if (!canUpdate) return;
    setFeedback(null);
    updateMutation.mutate({ id, payload });
  };

  const handleResetPassword = async (userId) => {
    if (!canUpdate) return;
    setFeedback(null);
    setActionId(userId);
    try {
      const data = await base44.admin.resetUserPassword(userId);
      setTempPassword({ userId, password: data?.tempPassword });
      setFeedback({ type: "success", message: "Senha temporaria gerada." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.data?.error || "Falha ao resetar senha.",
      });
    } finally {
      setActionId(null);
    }
  };

  const handleForceLogout = async (userId) => {
    if (!canUpdate) return;
    setFeedback(null);
    setActionId(userId);
    try {
      await base44.admin.forceUserLogout(userId);
      setFeedback({ type: "success", message: "Logout forcado com sucesso." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.data?.error || "Falha ao forcar logout.",
      });
    } finally {
      setActionId(null);
    }
  };

  const handleImpersonate = async (user) => {
    if (!canImpersonate || impersonation) return;
    setFeedback(null);
    setActionId(user.id);
    try {
      const originalAuth = base44.storage.loadAuthFromStorage?.();
      const data = await base44.admin.impersonate(user.id);
      const nextAuth = {
        accessToken: data.impersonationToken,
        refreshToken: null,
        tokenId: null,
        user: data.targetUser,
        tenant: data.targetUser?.tenantId
          ? { id: data.targetUser.tenantId, name: data.targetUser.tenantName }
          : null,
      };
      base44.storage.saveAuthToStorage?.(nextAuth);
      setImpersonationState({
        isImpersonating: true,
        sessionId: data.sessionId,
        sessionExpiresAt: data.sessionExpiresAt,
        tokenExpiresAt: data.tokenExpiresAt,
        userId: data.targetUser?.id,
        userName: data.targetUser?.name,
        userEmail: data.targetUser?.email,
        tenantId: data.targetUser?.tenantId,
        tenantName: data.targetUser?.tenantName,
        originalAuth,
      });
      navigate("/dashboard");
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.data?.error || "Falha ao iniciar impersonate.",
      });
    } finally {
      setActionId(null);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-gray-500">Usuarios</p>
        <h1 className="text-3xl font-bold text-gray-900">Controle global</h1>
        <p className="text-gray-600">
          Gerencie acesso, roles e MFA em todos os tenants.
        </p>
      </div>

      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base text-gray-900">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-600 mb-1 block">
                Buscar por nome ou e-mail
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={filters.search}
                  onChange={(e) => handleFilterChange("search", e.target.value)}
                  placeholder="Nome ou email..."
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">
                Role
              </label>
              <Select
                value={filters.role}
                onValueChange={(value) => handleFilterChange("role", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
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

            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-600 mb-1 block">
                Tenant ID (opcional)
              </label>
              <Input
                value={filters.tenantId}
                onChange={(e) => handleFilterChange("tenantId", e.target.value)}
                placeholder="Tenant ID"
              />
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

      {tempPassword && (
        <div className="text-sm rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-purple-900">
          Senha temporaria para o usuario {tempPassword.userId}:{" "}
          <span className="font-semibold">{tempPassword.password}</span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Usuario</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">MFA</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tenant</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ultimo acesso</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UserCog className="w-4 h-4 text-purple-500" />
                      <div>
                        <p className="font-medium text-gray-900">
                          {user.name || "Sem nome"}
                        </p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={user.role}
                      onValueChange={(value) => handleUpdate(user.id, { role: value })}
                    >
                      <SelectTrigger
                        className="w-36"
                        disabled={!canUpdate || user.role === "SUPER_ADMIN"}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptions
                          .filter((option) => option.value)
                          .map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      {user.roleLabel || getAdminRoleLabel(user.role)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.isActive ? "success" : "outline"} className="text-xs">
                      {user.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                    {canUpdate && user.role !== "SUPER_ADMIN" && (
                      <button
                        type="button"
                        onClick={() => handleUpdate(user.id, { isActive: !user.isActive })}
                        className="mt-2 text-xs text-purple-600 hover:text-purple-800"
                      >
                        {user.isActive ? "Desativar" : "Ativar"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">
                        {user.mfaEnabled ? "Ativo" : "Desligado"}
                      </span>
                    </div>
                    {canUpdate && user.role !== "SUPER_ADMIN" && (
                      <button
                        type="button"
                        onClick={() => handleUpdate(user.id, { mfaEnabled: !user.mfaEnabled })}
                        className="mt-2 text-xs text-purple-600 hover:text-purple-800"
                      >
                        {user.mfaEnabled ? "Desligar MFA" : "Ativar MFA"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {user.tenantId || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {formatDateTime(user.lastLoginAt)}
                  </td>
                  <td className="px-4 py-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => handleResetPassword(user.id)}
                      disabled={!canUpdate || user.role === "SUPER_ADMIN" || actionId === user.id}
                      className="block text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                    >
                      Resetar senha
                    </button>
                    <button
                      type="button"
                      onClick={() => handleForceLogout(user.id)}
                      disabled={!canUpdate || user.role === "SUPER_ADMIN" || actionId === user.id}
                      className="block text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                    >
                      Forcar logout
                    </button>
                    <button
                      type="button"
                      onClick={() => handleImpersonate(user)}
                      disabled={
                        !canImpersonate ||
                        impersonation ||
                        user.role === "SUPER_ADMIN" ||
                        actionId === user.id
                      }
                      className="block text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50"
                    >
                      Impersonar
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <p>Nenhum usuario encontrado com os filtros atuais.</p>
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(isLoading || isFetching) && (
          <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Atualizando usuarios...
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 text-sm text-gray-600 border-t border-gray-100">
          <span>
            Página {pagination.page} de {pagination.totalPages || 1} — {pagination.total} registros
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
