import React, { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { base44 } from "@/apiClient/base44Client";
import { createRequestQueue } from "@/utils/requestQueue.js";
import { formatNumber } from "@/utils/formatNumber.js";
import { formatTimeAgo } from "@/utils/timeAgo.js";
import WidgetEmptyState from "./WidgetEmptyState.jsx";
import WidgetErrorState from "./WidgetErrorState.jsx";
import WidgetSkeleton from "./WidgetSkeleton.jsx";
import { buildWidgetQueryKey } from "./widgetQueryKey.js";

const widgetRequestQueue = createRequestQueue({ concurrency: 5 });

const CHART_COLORS = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#ef4444"];
const CONNECT_ERROR_CODES = new Set([
  "GA4_INTEGRATION_NOT_CONNECTED",
  "GA4_NOT_CONNECTED",
  "GA4_REAUTH_REQUIRED",
  "CONNECTION_NOT_CONNECTED",
]);

function isConnectError(err) {
  if (!err) return false;
  const code = err?.data?.code || err?.code || null;
  if (code && CONNECT_ERROR_CODES.has(code)) return true;
  const message = String(err?.data?.error || err?.message || "").toLowerCase();
  return (
    (message.includes("ga4") && message.includes("conectad")) ||
    message.includes("conexao nao esta connected") ||
    message.includes("connection not connected") ||
    message.includes("integration not connected")
  );
}

function normalizeSeries(series, metrics) {
  if (!Array.isArray(series) || !series.length) return [];
  if (series[0]?.x !== undefined && series[0]?.y !== undefined) {
    return [
      {
        name: metrics?.[0] || "Serie 1",
        data: series,
      },
    ];
  }

  return series.map((item, index) => ({
    name: item.name || item.metric || metrics?.[index] || `Serie ${index + 1}`,
    data: Array.isArray(item.data) ? item.data : [],
  }));
}

function buildChartData(seriesList) {
  const map = new Map();
  seriesList.forEach((serie) => {
    serie.data.forEach((point) => {
      const x = point?.x ?? point?.name ?? point?.label;
      if (x === undefined || x === null) return;
      const entry = map.get(x) || { x };
      entry[serie.name] = Number(point.y ?? point.value ?? 0);
      map.set(x, entry);
    });
  });
  return Array.from(map.values()).sort((a, b) =>
    String(a.x).localeCompare(String(b.x))
  );
}

function normalizeTableData(table) {
  if (!table) return { columns: [], rows: [] };
  if (Array.isArray(table.rows)) return table;
  if (Array.isArray(table)) {
    if (!table.length) return { columns: [], rows: [] };
    const columns = Object.keys(table[0] || {}).map((key) => ({
      key,
      label: key,
    }));
    return { columns, rows: table };
  }
  return { columns: [], rows: [] };
}

function buildPieFromTotals(totals, metrics) {
  const entries =
    metrics && metrics.length
      ? metrics.map((metric) => [metric, totals?.[metric]])
      : Object.entries(totals || {});
  return entries
    .map(([name, value]) => ({
      name,
      value: typeof value === "number" ? value : Number(value) || 0,
    }))
    .filter((entry) => entry.value !== 0);
}

function formatValue(value, meta) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "number") {
    return formatNumber(value, { currency: meta?.currency });
  }
  return String(value);
}

function getCompareLabel(compareMode) {
  if (!compareMode || compareMode === "NONE") return "";
  if (compareMode === "PREVIOUS_PERIOD") return "Comparando com periodo anterior";
  if (compareMode === "PREVIOUS_YEAR") return "Comparando com ano anterior";
  if (compareMode === "CUSTOM") return "Comparacao personalizada";
  return "Comparacao ativa";
}

function buildErrorMessage(err) {
  if (!err) return "Erro inesperado.";
  const apiDetails = err?.data?.details || null;
  const violationText =
    Array.isArray(apiDetails?.violations) && apiDetails.violations.length
      ? apiDetails.violations
          .map((item) => [item.field, item.description].filter(Boolean).join(": "))
          .filter(Boolean)
          .join(" | ")
      : "";
  const descriptionParts = [
    err?.data?.error || err?.message || "Erro inesperado.",
    violationText,
  ].filter(Boolean);
  return descriptionParts.join(" ");
}

