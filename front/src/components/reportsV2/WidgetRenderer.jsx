import React from "react";
import { useQuery } from "@tanstack/react-query";
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
import { buildWidgetQueryKey, mergeWidgetFilters, resolveDateRange } from "./utils.js";

const CHART_COLORS = ["#1f6feb", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];
const PERCENT_METRICS = new Set(["ctr"]);
const RATIO_METRICS = new Set(["roas"]);
const CURRENCY_METRICS = new Set(["spend", "revenue", "cpc", "cpm", "cpa"]);

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
  globalFilters,
}) {
  const metrics = Array.isArray(widget?.query?.metrics) ? widget.query.metrics : [];
  const dimensions = Array.isArray(widget?.query?.dimensions)
    ? widget.query.dimensions
    : [];
  const widgetType = widget?.type || "kpi";
  const formatOverride = widget?.viz?.format || "auto";
  const showLegend = widget?.viz?.showLegend !== false;

  const dateRange = resolveDateRange(globalFilters?.dateRange || {});
  const mergedFilters = mergeWidgetFilters(widget?.query?.filters || [], globalFilters);
  const compareTo = globalFilters?.compareTo
    ? { mode: globalFilters.compareTo }
    : null;

  const payload = {
    brandId,
    dateRange,
    dimensions,
    metrics,
    filters: mergedFilters,
    compareTo,
  };

  const queryKey = buildWidgetQueryKey({
    dashboardId,
    widget,
    globalFilters: { ...globalFilters, dateRange },
  });

  const refreshMs = Number(globalFilters?.autoRefreshSec || 0) * 1000;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () => base44.reportsV2.queryMetrics(payload),
    enabled: Boolean(brandId && dateRange.start && dateRange.end && metrics.length),
    refetchInterval: refreshMs > 0 ? refreshMs : false,
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
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltip meta={meta} formatOverride={formatOverride} />} />
          {showLegend ? <Legend /> : null}
          {metrics.map((metric, index) => (
            <Line
              key={metric}
              type="monotone"
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
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltip meta={meta} formatOverride={formatOverride} />} />
          {showLegend ? <Legend /> : null}
          {metrics.map((metric, index) => (
            <Bar
              key={metric}
              dataKey={metric}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
              name={metric}
              radius={[6, 6, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (widgetType === "table") {
    const columns = [...dimensions, ...metrics];
    return (
      <div className="h-full overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-[var(--border)]">
              {columns.map((col) => (
                <th key={col} className="px-3 py-2 text-xs font-semibold uppercase text-[var(--text-muted)]">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.id || index}`} className="border-b border-[var(--border)] last:border-none">
                {columns.map((col) => (
                  <td key={`${col}-${index}`} className="px-3 py-2 text-sm text-[var(--text)]">
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
    );
  }

  if (widgetType === "pie") {
    const dimension = dimensions[0] || "label";
    const chartData = rows.map((row) => ({
      name: row[dimension],
      value: row[metrics[0]],
    }));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={45}
            outerRadius={80}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${entry.name}-${index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip meta={meta} formatOverride={formatOverride} />} />
          {showLegend ? <Legend /> : null}
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
