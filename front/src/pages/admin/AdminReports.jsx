// front/src/pages/admin/AdminReports.jsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Activity, Building2, Users, CreditCard, Plug, ShieldAlert } from "lucide-react";

function formatCurrency(value) {
  if (typeof value !== "number") return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function AdminReports() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () => base44.admin.overview(),
  });

  const { data: complianceData, isLoading: complianceLoading } = useQuery({
    queryKey: ["admin-credentials-compliance"],
    queryFn: () => base44.admin.credentialsCompliance({ sampleSize: 10 }),
  });

  const tenants = data?.overview?.tenants || {};
  const users = data?.overview?.usuarios || {};
  const billing = data?.overview?.billing || {};
  const integrations = data?.overview?.integrations || {};

  const complianceTotals = complianceData?.totals || {};
  const exposedSamples = complianceData?.samples?.exposedIntegrations || [];

  const cards = [
    {
      label: "Tenants totais",
      value: tenants.total,
      icon: Building2,
    },
    {
      label: "Tenants ativos",
      value: tenants.ativos,
      icon: Activity,
    },
    {
      label: "Usuarios ativos",
      value: users.ativos,
      icon: Users,
    },
    {
      label: "MRR estimado",
      value: formatCurrency(billing.mrr),
      icon: CreditCard,
    },
    {
      label: "Churn 30d",
      value: typeof billing.churnRate === "number" ? `${billing.churnRate.toFixed(2)}%` : "—",
      icon: Activity,
    },
    {
      label: "Integracoes conectadas",
      value: integrations.connected,
      icon: Plug,
    },
  ];

  const complianceCards = [
    {
      label: "Vault entries",
      value: complianceTotals.vaultEntries,
    },
    {
      label: "Integracoes expostas",
      value: complianceTotals.integrationsExposed,
    },
    {
      label: "Com credentialRef",
      value: complianceTotals.integrationsWithCredentialRef,
    },
    {
      label: "Raw columns",
      value: complianceTotals.rawColumns,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-gray-500">Relatórios</p>
        <h1 className="text-3xl font-bold text-gray-900">Métricas executivas</h1>
        <p className="text-gray-600">
          Resumo consolidado de usuarios, faturamento, integracoes e compliance.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const value = isLoading ? "—" : card.value ?? "—";
          return (
            <Card key={card.label} className="border border-gray-100">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  {card.label}
                </CardTitle>
                <div className="p-2 rounded-lg bg-gray-50">
                  <Icon className="w-4 h-4 text-gray-700" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-1">Atualizado em tempo real</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border border-gray-200">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-base text-gray-900">Compliance de credenciais</CardTitle>
          <Badge variant="outline" className="text-xs">
            Sprint 6
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {complianceCards.map((item) => (
            <div key={item.label} className="rounded-lg border border-gray-100 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">{item.label}</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">
                {complianceLoading ? "—" : item.value ?? 0}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border border-gray-200">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-base text-gray-900">Amostra de integrações expostas</CardTitle>
          <Badge
            variant={(complianceTotals.integrationsExposed || 0) > 0 ? "danger" : "success"}
            className="text-xs"
          >
            {(complianceTotals.integrationsExposed || 0) > 0 ? "Ação necessária" : "Sem exposição"}
          </Badge>
        </CardHeader>
        <CardContent>
          {exposedSamples.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <ShieldAlert className="w-4 h-4 text-emerald-600" />
              Nenhuma integração exposta na amostra atual.
            </div>
          ) : (
            <div className="space-y-2">
              {exposedSamples.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-gray-100 p-3 text-sm text-gray-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-900">{item.provider}</p>
                    <Badge variant="outline" className="text-xs">{item.status || "—"}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Tenant: {item.tenantId || "—"}</p>
                  <p className="text-xs text-gray-500 mt-1">Atualizado: {item.updatedAt ? new Date(item.updatedAt).toLocaleString("pt-BR") : "—"}</p>
                  <p className="text-xs text-rose-700 mt-1">
                    {[
                      item.exposure?.hasRawColumns ? "raw-columns" : null,
                      item.exposure?.hasRawSettings ? "raw-settings" : null,
                      item.exposure?.hasRawConfig ? "raw-config" : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "exposição detectada"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-gray-200">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-base text-gray-900">Resumo financeiro</CardTitle>
          <Badge variant="outline" className="text-xs">
            {billing.activeSubscriptions || 0} assinaturas ativas
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 text-sm text-gray-600">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">MRR</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatCurrency(billing.mrr)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Churn 30d</p>
            <p className="text-lg font-semibold text-gray-900">
              {typeof billing.churnRate === "number"
                ? `${billing.churnRate.toFixed(2)}%`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Tenants cancelados 30d</p>
            <p className="text-lg font-semibold text-gray-900">
              {tenants.cancelados30d ?? "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base text-gray-900">Usuarios</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 text-sm text-gray-600">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
            <p className="text-lg font-semibold text-gray-900">{users.total ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Ativos</p>
            <p className="text-lg font-semibold text-gray-900">{users.ativos ?? "—"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
