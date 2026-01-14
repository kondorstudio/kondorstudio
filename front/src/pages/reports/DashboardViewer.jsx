import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContainerWidth } from "react-grid-layout";
import PageShell from "@/components/ui/page-shell.jsx";
import { Button } from "@/components/ui/button.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { base44 } from "@/apiClient/base44Client";
import ConnectDataSourceDialog from "@/components/reports/ConnectDataSourceDialog.jsx";
import DashboardCanvas from "@/components/reports/widgets/DashboardCanvas.jsx";
import WidgetCard from "@/components/reports/widgets/WidgetCard.jsx";
import WidgetRenderer from "@/components/reports/widgets/WidgetRenderer.jsx";

const COMPARE_OPTIONS = [
  { value: "NONE", label: "Sem comparacao" },
  { value: "PREVIOUS_PERIOD", label: "Periodo anterior" },
  { value: "PREVIOUS_YEAR", label: "Ano anterior" },
  { value: "CUSTOM", label: "Personalizado" },
];

function toDateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildLayout(widgets, layoutSchema) {
  if (Array.isArray(layoutSchema) && layoutSchema.length) return layoutSchema;
  if (!Array.isArray(widgets)) return [];
  return widgets.map((widget, index) => ({
    i: widget.id || `w-${index + 1}`,
    x: (index * 4) % 12,
    y: Math.floor(index / 3) * 4,
    w: 4,
    h: 4,
  }));
}

