import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContainerWidth } from "react-grid-layout";
import PageShell from "@/components/ui/page-shell.jsx";
import { Button } from "@/components/ui/button.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { Input } from "@/components/ui/input.jsx";
import { base44 } from "@/apiClient/base44Client";
import ConnectDataSourceDialog from "@/components/reports/ConnectDataSourceDialog.jsx";
import DashboardCanvas from "@/components/reports/widgets/DashboardCanvas.jsx";
import WidgetCard from "@/components/reports/widgets/WidgetCard.jsx";
import WidgetRenderer from "@/components/reports/widgets/WidgetRenderer.jsx";
import { pickConnectionId } from "@/components/reports/utils/connectionResolver.js";
import { formatTimeAgo } from "@/utils/timeAgo.js";

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

function formatRangeLabel(dateFrom, dateTo) {
  if (dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
  if (dateFrom) return `Desde ${dateFrom}`;
  if (dateTo) return `Ate ${dateTo}`;
  return "Sem periodo";
}

function formatFilterValues(values) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) return "";
  if (list.length <= 2) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
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

function useDebouncedValue(value, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debouncedValue;
}

function normalizeFilterValues(values) {
  if (!values) return [];
  const list = Array.isArray(values) ? values : String(values).split(",");
  const normalized = list
    .map((value) => String(value).trim())
    .filter(Boolean);
  return Array.from(new Set(normalized)).sort();
}

function normalizeDimensionFilters(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((filter) => {
      if (!filter || typeof filter !== "object") return null;
      return {
        id: filter.id || `filter-${Math.random().toString(36).slice(2, 8)}`,
        label: filter.label || "",
        source: filter.source || "",
        level: filter.level || "",
        key: filter.key || filter.dimension || filter.field || "",
        operator: String(filter.operator || "IN").toUpperCase(),
        values: normalizeFilterValues(filter.values || filter.value),
      };
    })
    .filter(Boolean);
}

