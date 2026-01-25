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
import { WidgetEmpty, WidgetSkeleton } from "./WidgetStates.jsx";

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
    if (meta?.currency) {
      try {
        return new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: meta.currency,
        }).format(value);
      } catch (err) {
        return value.toLocaleString("pt-BR");
      }
    }
    return value.toLocaleString("pt-BR");
  }
  return String(value);
}

export default function WidgetRenderer({
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
  const canFetch =
    enableQuery &&
    hasSource &&
    needsData &&
    hasMetrics &&
    (Boolean(connectionId) || forceMock) &&
    !isGenerating &&
    !hasOverride;
  const widgetFiltersKey = useMemo(
    () => JSON.stringify(widget?.filters || {}),
    [widget?.filters]
  );

  const queryKey = useMemo(
    () => [
      "widgetData",
      widget?.id,
      source,
      connectionId || "preview",
      widgetType,
      widget?.level,
      breakdown,
      metrics.join(","),
      widgetFiltersKey,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.compareMode,
      filters?.compareDateFrom,
      filters?.compareDateTo,
      forceMock ? "mock" : "live",
    ],
    [
      widget?.id,
      widget?.level,
      source,
      connectionId,
      widgetType,
      breakdown,
      metrics,
      widgetFiltersKey,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.compareMode,
      filters?.compareDateFrom,
      filters?.compareDateTo,
      forceMock,
    ]
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
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
        filters: widget?.filters || {},
        options: widget?.options || {},
        widgetType,
        forceMock,
      }),
    enabled: canFetch,
    keepPreviousData: true,
  });

  const isMini = variant === "mini";
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
  const isInitialLoading = canFetch && (isLoading || (isFetching && !resolvedData));
  const isUpdating = canFetch && isFetching && Boolean(resolvedData);
  const noData =
    needsData &&
    resolvedData &&
    !hasDataByType &&
    !isInitialLoading &&
    !hasConnectError &&
    !isError;

  const status = useMemo(() => {
    if (!needsData) return "LIVE";
    if (!hasSource || !hasMetrics) return "EMPTY";
    if (noConnection || hasConnectError) return "EMPTY";
    if (isError && !hasConnectError) return "ERROR";
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
    hasConnectError,
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

  if (!needsData) {
    if (widgetType === "TEXT") {
      return (
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text)]">
          {widget?.options?.text || "Sem conteudo"}
        </div>
      );
    }
    return (
      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text)]">
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
      <WidgetEmpty
        title="Configure este widget"
        description="Selecione fonte, nivel e metricas."
        actionLabel={onEdit ? "Configurar" : ""}
        onAction={onEdit || undefined}
        className={isMini ? "px-3 py-3" : ""}
      />
    );
  }

  if (!hasMetrics) {
    return (
      <WidgetEmpty
        title="Selecione metricas"
        description="Adicione pelo menos uma metrica para exibir dados."
        actionLabel={onEdit ? "Configurar" : ""}
        onAction={onEdit || undefined}
        className={isMini ? "px-3 py-3" : ""}
      />
    );
  }

  if (isGenerating && needsData && !hasOverride) {
    return (
      <WidgetSkeleton
        type={widgetType}
        className={isMini ? "p-3" : ""}
      />
    );
  }

  if (noConnection || hasConnectError) {
    const connectionHint = onEdit
      ? "Clique no lapis no canto direito deste widget e selecione uma conta conectada."
      : "Associe uma conta para carregar os dados deste widget.";
    return (
      <WidgetEmpty
        title="Conta nao conectada"
        description={connectionHint}
        actionLabel={onConnect ? "Associar conta" : ""}
        onAction={onConnect || undefined}
        variant="no-connection"
        className={isMini ? "px-3 py-3" : ""}
      />
    );
  }

  if (isInitialLoading) {
    return (
      <WidgetSkeleton
        type={widgetType}
        className={isMini ? "p-3" : ""}
      />
    );
  }

  if (isError) {
    return (
      <WidgetEmpty
        title="Nao foi possivel carregar este widget."
        description="Tente novamente em alguns instantes."
        actionLabel="Tentar novamente"
        onAction={refetch}
        variant="error"
        className={isMini ? "px-3 py-3" : ""}
      />
    );
  }

  if (noData) {
    if (meta?.mocked) {
      return (
        <WidgetEmpty
          title="Fonte ainda nao disponivel"
          description="Os dados desta fonte ainda nao foram implementados."
          variant="no-data"
          className={isMini ? "px-3 py-3" : ""}
        />
      );
    }
    return (
      <WidgetEmpty
        title="Sem dados para este periodo."
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
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
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
      </div>
    );
  }

  if (widgetType === "LINE") {
    return (
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
    );
  }

  if (widgetType === "BAR") {
    return (
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
    );
  }

  if (widgetType === "PIE") {
    return (
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
    );
  }

  if (widgetType === "TABLE") {
    if (!hasTable) {
      return (
        <WidgetEmpty
          title="Sem dados para este periodo."
          description="Tente ajustar o intervalo ou filtros."
          actionLabel={onQuickRange ? "Usar ultimos 30 dias" : ""}
          onAction={onQuickRange || undefined}
          variant="no-data"
          className={isMini ? "px-3 py-3" : ""}
        />
      );
    }
    return (
      <div className="max-h-56 overflow-auto rounded-[12px] border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
            <tr>
              {table.columns.map((column) => (
                <th key={column.key} className="px-3 py-2 text-left">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index} className="border-t border-[var(--border)]">
                {table.columns.map((column) => (
                  <td key={column.key} className="px-3 py-2 text-[var(--text)]">
                    {formatValue(row[column.key], metaWithCurrency)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <WidgetEmpty
      title="Widget sem suporte"
      description={`Tipo ${widgetType} ainda nao suportado.`}
      variant="error"
      className={isMini ? "px-3 py-3" : ""}
    />
  );
}
