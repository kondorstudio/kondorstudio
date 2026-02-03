import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { base44 } from "@/apiClient/base44Client";
import { formatNumber } from "@/utils/formatNumber.js";
import WidgetSkeleton from "@/components/reports/widgets/WidgetSkeleton.jsx";
import WidgetEmptyState from "@/components/reports/widgets/WidgetEmptyState.jsx";
import WidgetErrorState from "@/components/reports/widgets/WidgetErrorState.jsx";
import {
  buildWidgetQueryKey,
  mergeWidgetFilters,
  resolveDateRange,
  stableStringify,
} from "./utils.js";

const CHART_COLORS = ["#1f6feb", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];
const PERCENT_METRICS = new Set(["ctr"]);
const RATIO_METRICS = new Set(["roas"]);
const CURRENCY_METRICS = new Set(["spend", "revenue", "cpc", "cpm", "cpa"]);
const PLATFORM_LABELS = {
  META_ADS: "Meta Ads",
  GOOGLE_ADS: "Google Ads",
  TIKTOK_ADS: "TikTok Ads",
  LINKEDIN_ADS: "LinkedIn Ads",
  GA4: "GA4",
  GMB: "Google Meu Negocio",
  FB_IG: "Facebook/Instagram",
};

function formatPlatformList(list) {
  if (!Array.isArray(list) || !list.length) return "conexoes necessarias";
  return list
    .map((platform) => PLATFORM_LABELS[platform] || platform)
    .join(", ");
}

function formatMetricValue(metricKey, value, meta, formatOverride = "auto") {
  if (value === null || value === undefined || value === "") return "-";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return String(value);

  if (formatOverride && formatOverride !== "auto") {
    if (formatOverride === "percent") {
      return `${(number * 100).toFixed(2)}%`;
    }
    if (formatOverride === "currency") {
      if (meta?.currency) {
        return formatNumber(number, { currency: meta.currency, compact: true });
      }
      return formatNumber(number, { compact: true });
    }
    if (formatOverride === "compact") {
      return formatNumber(number, { compact: true });
    }
  }

  if (PERCENT_METRICS.has(metricKey)) {
    return `${(number * 100).toFixed(2)}%`;
  }
  if (RATIO_METRICS.has(metricKey)) {
    return number.toFixed(2);
  }
  if (CURRENCY_METRICS.has(metricKey) && meta?.currency) {
    return formatNumber(number, { currency: meta.currency, compact: true });
  }
  return formatNumber(number, { compact: true });
}

function ChartTooltip({ active, payload, label, meta, formatOverride }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-white px-3 py-2 text-xs shadow-[var(--shadow-sm)]">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[var(--text)]">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-semibold text-[var(--text)]">
              {formatMetricValue(entry.dataKey, entry.value, meta, formatOverride)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function resolveLegendProps(position) {
  const normalized = String(position || "bottom").toLowerCase();
  if (normalized === "top") {
    return { verticalAlign: "top", align: "center" };
  }
  if (normalized === "left") {
    return { verticalAlign: "middle", align: "left", layout: "vertical" };
  }
  if (normalized === "right") {
    return { verticalAlign: "middle", align: "right", layout: "vertical" };
  }
  return { verticalAlign: "bottom", align: "center" };
}

function buildChartData(rows, metrics, dimension) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const entry = { label: row[dimension] };
    metrics.forEach((metric) => {
      entry[metric] = row[metric];
    });
    return entry;
  });
}

function getKpiValue(rows, totals, metric, dimensions) {
  if (dimensions?.length === 1 && dimensions[0] === "date" && rows?.length) {
    const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return sorted[sorted.length - 1]?.[metric];
  }
  return totals?.[metric];
}