function normalizeDimensionFilterValues(values) {
  if (!values) return [];
  const list = Array.isArray(values) ? values : String(values).split(",");
  const normalized = list
    .map((value) => String(value).trim())
    .filter(Boolean);
  return Array.from(new Set(normalized)).sort();
}

function normalizeDimensionFilter(filter) {
  if (!filter || typeof filter !== "object") return null;
  const key = String(filter.key || filter.dimension || filter.field || "").trim();
  const operator = String(filter.operator || "IN").toUpperCase();
  const values = normalizeDimensionFilterValues(filter.values || filter.value);
  if (!key || !values.length) return null;
  return {
    ...filter,
    key,
    operator,
    values,
  };
}

function isFilterApplicable(filter, { source, level }) {
  if (!filter) return false;
  const filterSource = filter.source ? String(filter.source) : "";
  const filterLevel = filter.level ? String(filter.level) : "";
  if (filterSource && source && filterSource !== source) return false;
  if (filterLevel && level && filterLevel !== level) return false;
  return true;
}

function mergeDimensionFilters(widgetFilters, globalFilters, context) {
  const merged = [
    ...(Array.isArray(widgetFilters) ? widgetFilters : []),
    ...(Array.isArray(globalFilters) ? globalFilters : []),
  ]
    .map(normalizeDimensionFilter)
    .filter(Boolean)
    .filter((filter) => isFilterApplicable(filter, context));

  const deduped = [];
  const seen = new Set();
  merged.forEach((filter) => {
    const signature = `${filter.key}|${filter.operator}|${filter.values.join(",")}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    deduped.push(filter);
  });
  return deduped;
}

function isAuthError(err) {
  const status = err?.status || err?.data?.status || null;
  if (status === 401 || status === 403) return true;
  const message = String(err?.data?.error || err?.message || "").toLowerCase();
  return message.includes("unauthorized") || message.includes("forbidden");
}

const WidgetRenderer = React.memo(function WidgetRenderer({
  widget,
  filters = {},
  connectionId,
  enableQuery = true,
  forceMock = false,
  dataOverride = null,
  isGenerating = false,
  onConnect,
  onEdit,
  onQuickRange,
  onStatusChange,
  queryKeyPrefix = "widgetData",
  staleTime = 60 * 1000,
  variant = "default",
}) {
  const widgetType = widget?.widgetType || "KPI";
  const source = widget?.source || "";
  const metrics = Array.isArray(widget?.metrics) ? widget.metrics : [];
  const breakdown = widget?.breakdown || null;
  const hasSource = Boolean(source);
  const needsData = widgetType !== "TEXT" && widgetType !== "IMAGE";
  const hasMetrics = metrics.length > 0;
  const hasOverride = dataOverride && typeof dataOverride === "object";
  const widgetFilterPayload = useMemo(() => {
    if (widget?.filters && typeof widget.filters === "object") return widget.filters;
    return {};
  }, [widget?.filters]);
  const globalDimensionFilters = useMemo(
    () => (Array.isArray(filters?.dimensionFilters) ? filters.dimensionFilters : []),
    [filters?.dimensionFilters]
  );
  const mergedDimensionFilters = useMemo(
    () =>
      mergeDimensionFilters(widgetFilterPayload.dimensionFilters, globalDimensionFilters, {
        source,
        level: widget?.level,
      }),
    [widgetFilterPayload, globalDimensionFilters, source, widget?.level]
  );
  const queryFilters = useMemo(() => {
    const base = { ...widgetFilterPayload };
    if (mergedDimensionFilters.length) {
      base.dimensionFilters = mergedDimensionFilters;
    } else if (Object.prototype.hasOwnProperty.call(base, "dimensionFilters")) {
      delete base.dimensionFilters;
    }
    return base;
  }, [widgetFilterPayload, mergedDimensionFilters]);
  const filtersForKey = useMemo(
    () => ({
      ...filters,
      dimensionFilters: mergedDimensionFilters,
    }),
    [filters, mergedDimensionFilters]
  );
  const canFetch =
    enableQuery &&
    hasSource &&
    needsData &&
    hasMetrics &&
    (Boolean(connectionId) || forceMock) &&
    !isGenerating &&
    !hasOverride;
  const queryKey = useMemo(
    () =>
      buildWidgetQueryKey({
        connectionId: connectionId || "",
        widget,
        filters: filtersForKey,
        forceMock,
        prefix: queryKeyPrefix,
      }),
    [
      connectionId,
      widget?.id,
      widget?.source,
      widget?.level,
      widget?.breakdown,
      widget?.widgetType,
      widget?.metrics,
      widgetFilterPayload,
      filtersForKey?.dateFrom,
      filtersForKey?.dateTo,
      filtersForKey?.compareMode,
      filtersForKey?.compareDateFrom,
      filtersForKey?.compareDateTo,
      filtersForKey?.dimensionFilters,
      forceMock,
      queryKeyPrefix,
    ]
  );

  const {
    data,
    dataUpdatedAt,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () =>
      widgetRequestQueue.add(() =>
        base44.reporting.queryMetrics({
          source,
          connectionId,
          dateFrom: filters?.dateFrom,
          dateTo: filters?.dateTo,
          compareMode: filters?.compareMode,
          compareDateFrom: filters?.compareDateFrom,
          compareDateTo: filters?.compareDateTo,
          level: widget?.level,
          breakdown,
          metrics,
          filters: queryFilters,
          options: widget?.options || {},
          widgetType,
          forceMock,
        })
      ),
    enabled: canFetch,
    staleTime,
    keepPreviousData: true,
  });

  const isMini = variant === "mini";
  const [lastSuccessAt, setLastSuccessAt] = React.useState(null);
  const [now, setNow] = React.useState(Date.now());
  const resolvedData = hasOverride ? dataOverride : data;
  const totals =
    resolvedData?.totals && typeof resolvedData.totals === "object"
      ? resolvedData.totals
      : {};
  const seriesList = normalizeSeries(resolvedData?.series || [], metrics);
  const chartData = buildChartData(seriesList);
  const rawPie = Array.isArray(resolvedData?.pie) ? resolvedData.pie : [];
  const pieData = rawPie.length ? rawPie : buildPieFromTotals(totals, metrics);
  const table = normalizeTableData(resolvedData?.table);
  const hasTable = table.rows.length;
  const hasChart = chartData.length;
  const hasTotals = Object.keys(totals || {}).length > 0;
  const meta = resolvedData?.meta || {};
  const metaWithCurrency =
    meta?.currency || widget?.options?.currency
      ? { ...meta, currency: meta.currency || widget?.options?.currency }
      : meta;
  const compareMeta = meta?.compare || null;
  const hasAnyData = hasChart || hasTotals || pieData.length || hasTable;
  const hasDataByType = (() => {
    switch (widgetType) {
      case "KPI":
        return hasTotals;
      case "TABLE":
        return hasTable;
      case "PIE":
        return pieData.length > 0;
      case "LINE":
      case "BAR":
        return hasChart;
      default:
        return hasAnyData;
    }
  })();

  const noConnection =
    needsData &&
    hasSource &&
    hasMetrics &&
    !connectionId &&
    !forceMock &&
    !hasOverride;
  const hasConnectError = isError && isConnectError(error);
  const hasAuthError = isError && isAuthError(error);
  const hasConnectIssue = hasConnectError || hasAuthError;
  const isInitialLoading = canFetch && (isLoading || (isFetching && !resolvedData));
  const isUpdating = canFetch && isFetching && Boolean(resolvedData);
  const noData =
    needsData &&
    resolvedData &&
    !hasDataByType &&
    !isInitialLoading &&
    !hasConnectIssue &&
    !isError;

  const status = useMemo(() => {
    if (!needsData) return "LIVE";
    if (!hasSource || !hasMetrics) return "EMPTY";
    if (noConnection || hasConnectIssue) return "EMPTY";
    if (isError && !hasConnectIssue) return "ERROR";
    if (isInitialLoading) return "LOADING";
    if (noData) return "EMPTY";
    if (isUpdating) return "LOADING";
    if (resolvedData) return "LIVE";
    return "EMPTY";
  }, [
    needsData,
    hasSource,
    hasMetrics,
    noConnection,
    hasConnectIssue,
    isError,
    isInitialLoading,
    noData,
    isUpdating,
    resolvedData,
  ]);

  const statusRef = useRef(null);
  useEffect(() => {
    if (!onStatusChange || !status) return;
    if (statusRef.current === status) return;
    statusRef.current = status;
    onStatusChange(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    if (!dataUpdatedAt) return;
    setLastSuccessAt(dataUpdatedAt);
  }, [dataUpdatedAt]);

  useEffect(() => {
    if (!hasOverride) return;
    setLastSuccessAt(Date.now());
  }, [hasOverride, dataOverride]);

  useEffect(() => {
    if (!lastSuccessAt) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [lastSuccessAt]);

  const updatedLabel = lastSuccessAt ? formatTimeAgo(lastSuccessAt || now) : "";
  const compareLabel = getCompareLabel(filters?.compareMode);
  const showUpdating = isUpdating && Boolean(resolvedData);

  const renderMetaRow = () => {
    if (isMini) return null;
    if (!compareLabel && !updatedLabel && !showUpdating) return null;
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
        {compareLabel ? <span>{compareLabel}</span> : <span />}
        {showUpdating ? (
          <span className="looker-pill looker-pill--accent">Atualizando...</span>
        ) : updatedLabel ? (
          <span>{updatedLabel}</span>
        ) : null}
      </div>
    );
  };

  if (!needsData) {
    if (widgetType === "TEXT") {
      return (
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[13px] text-[var(--text)]">
          {widget?.options?.text || "Sem conteudo"}
        </div>
      );
    }
    return (
      <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[13px] text-[var(--text)]">
        {widget?.options?.imageUrl ? (
          <img
            src={widget.options.imageUrl}
            alt={widget?.title || "Imagem"}
            className="max-h-40 w-full rounded-[10px] object-contain"
          />
        ) : (
          "Sem imagem"
        )}
      </div>
    );
  }

  if (!hasSource) {
    return (
      <WidgetEmptyState
        title="Configure este widget"
        description="Selecione fonte, nivel e metricas."
        actionLabel={onEdit ? "Configurar" : ""}
        onAction={onEdit || undefined}
        variant="metrics"
        className={isMini ? "px-3 py-3" : ""}
      />
    );
  }

  if (!hasMetrics) {
    return (
      <WidgetEmptyState
        title="Selecione metricas"
        description="Adicione pelo menos uma metrica para exibir dados."
        actionLabel={onEdit ? "Configurar" : ""}
        onAction={onEdit || undefined}
        variant="metrics"
        className={isMini ? "px-3 py-3" : ""}
      />
    );
  }

  if (isGenerating && needsData && !hasOverride) {
    return (
      <WidgetSkeleton widgetType={widgetType} variant={variant} />
    );
  }

  if (noConnection || hasConnectIssue) {
    const isForbidden =
      hasAuthError &&
      (error?.status === 403 ||
        error?.data?.status === 403 ||
        String(error?.data?.error || error?.message || "")
          .toLowerCase()
          .includes("acesso negado"));
    const connectionHint = onEdit
      ? "Clique no lapis no canto direito deste widget e selecione uma conta conectada."
      : "Associe uma conta para carregar os dados deste widget.";
    const title = isForbidden ? "Acesso restrito" : "Associe uma conta";
    const description = isForbidden
      ? "Voce nao tem permissao para acessar esta marca ou conexao."
      : connectionHint;
    return (
      <WidgetEmptyState
        title={title}
        description={description}
        actionLabel={onConnect ? "Associar conta" : ""}
        onAction={onConnect || undefined}
        variant="connection"
        className={isMini ? "px-3 py-3" : ""}
      />
    );
  }

  if (isInitialLoading) {
    return (
      <WidgetSkeleton widgetType={widgetType} variant={variant} />
    );
  }

  if (isError && !hasConnectIssue) {
    const errorMessage = buildErrorMessage(error);
    return (
      <WidgetErrorState
        title="Nao foi possivel carregar este widget."
        description={errorMessage}
        onRetry={refetch}
        className={isMini ? "px-3 py-3" : ""}
      />
    );
  }

  if (noData) {
    if (meta?.mocked) {
      return (
        <WidgetEmptyState
          title="Fonte ainda nao disponivel"
          description="Os dados desta fonte ainda nao foram implementados."
          variant="no-data"
          className={isMini ? "px-3 py-3" : ""}
        />
      );
    }
    return (
      <WidgetEmptyState
        title="Nenhum dado neste periodo"
        description="Tente ajustar o intervalo ou filtros."
        actionLabel={onQuickRange ? "Usar ultimos 30 dias" : ""}
        onAction={onQuickRange || undefined}
        variant="no-data"
        className={isMini ? "px-3 py-3" : ""}
      />
    );
  }

  if (widgetType === "KPI") {
    const metricKey = metrics[0] || Object.keys(totals || {})[0] || null;
    const value = metricKey ? totals[metricKey] : null;
    const compareTotals =
      compareMeta && compareMeta.totals && typeof compareMeta.totals === "object"
        ? compareMeta.totals
        : null;
    const compareKey =
      compareTotals && (metricKey || Object.keys(compareTotals || {})[0] || null);
    const compareValue = compareKey ? compareTotals?.[compareKey] : null;
    let delta = null;
    let deltaPct = null;
    if (
      typeof value === "number" &&
      typeof compareValue === "number" &&
      Number.isFinite(compareValue) &&
      compareValue !== 0
    ) {
      delta = value - compareValue;
      deltaPct = (delta / compareValue) * 100;
    }
    return (
      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
        <p className="text-xs text-[var(--text-muted)]">{metricKey || "Metrica"}</p>
        <p className="mt-1 text-2xl font-semibold text-[var(--text)]">
          {formatValue(value, metaWithCurrency)}
        </p>
        {compareValue !== null && compareValue !== undefined ? (
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            <span>
              {compareMeta?.label || "Comparacao"}: {formatValue(compareValue, metaWithCurrency)}
            </span>
            {delta !== null && deltaPct !== null ? (
              <span className="ml-2 font-semibold text-[var(--text)]">
                {delta >= 0 ? "+" : ""}
                {formatValue(delta, metaWithCurrency)} ({deltaPct.toFixed(1)}%)
              </span>
            ) : null}
          </div>
        ) : null}
        {meta?.mocked ? (
          <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Dados simulados
          </p>
        ) : null}
        {renderMetaRow()}
      </div>
    );
  }

  if (widgetType === "LINE") {
    return (
      <div>
        <div className={variant === "mini" ? "h-40" : "h-52"}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              {seriesList.map((serie, index) => (
                <Line
                  key={serie.name}
                  type="monotone"
                  dataKey={serie.name}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {renderMetaRow()}
      </div>
    );
  }

  if (widgetType === "BAR") {
    return (
      <div>
        <div className={variant === "mini" ? "h-40" : "h-52"}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              {seriesList.map((serie, index) => (
                <Bar
                  key={serie.name}
                  dataKey={serie.name}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {renderMetaRow()}
      </div>
    );
  }

  if (widgetType === "PIE") {
    return (
      <div>
        <div className={variant === "mini" ? "h-40" : "h-52"}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={variant === "mini" ? 26 : 36}
                outerRadius={variant === "mini" ? 60 : 80}
              >
                {pieData.map((entry, index) => (
                  <Cell
                    key={`${entry.name}-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {renderMetaRow()}
      </div>
    );
  }

  if (widgetType === "TABLE") {
    if (!hasTable) {
      return (
        <WidgetEmptyState
          title="Nenhum dado neste periodo"
          description="Tente ajustar o intervalo ou filtros."
          actionLabel={onQuickRange ? "Usar ultimos 30 dias" : ""}
          onAction={onQuickRange || undefined}
          variant="no-data"
          className={isMini ? "px-3 py-3" : ""}
        />
      );
    }
    return (
      <div>
        <div className="max-h-56 overflow-auto rounded-[8px] border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
              <tr>
                {table.columns.map((column) => (
                  <th key={column.key} className="px-2.5 py-2 text-left">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={index} className="border-t border-[var(--border)]">
                  {table.columns.map((column) => (
                    <td key={column.key} className="px-2.5 py-2 text-[var(--text)]">
                      {formatValue(row[column.key], metaWithCurrency)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {renderMetaRow()}
      </div>
    );
  }

  return (
    <WidgetErrorState
      title="Widget sem suporte"
      description={`Tipo ${widgetType} ainda nao suportado.`}
      onRetry={null}
      className={isMini ? "px-3 py-3" : ""}
    />
  );
});

export default WidgetRenderer;
