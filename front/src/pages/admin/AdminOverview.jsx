// front/src/pages/admin/AdminOverview.jsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import {
  Building2,
  Users,
  Activity,
  AlertTriangle,
  CreditCard,
  TrendingDown,
  Plug,
} from "lucide-react";

export default function AdminOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => base44.admin.overview(),
  });

  const tenantsData = data?.overview?.tenants || {};
  const userData = data?.overview?.usuarios || {};
  const billingData = data?.overview?.billing || {};
  const integrationsData = data?.overview?.integrations || {};
  const errorHighlights = data?.highlights?.tenantsWithErrors || [];
  const jobHighlights = data?.highlights?.failingQueues || [];

  const metricCards = [
    {
      key: "total",
      label: "Tenants totais",
      value: tenantsData.total,
      icon: Building2,
      bg: "bg-purple-50",
    },
    {
      key: "ativos",
      label: "Tenants ativos",
      value: tenantsData.ativos,
      icon: Activity,
      bg: "bg-green-50",
    },
    {
      key: "trial",
      label: "Tenants em trial",
      value: tenantsData.trial,
      icon: Users,
      bg: "bg-blue-50",
    },
    {
      key: "suspensos",
      label: "Suspensos",
      value: tenantsData.suspensos,
      icon: AlertTriangle,
      bg: "bg-yellow-50",
    },
    {
      key: "usuarios-ativos",
      label: "Usuarios ativos",
      value: userData.ativos,
      icon: Users,
      bg: "bg-slate-50",
    },
    {
      key: "mrr",
      label: "MRR estimado",
      value: billingData.mrr,
      icon: CreditCard,
      bg: "bg-emerald-50",
      format: (value) =>
        typeof value === "number"
          ? value.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })
          : value,
    },
    {
      key: "churn",
      label: "Churn 30d",
      value: billingData.churnRate,
      icon: TrendingDown,
      bg: "bg-rose-50",
      format: (value) =>
        typeof value === "number" ? `${value.toFixed(2)}%` : value,
    },
    {
      key: "integracoes",
      label: "Integracoes conectadas",
      value: integrationsData.connected,
      icon: Plug,
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-gray-500">
          Visão geral
        </p>
        <h1 className="text-3xl font-bold text-gray-900">
          Saúde da plataforma
        </h1>
        <p className="text-gray-600">
          Consolide números de tenants, usuários e alertas críticos em um só lugar.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          const value = card.value;
          const formattedValue = card.format ? card.format(value) : value;
          return (
            <Card key={card.key} className="border border-gray-100">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  {card.label}
                </CardTitle>
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <Icon className="w-4 h-4 text-gray-700" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-gray-900">
                  {isLoading || typeof value === "undefined" ? "—" : formattedValue}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Atualizado em tempo real
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border border-gray-100">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-900">
              Tenants com mais erros
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              Últimas 24h
            </Badge>
          </CardHeader>
          <CardContent>
            {errorHighlights.length === 0 && (
              <p className="text-sm text-gray-500">Nenhum alerta crítico.</p>
            )}
            <ul className="space-y-3">
              {errorHighlights.map((tenant) => (
                <li
                  key={tenant.id || tenant.tenantId || tenant.name}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {tenant.name || tenant.tenantName || "Tenant"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tenant.totalErrors || tenant.errors || 0} erros recentes
                    </p>
                  </div>
                  <Badge variant="danger" className="text-xs">
                    {tenant.statusLabel || tenant.status || "—"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-gray-900">
              Filas com falhas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {jobHighlights.length === 0 && (
              <p className="text-sm text-gray-500">
                Sem jobs críticos registrados.
              </p>
            )}
            <div className="space-y-3">
              {jobHighlights.map((job) => (
                <div
                  key={`${job.queue}-${job.status}-${job.tenantId || job.id}`}
                  className="rounded-lg border border-gray-100 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">
                      {job.queue || "Fila"}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {job.status || "FAILED"}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {job.totalFailures || job.count || 0} falhas recentes
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
