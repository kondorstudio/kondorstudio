import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Facebook,
  Instagram,
  Linkedin,
  MapPin,
  Megaphone,
  Music,
} from "lucide-react";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { Button } from "@/components/ui/button.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { useActiveClient } from "@/hooks/useActiveClient.js";
import ReportsIntro from "@/components/reports/ReportsIntro.jsx";
import ConnectDataSourceDialog from "@/components/reports/ConnectDataSourceDialog.jsx";
import MetricCatalogPanel from "@/components/reports/MetricCatalogPanel.jsx";

const DATA_SOURCES = [
  {
    key: "META_ADS",
    label: "Meta Ads",
    description: "Campanhas e anuncios",
    icon: Megaphone,
  },
  {
    key: "GOOGLE_ADS",
    label: "Google Ads",
    description: "Campanhas e conversoes",
    icon: Megaphone,
  },
  {
    key: "TIKTOK_ADS",
    label: "TikTok Ads",
    description: "Campanhas TikTok",
    icon: Music,
  },
  {
    key: "LINKEDIN_ADS",
    label: "LinkedIn Ads",
    description: "Campanhas B2B",
    icon: Linkedin,
  },
  {
    key: "GA4",
    label: "GA4",
    description: "Analytics do site",
    icon: BarChart3,
  },
  {
    key: "GBP",
    label: "Google Business Profile",
    description: "Visibilidade local",
    icon: MapPin,
  },
  {
    key: "META_SOCIAL",
    label: "Meta Social",
    description: "Paginas e Instagram",
    icon: Instagram,
  },
];

export default function ReportsHome() {
  const navigate = useNavigate();
  const [activeClientId, setActiveClientId] = useActiveClient();
  const [selectedBrandId, setSelectedBrandId] = useState(activeClientId || "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultSource, setDefaultSource] = useState("META_ADS");

  useEffect(() => {
    if (!selectedBrandId && activeClientId) {
      setSelectedBrandId(activeClientId);
    }
  }, [activeClientId, selectedBrandId]);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const { data: connectionsData, isLoading: connectionsLoading } = useQuery({
    queryKey: ["reporting-connections", selectedBrandId],
    queryFn: () =>
      base44.jsonFetch(`/reporting/brands/${selectedBrandId}/connections`, {
        method: "GET",
      }),
    enabled: Boolean(selectedBrandId),
  });

  const connections = useMemo(
    () => connectionsData?.items || [],
    [connectionsData]
  );

  const connectionsBySource = useMemo(() => {
    return connections.reduce((acc, connection) => {
      const key = connection.source;
      if (!acc[key]) acc[key] = [];
      acc[key].push(connection);
      return acc;
    }, {});
  }, [connections]);

  const openDialog = (sourceKey) => {
    setDefaultSource(sourceKey);
    setDialogOpen(true);
  };

  return (
    <PageShell>
      <div className="space-y-8">
        <ReportsIntro />
        <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">
                Relatorios por marca e grupo
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Crie um relatorio a partir dos templates configurados.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate("/reports/new")}>
                Criar relatorio
              </Button>
              <Button variant="ghost" onClick={() => navigate("/reports/templates")}>
                Ver templates
              </Button>
            </div>
          </div>
        </section>
        <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">
                Conexoes por marca
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Vincule contas das fontes para desbloquear widgets.
              </p>
            </div>
            <div className="min-w-[220px]">
              <SelectNative
                value={selectedBrandId}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedBrandId(value);
                  setActiveClientId(value);
                }}
              >
                <option value="">
                  {clients.length ? "Selecione a marca" : "Sem marcas"}
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </SelectNative>
            </div>
          </div>

          {!selectedBrandId ? (
            <div className="mt-6">
              <EmptyState
                icon={Facebook}
                title="Selecione uma marca"
                description="Escolha uma marca para visualizar ou associar contas."
                action={
                  <Button variant="secondary" onClick={() => navigate("/clients")}>
                    Ver clientes
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {DATA_SOURCES.map((source) => {
                const Icon = source.icon;
                const items = connectionsBySource[source.key] || [];
                return (
                  <div
                    key={source.key}
                    className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--surface-muted)]">
                          <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">
                            {source.label}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {source.description}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDialog(source.key)}
                      >
                        Associar
                      </Button>
                    </div>

                    <div className="mt-4 text-sm text-[var(--text-muted)]">
                      {connectionsLoading ? (
                        "Carregando conexoes..."
                      ) : items.length ? (
                        <div className="space-y-1">
                          {items.slice(0, 3).map((item) => (
                            <div key={item.id} className="text-[var(--text)]">
                              {item.displayName}
                            </div>
                          ))}
                          {items.length > 3 ? (
                            <div className="text-xs text-[var(--text-muted)]">
                              +{items.length - 3} outras contas
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        "Sem conta associada"
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <MetricCatalogPanel />

        <EmptyState
          icon={BarChart3}
          title="Crie seu primeiro relatorio"
          description="Use o wizard para gerar relatorios por marca ou grupo com os templates existentes."
          action={
            <Button variant="secondary" onClick={() => navigate("/reports/new")}>
              Novo relatorio
            </Button>
          }
        />
      </div>

      <ConnectDataSourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        brandId={selectedBrandId}
        defaultSource={defaultSource}
      />
    </PageShell>
  );
}
