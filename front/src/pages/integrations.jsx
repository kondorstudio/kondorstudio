import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { base44 } from "../apiClient/base44Client";

import { Button } from "@/components/ui/button.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { RefreshCw, PlugZap2 } from "lucide-react";

import WhatsAppIntegrationCard from "@/components/integrations/WhatsAppIntegrationCard.jsx";
import NewIntegrationDialog from "@/components/integrations/NewIntegrationDialog.jsx";

function formatDate(dt) {
  if (!dt) return "-";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }) {
  const s = (status || "disconnected").toLowerCase();
  const cls =
    s === "connected"
      ? "border-emerald-200 text-emerald-700"
      : s === "error"
        ? "border-red-200 text-red-700"
        : "border-amber-200 text-amber-700";

  return (
    <Badge variant="outline" className={cls}>
      {s}
    </Badge>
  );
}

export default function Integrations() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const location = useLocation();
  const queryClient = useQueryClient();

  const {
    data: integrations = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => base44.entities.Integration.list(),
  });

  const genericIntegrations = useMemo(() => {
    return integrations.filter((i) => i.provider !== "WHATSAPP_META_CLOUD");
  }, [integrations]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    if (params.get("whatsapp") === "connected") {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    }
  }, [location.search, queryClient]);

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Integrações</h1>
            <p className="text-gray-600">
              Conecte seus canais para automações, aprovações e métricas — no padrão SaaS (sem gambiarra de token colado).
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>

            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 flex items-center gap-2"
            >
              <PlugZap2 className="w-4 h-4" />
              Nova integração
            </Button>
          </div>
        </div>

        {/* Cards principais */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <WhatsAppIntegrationCard integrations={integrations} />
        </div>

        {/* Lista */}
        <Card className="border border-purple-100">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-gray-800">
              Conexões registradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : genericIntegrations.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nenhuma integração registrada ainda. Clique em “Nova integração” para começar.
              </p>
            ) : (
              <div className="space-y-3">
                {genericIntegrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2 bg-white"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {integration.provider}
                        </span>
                        <StatusBadge status={integration.status} />
                      </div>

                      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
                        <span>
                          Último sync: <span className="font-medium">{formatDate(integration.lastSyncAt)}</span>
                        </span>

                        {integration.errorMessage ? (
                          <span className="text-red-500">Erro: {integration.errorMessage}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-[11px] text-gray-500">
                      (Gerencie via “Nova integração” ou cards guiados no futuro)
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <NewIntegrationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    </div>
  );
}