function buildFilterChips({
  dashboard,
  dateFrom,
  dateTo,
  compareMode,
  globalBrandId,
  globalGroupId,
  groups,
  clients,
  dimensionFilters,
}) {
  const chips = [];

  if (dashboard?.scope === "BRAND") {
    const brandName = clients.find((client) => client.id === dashboard.brandId)?.name;
    chips.push({ label: "Marca", value: brandName || "Definida" });
  }

  if (dashboard?.scope === "GROUP") {
    const groupName = groups.find((group) => group.id === dashboard.groupId)?.name;
    if (groupName) chips.push({ label: "Grupo", value: groupName });
    if (globalBrandId) {
      const brandName = clients.find((client) => client.id === globalBrandId)?.name;
      chips.push({ label: "Marca global", value: brandName || "Selecionada" });
    }
  }

  if (dashboard?.scope === "TENANT") {
    if (globalBrandId) {
      const brandName = clients.find((client) => client.id === globalBrandId)?.name;
      chips.push({ label: "Marca global", value: brandName || "Selecionada" });
    }
    if (globalGroupId) {
      const groupName = groups.find((group) => group.id === globalGroupId)?.name;
      chips.push({ label: "Grupo global", value: groupName || "Selecionado" });
    }
  }

  chips.push({
    label: "Periodo",
    value: formatRangeLabel(dateFrom, dateTo),
  });

  if (compareMode && compareMode !== "NONE") {
    chips.push({
      label: "Comparacao",
      value:
        compareMode === "PREVIOUS_PERIOD"
          ? "Periodo anterior"
          : compareMode === "PREVIOUS_YEAR"
            ? "Ano anterior"
            : "Personalizado",
    });
  }

  dimensionFilters.forEach((filter) => {
    const value = formatFilterValues(filter.values);
    if (!filter.key && !filter.label) return;
    chips.push({
      label: filter.label || filter.key || "Filtro",
      value: value || (filter.operator === "NOT_IN" ? "Excluido" : "Incluido"),
      muted: filter.operator === "NOT_IN",
      meta: [filter.source, filter.level].filter(Boolean).join(" / "),
    });
  });

  return chips;
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
  const [dimensionFilters, setDimensionFilters] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshOption, setAutoRefreshOption] = useState("OFF");
  const [lastDashboardUpdatedAt, setLastDashboardUpdatedAt] = useState(null);
  const [tvMode, setTvMode] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [widgetStatusMap, setWidgetStatusMap] = useState({});
  const [connectDialog, setConnectDialog] = useState({
    open: false,
    brandId: "",
    source: "META_ADS",
  });
  const debouncedDimensionFilters = useDebouncedValue(dimensionFilters);

  const { data: meData } = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const allowedBrandIds = useMemo(() => {
    const ids = meData?.reportingScope?.allowedBrandIds;
    return Array.isArray(ids) ? ids.map(String) : null;
  }, [meData]);

  const isClientScoped = Array.isArray(allowedBrandIds);
  const allowedBrandSet = useMemo(
    () => (isClientScoped ? new Set(allowedBrandIds) : null),
    [isClientScoped, allowedBrandIds]
  );

  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["reporting-brand-groups"],
    queryFn: () => base44.reporting.listBrandGroups(),
    enabled: !isClientScoped,
  });

  const { data: groupMembersData } = useQuery({
    queryKey: ["reporting-brand-group-members", dashboard?.groupId],
    queryFn: () => base44.reporting.listBrandGroupMembers(dashboard.groupId),
    enabled: Boolean(dashboard?.groupId) && !isClientScoped,
  });

  const clients = clientsData || [];
  const groups = groupsData?.items || [];
  const groupMembers = groupMembersData?.items || [];
  const groupBrands = useMemo(
    () => groupMembers.map((member) => member.brand).filter(Boolean),
    [groupMembers]
  );
  const scopedClients = useMemo(() => {
    if (!isClientScoped) return clients;
    if (!allowedBrandSet || !allowedBrandSet.size) return [];
    return clients.filter((client) => allowedBrandSet.has(String(client.id)));
  }, [clients, isClientScoped, allowedBrandSet]);
  const selectableGroupBrands = useMemo(() => {
    if (isClientScoped) return scopedClients;
    return groupBrands;
  }, [isClientScoped, scopedClients, groupBrands]);

  const filterChips = useMemo(
    () =>
      buildFilterChips({
        dashboard,
        dateFrom,
        dateTo,
        compareMode,
        globalBrandId,
        globalGroupId,
        groups,
        clients: scopedClients.length ? scopedClients : clients,
        dimensionFilters,
      }),
    [
      dashboard,
      dateFrom,
      dateTo,
      compareMode,
      globalBrandId,
      globalGroupId,
      groups,
      scopedClients,
      clients,
      dimensionFilters,
    ]
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
    setDimensionFilters(normalizeDimensionFilters(filters.dimensionFilters || []));
  }, [dashboard, dateFrom, dateTo]);

  useEffect(() => {
    if (!isClientScoped) return;
    if (!scopedClients.length) return;
    const allowedIds = new Set(scopedClients.map((client) => String(client.id)));
    if (!globalBrandId || !allowedIds.has(String(globalBrandId))) {
      setGlobalBrandId(scopedClients[0].id);
    }
  }, [isClientScoped, scopedClients, globalBrandId]);

  useEffect(() => {
    if (dashboard?.scope !== "GROUP") return;
    if (globalBrandId) return;
    if (!groupBrands.length) return;
    setGlobalBrandId(groupBrands[0].id);
  }, [dashboard?.scope, globalBrandId, groupBrands]);

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
      const items = (connectionsQueries[index]?.data?.items || []).filter(
        (item) => item.status === "CONNECTED"
      );
      map.set(brandId, items);
    });
    return map;
  }, [brandIds, connectionsQueries]);

  const lastUpdatedLabel = useMemo(
    () => (lastDashboardUpdatedAt ? formatTimeAgo(lastDashboardUpdatedAt) : ""),
    [lastDashboardUpdatedAt]
  );
  const needsGlobalBrand = useMemo(() => {
    if (!dashboard) return false;
    if (dashboard.scope === "BRAND") return false;
    if (dashboard.scope === "GROUP") return !globalBrandId;
    return !globalBrandId;
  }, [dashboard, globalBrandId]);
  const showAdvanced = showAdvancedFilters || needsGlobalBrand;
  const canToggleAdvanced = !needsGlobalBrand;

  const handleConnect = (brandId, source) => {
    if (!brandId || !source) return;
    setConnectDialog({ open: true, brandId, source });
  };

  const handleStatusChange = useCallback((widgetId, nextStatus) => {
    if (!widgetId) return;
    setWidgetStatusMap((prev) => {
      if (prev[widgetId] === nextStatus) return prev;
      return { ...prev, [widgetId]: nextStatus };
    });
    if (nextStatus === "LIVE") {
      setLastDashboardUpdatedAt(Date.now());
    }
  }, []);

  const autoRefreshMs = useMemo(() => {
    if (autoRefreshOption === "5m") return 5 * 60 * 1000;
    if (autoRefreshOption === "15m") return 15 * 60 * 1000;
    return 0;
  }, [autoRefreshOption]);

  const handleRefreshAll = useCallback(async () => {
    if (!widgets.length || isRefreshing) return;
    const widgetIds = new Set(widgets.map((widget) => String(widget.id)));
    const predicate = (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key[0] !== "widgetData") return false;
      return widgetIds.has(String(key[1] || ""));
    };

    try {
      setIsRefreshing(true);
      queryClient.invalidateQueries({ predicate });
      await queryClient.refetchQueries({ predicate, type: "active" });
      setLastDashboardUpdatedAt(Date.now());
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, queryClient, widgets]);

  useEffect(() => {
    if (!autoRefreshMs) return;
    const interval = setInterval(() => {
      handleRefreshAll();
    }, autoRefreshMs);
    return () => clearInterval(interval);
  }, [autoRefreshMs, handleRefreshAll]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("tv-mode", tvMode);
    return () => {
      document.body.classList.remove("tv-mode");
    };
  }, [tvMode]);

  useEffect(() => {
    if (!tvMode) return;
    if (typeof document === "undefined") return;
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setTvMode(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    if (document.documentElement?.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [tvMode]);

  if (isLoading) {
    return (
      <PageShell className="reporting-surface">
        <div className="h-48 rounded-[18px] border border-[var(--border)] bg-white/70 animate-pulse" />
      </PageShell>
    );
  }

  if (!dashboard) {
    return (
      <PageShell className="reporting-surface">
        <div className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 text-center">
          Dashboard nao encontrado.
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="reporting-surface">
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
                variant={tvMode ? "secondary" : "ghost"}
                onClick={() => setTvMode((prev) => !prev)}
              >
                {tvMode ? "Sair do modo TV" : "Modo TV"}
              </Button>
              {!tvMode ? (
                <div className="min-w-[150px]">
                  <SelectNative
                    value={autoRefreshOption}
                    onChange={(event) => setAutoRefreshOption(event.target.value)}
                  >
                    <option value="OFF">Auto-refresh: OFF</option>
                    <option value="5m">Auto-refresh: 5m</option>
                    <option value="15m">Auto-refresh: 15m</option>
                  </SelectNative>
                </div>
              ) : null}
              <Button
                variant="secondary"
                onClick={handleRefreshAll}
                disabled={isRefreshing || !widgets.length}
              >
                {isRefreshing ? "Atualizando..." : "Atualizar dados"}
              </Button>
              {lastUpdatedLabel && !tvMode ? (
                <span className="text-xs text-[var(--text-muted)]">{lastUpdatedLabel}</span>
              ) : null}
            </div>
          </div>

        {tvMode ? (
          <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-5 shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Modo TV
                </p>
                <p className="text-lg font-semibold text-[var(--text)]">{dashboard.name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {lastUpdatedLabel ? (
                  <span className="text-xs text-[var(--text-muted)]">{lastUpdatedLabel}</span>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleRefreshAll}
                  disabled={isRefreshing || !widgets.length}
                >
                  {isRefreshing ? "Atualizando..." : "Atualizar dados"}
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <div>
                <p className="text-xs text-[var(--text-muted)]">Auto-refresh</p>
                <SelectNative
                  value={autoRefreshOption}
                  onChange={(event) => setAutoRefreshOption(event.target.value)}
                >
                  <option value="OFF">OFF</option>
                  <option value="5m">5 minutos</option>
                  <option value="15m">15 minutos</option>
                </SelectNative>
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
          </section>
        ) : (
          <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-5 shadow-[var(--shadow-sm)]">
            {needsGlobalBrand ? (
              <div className="mb-4 rounded-[12px] border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
                Selecione uma marca global para carregar os dados deste dashboard.
              </div>
            ) : null}
            {filterChips.length ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {filterChips.map((chip, index) => (
                  <div
                    key={`${chip.label}-${index}`}
                    className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text)]"
                  >
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      {chip.label}
                    </span>
                    <span className={chip.muted ? "text-[var(--text-muted)]" : ""}>
                      {chip.value}
                    </span>
                    {chip.meta ? (
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {chip.meta}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-end justify-between gap-3">
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
              <Button
                size="sm"
                variant="secondary"
                disabled={!canToggleAdvanced}
                onClick={() => {
                  if (!canToggleAdvanced) return;
                  setShowAdvancedFilters((prev) => !prev);
                }}
              >
                {showAdvanced ? "Ocultar avancados" : "Filtros avancados"}
              </Button>
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
            {showAdvanced ? (
              <>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {dashboard.scope === "BRAND" ? (
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Marca</p>
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
                        {scopedClients.find((client) => client.id === dashboard.brandId)?.name ||
                          "Marca definida"}
                      </div>
                    </div>
                  ) : null}
                  {dashboard.scope === "GROUP" ? (
                    <>
                      {!isClientScoped ? (
                        <div>
                          <p className="text-xs text-[var(--text-muted)]">Grupo</p>
                          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
                            {groups.find((group) => group.id === dashboard.groupId)?.name ||
                              "Grupo definido"}
                          </div>
                        </div>
                      ) : null}
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">Marca global</p>
                        <SelectNative
                          value={globalBrandId}
                          onChange={(event) => setGlobalBrandId(event.target.value)}
                        >
                          <option value="">Sem marca</option>
                          {selectableGroupBrands.map((brand) => (
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
                          {scopedClients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}
                            </option>
                          ))}
                        </SelectNative>
                      </div>
                      {!isClientScoped ? (
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
                      ) : null}
                    </>
                  ) : null}
                </div>
                {dimensionFilters.length ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {dimensionFilters.map((filter) => (
                      <div key={filter.id}>
                        <p className="text-xs text-[var(--text-muted)]">
                          {filter.label || filter.key || "Filtro"}
                          {filter.operator === "NOT_IN" ? " (excluir)" : ""}
                          {filter.source || filter.level ? (
                            <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                              • {[filter.source, filter.level].filter(Boolean).join(" / ")}
                            </span>
                          ) : null}
                        </p>
                        <Input
                          value={filter.values.join(", ")}
                          onChange={(event) =>
                            setDimensionFilters((prev) =>
                              prev.map((item) =>
                                item.id === filter.id
                                  ? {
                                      ...item,
                                      values: normalizeFilterValues(event.target.value),
                                    }
                                  : item
                              )
                            )
                          }
                          placeholder="Digite valores separados por vírgula"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        )}

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
                const effectiveInheritBrand = inheritBrand && Boolean(globalBrandId);
                const brandId = effectiveInheritBrand ? globalBrandId : widget?.brandId;
                const connections = brandId ? connectionsByBrand.get(brandId) || [] : [];
                const connection = pickConnectionId({
                  connections,
                  source: widget?.source,
                  preferredId: effectiveInheritBrand ? "" : widget?.connectionId,
                });
                const connectHandler =
                  brandId && widget?.source
                    ? () => handleConnect(brandId, widget?.source)
                    : null;

                return (
                  <WidgetCard
                    widget={widget}
                    showActions={false}
                    status={widgetStatusMap[widget.id]}
                  >
                    <WidgetRenderer
                      widget={widget}
                      connectionId={connection}
                      filters={{
                        dateFrom,
                        dateTo,
                        compareMode,
                        compareDateFrom,
                        compareDateTo,
                        dimensionFilters: debouncedDimensionFilters,
                      }}
                      onConnect={connectHandler}
                      onStatusChange={(nextStatus) =>
                        handleStatusChange(widget.id, nextStatus)
                      }
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
