import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import GridLayout, { useContainerWidth } from "react-grid-layout";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageShell from "@/components/ui/page-shell.jsx";
import { Button } from "@/components/ui/button.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { base44 } from "@/apiClient/base44Client";

const COMPARE_OPTIONS = [
  { value: "NONE", label: "Sem comparacao" },
  { value: "PREVIOUS_PERIOD", label: "Periodo anterior" },
  { value: "PREVIOUS_YEAR", label: "Ano anterior" },
  { value: "CUSTOM", label: "Personalizado" },
];

const PIE_COLORS = ["#38bdf8", "#f97316", "#84cc16", "#e879f9", "#facc15"];

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

  const { data: liveData, isFetching, refetch } = useQuery({
    queryKey: [
      "reporting-dashboard-data",
      dashboardId,
      dateFrom,
      dateTo,
      compareMode,
      compareDateFrom,
      compareDateTo,
      globalBrandId,
      globalGroupId,
    ],
    queryFn: () =>
      base44.reporting.queryDashboardData(dashboardId, {
        dateFrom,
        dateTo,
        compareMode,
        compareDateFrom,
        compareDateTo,
        brandId: globalBrandId || undefined,
        groupId: globalGroupId || undefined,
        filters: {
          dateFrom,
          dateTo,
          compareMode,
          compareDateFrom,
          compareDateTo,
          brandId: globalBrandId || undefined,
          groupId: globalGroupId || undefined,
        },
      }),
    enabled: Boolean(dashboardId && dateFrom && dateTo && widgets.length),
  });

  const liveByWidget = useMemo(() => {
    const items = liveData?.widgets || [];
    return items.reduce((acc, item) => {
      if (item?.widgetId) acc[item.widgetId] = item;
      return acc;
    }, {});
  }, [liveData]);

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
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Atualizando..." : "Atualizar dados"}
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
              {isFetching ? "Atualizando indicadores..." : "Dados ao vivo."}
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
            <div ref={containerRef}>
              <GridLayout
                layout={layout}
                cols={12}
                rowHeight={32}
                margin={[16, 16]}
                width={width}
                isDraggable={false}
                isResizable={false}
              >
                {widgets.map((widget) => {
                  const live = liveByWidget[widget.id];
                  const data = live?.data || null;
                  const totals =
                    data && typeof data.totals === "object" ? data.totals : {};
                  const metrics = Array.isArray(widget.metrics)
                    ? widget.metrics
                    : [];
                  const primaryMetric = metrics[0] || null;
                  const primaryValue =
                    primaryMetric && totals
                      ? totals[primaryMetric]
                      : null;
                  const series = Array.isArray(data?.series) ? data.series : [];
                  const primarySeries = series[0];
                  const seriesData = primarySeries?.data
                    ? primarySeries.data.map((point) => ({
                        name: point.x,
                        value: point.y,
                      }))
                    : [];
                  const pieData = metrics.length
                    ? metrics.map((metric) => ({
                        name: metric,
                        value: totals[metric] || 0,
                      }))
                    : Object.entries(totals || {}).map(([key, value]) => ({
                        name: key,
                        value,
                      }));

                  return (
                    <div
                      key={widget.id}
                      className="rounded-[12px] border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-sm)]"
                    >
                      <p className="text-xs text-[var(--text-muted)]">
                        {widget.widgetType || "Widget"}
                      </p>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {widget.title || "Widget"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {widget.source || "Fonte"}{" "}
                        {widget.level ? `- ${widget.level}` : ""}
                      </p>
                      {live?.error ? (
                        <div className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          {live.error}
                        </div>
                      ) : data ? (
                        <div className="mt-3">
                          {widget.widgetType === "KPI" ? (
                            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                              <p className="text-xs text-[var(--text-muted)]">
                                {primaryMetric || "Metricas"}
                              </p>
                              <p className="text-lg font-semibold text-[var(--text)]">
                                {typeof primaryValue === "number"
                                  ? primaryValue.toLocaleString("pt-BR")
                                  : primaryMetric
                                  ? "-"
                                  : `${Object.keys(totals).length} metricas`}
                              </p>
                            </div>
                          ) : null}
                          {widget.widgetType === "LINE" ? (
                            <div className="h-40">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={seriesData}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                  <YAxis tick={{ fontSize: 10 }} />
                                  <Tooltip />
                                  <Line
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#0ea5e9"
                                    strokeWidth={2}
                                    dot={false}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : null}
                          {widget.widgetType === "BAR" ? (
                            <div className="h-40">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={seriesData}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                  <YAxis tick={{ fontSize: 10 }} />
                                  <Tooltip />
                                  <Bar dataKey="value" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : null}
                          {widget.widgetType === "PIE" ? (
                            <div className="h-40">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={pieData}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={30}
                                    outerRadius={60}
                                  >
                                    {pieData.map((entry, index) => (
                                      <Cell
                                        key={`${entry.name}-${index}`}
                                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                                      />
                                    ))}
                                  </Pie>
                                  <Tooltip />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          ) : null}
                          {widget.widgetType === "TABLE" ? (
                            <div className="mt-2 max-h-40 overflow-auto rounded-[10px] border border-[var(--border)]">
                              <table className="w-full text-xs">
                                <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                                  <tr>
                                    <th className="px-3 py-2 text-left">Metrica</th>
                                    <th className="px-3 py-2 text-right">Valor</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(metrics.length ? metrics : Object.keys(totals)).map(
                                    (metric) => (
                                      <tr key={metric} className="border-t border-[var(--border)]">
                                        <td className="px-3 py-2 text-[var(--text)]">
                                          {metric}
                                        </td>
                                        <td className="px-3 py-2 text-right text-[var(--text)]">
                                          {typeof totals[metric] === "number"
                                            ? totals[metric].toLocaleString("pt-BR")
                                            : "-"}
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                          {widget.widgetType === "TEXT" ? (
                            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
                              {widget.options?.text || "Sem conteudo"}
                            </div>
                          ) : null}
                          {widget.widgetType === "IMAGE" ? (
                            <div className="mt-2 flex items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2">
                              {widget.options?.imageUrl ? (
                                <img
                                  src={widget.options.imageUrl}
                                  alt={widget.title || "Imagem"}
                                  className="max-h-32 w-auto rounded-[8px] object-contain"
                                />
                              ) : (
                                <span className="text-xs text-[var(--text-muted)]">
                                  Sem imagem
                                </span>
                              )}
                            </div>
                          ) : null}
                          {!seriesData.length &&
                          widget.widgetType !== "KPI" &&
                          widget.widgetType !== "TEXT" &&
                          widget.widgetType !== "IMAGE" &&
                          widget.widgetType !== "TABLE" ? (
                            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
                              Sem dados para renderizar
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
                          Sem dados carregados
                        </div>
                      )}
                    </div>
                  );
                })}
              </GridLayout>
            </div>
          </section>
        ) : (
          <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 text-sm text-[var(--text-muted)]">
            Nenhum widget configurado neste dashboard.
          </section>
        )}
      </div>
    </PageShell>
  );
}