export default function WidgetRenderer({
  widget,
  dashboardId,
  brandId,
  publicToken,
  globalFilters,
}) {
  const navigate = useNavigate();
  const isPublic = Boolean(publicToken);
  const metrics = Array.isArray(widget?.query?.metrics) ? widget.query.metrics : [];
  const dimensions = Array.isArray(widget?.query?.dimensions)
    ? widget.query.dimensions
    : [];
  const widgetType = widget?.type || "kpi";
  const formatOverride = widget?.viz?.format || "auto";
  const showLegend = widget?.viz?.showLegend !== false;
  const vizOptions = widget?.viz?.options || {};
  const isTable = widgetType === "table";
  const showGrid = vizOptions.showGrid !== false;
  const legendProps = resolveLegendProps(vizOptions.legendPosition);

  const [pageSize, setPageSize] = React.useState(25);
  const [pageIndex, setPageIndex] = React.useState(0);

  const dateRange = resolveDateRange(globalFilters?.dateRange || {});
  const mergedFilters = mergeWidgetFilters(widget?.query?.filters || [], globalFilters);
  const compareTo = globalFilters?.compareTo
    ? { mode: globalFilters.compareTo }
    : null;

  const tableResetKey = stableStringify({
    widgetId: widget?.id,
    globalFilters,
    query: widget?.query || {},
  });

  React.useEffect(() => {
    if (!isTable) return;
    setPageIndex(0);
  }, [isTable, pageSize, tableResetKey]);

  const pagination = isTable
    ? {
        limit: pageSize,
        offset: pageIndex * pageSize,
      }
    : undefined;

  const payload = {
    ...(isPublic ? { token: publicToken } : { brandId }),
    dateRange,
    dimensions,
    metrics,
    filters: mergedFilters,
    requiredPlatforms: widget?.query?.requiredPlatforms,
    compareTo,
    pagination,
  };

  const queryKey = buildWidgetQueryKey({
    dashboardId,
    widget,
    globalFilters: { ...globalFilters, dateRange },
    pagination,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      isPublic
        ? base44.publicReports.queryMetrics(payload)
        : base44.reportsV2.queryMetrics(payload),
    enabled: Boolean(
      (isPublic ? publicToken : brandId) &&
        dateRange.start &&
        dateRange.end &&
        metrics.length
    ),
    keepPreviousData: true,
  });

  if (!metrics.length) {
    return (
      <WidgetEmptyState
        title="Widget sem metricas"
        description="Edite este widget para selecionar metricas."
        variant="metrics"
        className="border-0 bg-transparent p-0"
      />
    );
  }

  if (isLoading) {
    return (
      <WidgetSkeleton
        widgetType={widgetType}
        className="border-0 bg-transparent p-0"
      />
    );
  }

  if (
    error?.status === 409 &&
    error?.data?.error?.code === "MISSING_CONNECTIONS"
  ) {
    const missing = error?.data?.error?.details?.missing || [];
    return (
      <WidgetEmptyState
        title="Conexoes pendentes"
        description={`Conecte ${formatPlatformList(missing)} para ver este widget.`}
        variant="connection"
        actionLabel={isPublic ? undefined : "Ir para conexoes"}
        onAction={
          isPublic
            ? undefined
            : () =>
                navigate(
                  `/relatorios/v2/conexoes${brandId ? `?brandId=${brandId}` : ""}`
                )
        }
        className="border-0 bg-transparent p-0"
      />
    );
  }

  if (error) {
    return (
      <WidgetErrorState
        title="Nao foi possivel carregar"
        description="Verifique sua conexao e tente novamente."
        onRetry={() => refetch()}
        className="border-0 bg-transparent p-0"
      />
    );
  }

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const totals = data?.totals || {};
  const meta = data?.meta || {};
  const pageInfo = data?.pageInfo || {
    limit: pagination?.limit || 0,
    offset: pagination?.offset || 0,
    hasMore: false,
  };

  if (!rows.length && widgetType !== "kpi") {
    return (
      <WidgetEmptyState
        title="Sem dados para este periodo"
        description="Ajuste os filtros globais para ver resultados."
        variant="no-data"
        className="border-0 bg-transparent p-0"
      />
    );
  }

  if (widgetType === "kpi") {
    const metric = metrics[0];
    const value = getKpiValue(rows, totals, metric, dimensions);
    return (
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          {metric}
        </div>
        <div className="text-3xl font-semibold text-[var(--text)]">
          {formatMetricValue(metric, value, meta, formatOverride)}
        </div>
        {isFetching ? (
          <div className="text-xs text-[var(--text-muted)]">Atualizando...</div>
        ) : (
          <div className="text-xs text-[var(--text-muted)]">Atualizado agora</div>
        )}
      </div>
    );
  }

  if (widgetType === "timeseries") {
    const chartData = buildChartData(rows, metrics, "date");
    const lineType = vizOptions.lineType || "monotone";
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          {showGrid ? <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" /> : null}
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltip meta={meta} formatOverride={formatOverride} />} />
          {showLegend ? <Legend {...legendProps} /> : null}
          {metrics.map((metric, index) => (
            <Line
              key={metric}
              type={lineType}
              dataKey={metric}
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              name={metric}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (widgetType === "bar") {
    const dimension = dimensions[0] || "label";
    const chartData = buildChartData(rows, metrics, dimension);
    const barRadius = Array.isArray(vizOptions.barRadius)
      ? vizOptions.barRadius
      : [6, 6, 0, 0];
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          {showGrid ? <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" /> : null}
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltip meta={meta} formatOverride={formatOverride} />} />
          {showLegend ? <Legend {...legendProps} /> : null}
          {metrics.map((metric, index) => (
            <Bar
              key={metric}
              dataKey={metric}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
              name={metric}
              radius={barRadius}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (widgetType === "table") {
    const columns = [...dimensions, ...metrics];
    const pageOptions = [25, 50, 100, 200];
    const currentPage = Math.floor((pageInfo.offset || 0) / pageSize) + 1;
    const showTotals = vizOptions.showTotals !== false;
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-[var(--border)]">
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-xs font-semibold uppercase text-[var(--text-muted)]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row.id || index}`}
                  className="border-b border-[var(--border)] last:border-none"
                >
                  {columns.map((col) => (
                    <td
                      key={`${col}-${index}`}
                      className="px-3 py-2 text-sm text-[var(--text)]"
                    >
                      {metrics.includes(col)
                        ? formatMetricValue(col, row[col], meta, formatOverride)
                        : row[col] ?? "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {showTotals ? (
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Totais
              </div>
              <div className="mt-1 flex flex-wrap gap-3">
                {metrics.map((metric) => (
                  <div key={`total-${metric}`} className="text-[var(--text)]">
                    <span className="mr-1 text-[11px] font-semibold uppercase text-[var(--text-muted)]">
                      {metric}
                    </span>
                    {formatMetricValue(metric, totals?.[metric], meta, formatOverride)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              htmlFor={`page-size-${widget?.id || "table"}`}
            >
              Itens
            </label>
            <select
              id={`page-size-${widget?.id || "table"}`}
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPageIndex(0);
              }}
              className="rounded-[10px] border border-[var(--border)] bg-white px-2 py-1 text-xs text-[var(--text)]"
            >
              {pageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <div className="text-xs text-[var(--text-muted)]">
              Pagina {currentPage}
            </div>

            <button
              type="button"
              onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
              disabled={pageIndex === 0}
              className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPageIndex((prev) => prev + 1)}
              disabled={!pageInfo?.hasMore}
              className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Proximo
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (widgetType === "pie") {
    const dimension = dimensions[0] || "label";
    const chartData = rows.map((row) => ({
      name: row[dimension],
      value: row[metrics[0]],
    }));
    const innerRadius = Number.isFinite(vizOptions.innerRadius)
      ? vizOptions.innerRadius
      : 45;
    const outerRadius = Number.isFinite(vizOptions.outerRadius)
      ? vizOptions.outerRadius
      : 80;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${entry.name}-${index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip meta={meta} formatOverride={formatOverride} />} />
          {showLegend ? <Legend {...legendProps} /> : null}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <WidgetEmptyState
      title="Tipo nao suportado"
      description="Este widget ainda nao possui visualizacao."
      variant="metrics"
      className="border-0 bg-transparent p-0"
    />
  );
}