export default function DashboardViewer() {
  const { dashboardId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { width, containerRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 960,
  });

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["reporting-dashboard", dashboardId],
    queryFn: () => base44.reporting.getDashboard(dashboardId),
  });

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compareMode, setCompareMode] = useState("NONE");
  const [compareDateFrom, setCompareDateFrom] = useState("");
  const [compareDateTo, setCompareDateTo] = useState("");
  const [globalBrandId, setGlobalBrandId] = useState("");
  const [globalGroupId, setGlobalGroupId] = useState("");
  const [connectDialog, setConnectDialog] = useState({
    open: false,
    brandId: "",
    source: "META_ADS",
  });

  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["reporting-brand-groups"],
    queryFn: () => base44.reporting.listBrandGroups(),
  });

  const { data: groupMembersData } = useQuery({
    queryKey: ["reporting-brand-group-members", dashboard?.groupId],
    queryFn: () => base44.reporting.listBrandGroupMembers(dashboard.groupId),
    enabled: Boolean(dashboard?.groupId),
  });

  const clients = clientsData || [];
  const groups = groupsData?.items || [];
  const groupMembers = groupMembersData?.items || [];
  const groupBrands = useMemo(
    () => groupMembers.map((member) => member.brand).filter(Boolean),
    [groupMembers]
  );

  useEffect(() => {
    if (!dashboard) return;
    const filters = dashboard.globalFiltersSchema || {};
    if (!dateFrom && filters.dateFrom) setDateFrom(filters.dateFrom);
    if (!dateTo && filters.dateTo) setDateTo(filters.dateTo);
    if (!dateFrom && !filters.dateFrom) {
      const today = new Date();
      const from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      setDateFrom(toDateKey(from));
      setDateTo(toDateKey(today));
    }
    setCompareMode(filters.compareMode || "NONE");
    setCompareDateFrom(filters.compareDateFrom || "");
    setCompareDateTo(filters.compareDateTo || "");
    if (dashboard.scope === "BRAND") {
      setGlobalBrandId(dashboard.brandId || "");
      setGlobalGroupId("");
    } else if (dashboard.scope === "GROUP") {
      setGlobalBrandId(filters.brandId || "");
      setGlobalGroupId(dashboard.groupId || "");
    } else {
      setGlobalBrandId(filters.brandId || "");
      setGlobalGroupId(filters.groupId || "");
    }
  }, [dashboard, dateFrom, dateTo]);

  const widgets = useMemo(
    () => (dashboard?.widgetsSchema || []).map((w) => ({ ...w })),
    [dashboard]
  );
  const layout = useMemo(
    () => buildLayout(widgets, dashboard?.layoutSchema || []),
    [widgets, dashboard]
  );

  const brandIds = useMemo(() => {
    const ids = new Set();
    widgets.forEach((widget) => {
      const inheritBrand = widget?.inheritBrand !== false;
      const brand = inheritBrand ? globalBrandId : widget?.brandId;
      if (brand) ids.add(brand);
    });
    return Array.from(ids);
  }, [widgets, globalBrandId]);

  const connectionsQueries = useQueries({
    queries: brandIds.map((brandId) => ({
      queryKey: ["reporting-connections", brandId],
      queryFn: () => base44.reporting.listConnectionsByBrand(brandId),
      enabled: Boolean(brandId),
    })),
  });

  const connectionsByBrand = useMemo(() => {
    const map = new Map();
    brandIds.forEach((brandId, index) => {
      const items = connectionsQueries[index]?.data?.items || [];
      map.set(brandId, items);
    });
    return map;
  }, [brandIds, connectionsQueries]);

  const handleConnect = (brandId, source) => {
    if (!brandId || !source) return;
    setConnectDialog({ open: true, brandId, source });
  };

  if (isLoading) {
    return (
      <PageShell>
        <div className="h-48 rounded-[18px] border border-[var(--border)] bg-white/70 animate-pulse" />
      </PageShell>
    );
  }

  if (!dashboard) {
    return (
      <PageShell>
        <div className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 text-center">
          Dashboard nao encontrado.
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Dashboard ao vivo
            </p>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              {dashboard.name}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => navigate("/reports/dashboards")}>
              Voltar
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate(`/reports/dashboards/${dashboardId}/edit`)}
            >
              Editar
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["widgetData"] })
              }
            >
              Atualizar dados
            </Button>
          </div>
        </div>

        <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-5 shadow-[var(--shadow-sm)]">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-[var(--text-muted)]">Periodo inicial</p>
              <DateField value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Periodo final</p>
              <DateField value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Comparacao</p>
              <SelectNative
                value={compareMode}
                onChange={(event) => setCompareMode(event.target.value)}
              >
                {COMPARE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectNative>
            </div>
            <div className="flex items-end text-xs text-[var(--text-muted)]">
              Dados ao vivo.
            </div>
          </div>
          {compareMode === "CUSTOM" ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Comparar de</p>
                <DateField
                  value={compareDateFrom}
                  onChange={(event) => setCompareDateFrom(event.target.value)}
                />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Comparar ate</p>
                <DateField
                  value={compareDateTo}
                  onChange={(event) => setCompareDateTo(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dashboard.scope === "BRAND" ? (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Marca</p>
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
                  {clients.find((client) => client.id === dashboard.brandId)?.name ||
                    "Marca definida"}
                </div>
              </div>
            ) : null}
            {dashboard.scope === "GROUP" ? (
              <>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Grupo</p>
                  <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
                    {groups.find((group) => group.id === dashboard.groupId)?.name ||
                      "Grupo definido"}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Marca global</p>
                  <SelectNative
                    value={globalBrandId}
                    onChange={(event) => setGlobalBrandId(event.target.value)}
                  >
                    <option value="">Sem marca</option>
                    {groupBrands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </SelectNative>
                </div>
              </>
            ) : null}
            {dashboard.scope === "TENANT" ? (
              <>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Marca global</p>
                  <SelectNative
                    value={globalBrandId}
                    onChange={(event) => {
                      setGlobalBrandId(event.target.value);
                      if (event.target.value) setGlobalGroupId("");
                    }}
                  >
                    <option value="">Sem marca</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </SelectNative>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Grupo global</p>
                  <SelectNative
                    value={globalGroupId}
                    onChange={(event) => {
                      setGlobalGroupId(event.target.value);
                      if (event.target.value) setGlobalBrandId("");
                    }}
                  >
                    <option value="">Sem grupo</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </SelectNative>
                </div>
              </>
            ) : null}
          </div>
        </section>

        {widgets.length ? (
          <section className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
            <DashboardCanvas
              layout={layout}
              items={widgets}
              width={width}
              containerRef={containerRef}
              onLayoutChange={() => {}}
              isEditable={false}
              renderItem={(widget) => {
                const inheritBrand = widget?.inheritBrand !== false;
                const brandId = inheritBrand ? globalBrandId : widget?.brandId;
                const connections = brandId
                  ? connectionsByBrand.get(brandId) || []
                  : [];
                const connection =
                  widget?.connectionId ||
                  connections.find((item) => item.source === widget?.source)?.id ||
                  "";
                const connectHandler =
                  brandId && widget?.source
                    ? () => handleConnect(brandId, widget?.source)
                    : null;

                return (
                  <WidgetCard widget={widget} showActions={false}>
                    <WidgetRenderer
                      widget={widget}
                      connectionId={connection}
                      filters={{
                        dateFrom,
                        dateTo,
                        compareMode,
                        compareDateFrom,
                        compareDateTo,
                      }}
                      onConnect={connectHandler}
                    />
                  </WidgetCard>
                );
              }}
            />
          </section>
        ) : (
          <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 text-sm text-[var(--text-muted)]">
            Nenhum widget configurado neste dashboard.
          </section>
        )}
      </div>

      <ConnectDataSourceDialog
        open={connectDialog.open}
        onOpenChange={(open) => setConnectDialog((prev) => ({ ...prev, open }))}
        brandId={connectDialog.brandId}
        defaultSource={connectDialog.source}
      />
    </PageShell>
  );
}
