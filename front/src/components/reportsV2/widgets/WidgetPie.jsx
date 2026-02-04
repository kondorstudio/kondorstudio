import React from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
} from "recharts";
import WidgetEmptyState from "@/components/reports/widgets/WidgetEmptyState.jsx";
import { formatNumber } from "@/utils/formatNumber.js";
import { buildPieSeries, PIE_DEFAULTS } from "./pieUtils.js";

const PIE_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--primary-light)",
  "var(--primary-dark)",
  "#0EA5E9",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#EC4899",
  "#22C55E",
];

const PERCENT_METRICS = new Set(["ctr"]);
const RATIO_METRICS = new Set(["roas"]);
const CURRENCY_METRICS = new Set(["spend", "revenue", "cpc", "cpm", "cpa"]);

function formatMetricValue(metricKey, value, meta, formatOverride = "auto") {
  if (value === null || value === undefined || value === "") return "-";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return String(value);

  if (formatOverride === "compact") {
    return formatNumber(number, { compact: true });
  }
  if (formatOverride === "full") {
    if (CURRENCY_METRICS.has(metricKey) && meta?.currency) {
      return formatNumber(number, { currency: meta.currency, compact: false });
    }
    return formatNumber(number, { compact: false });
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

function PieTooltip({ active, payload, metric, meta, formatOverride }) {
  if (!active || !payload?.length) return null;
  const slice = payload[0];
  const data = slice?.payload || {};
  const percent = Number.isFinite(Number(data.percent))
    ? `${(Number(data.percent) * 100).toFixed(1)}%`
    : "-";

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs shadow-[var(--shadow-sm)]">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {String(data.name || "Sem rotulo")}
      </p>
      <div className="flex items-center justify-between gap-3 text-[var(--text)]">
        <span className="font-medium">{formatMetricValue(metric, data.value, meta, formatOverride)}</span>
        <span className="text-[var(--muted)]">{percent}</span>
      </div>
    </div>
  );
}

function PieLegend({ payload }) {
  if (!Array.isArray(payload) || !payload.length) return null;
  return (
    <ul className="grid grid-cols-1 gap-1 text-xs text-[var(--text)]">
      {payload.map((entry) => {
        const item = entry.payload || {};
        return (
          <li key={entry.value} className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="truncate">{String(entry.value || "Sem rotulo")}</span>
            </span>
            <span className="text-[11px] text-[var(--muted)]">{item.percentLabel || ""}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function WidgetPie({
  rows,
  dimension,
  metric,
  meta,
  format,
  showLegend,
  variant,
  options,
}) {
  const pieVariant = variant === "donut" ? "donut" : "pie";
  const pieOptions = React.useMemo(
    () => ({
      topN: Number.isFinite(Number(options?.topN))
        ? Number(options.topN)
        : PIE_DEFAULTS.topN,
      showOthers: options?.showOthers !== false,
      othersLabel:
        String(options?.othersLabel || "").trim() || PIE_DEFAULTS.othersLabel,
    }),
    [options?.othersLabel, options?.showOthers, options?.topN]
  );

  const chartData = React.useMemo(() => {
    const { series, total } = buildPieSeries(rows, dimension, metric, pieOptions);
    if (!series.length || total <= 0) return [];
    return series.map((item) => ({
      ...item,
      percent: total > 0 ? item.value / total : 0,
      percentLabel: total > 0 ? `${((item.value / total) * 100).toFixed(1)}%` : "0%",
    }));
  }, [dimension, metric, pieOptions, rows]);

  if (!chartData.length) {
    return (
      <WidgetEmptyState
        title="Sem dados para este periodo"
        description="Ajuste os filtros globais para ver distribuicao."
        variant="no-data"
        className="border-0 bg-transparent p-0"
      />
    );
  }

  const innerRadius = pieVariant === "donut" ? "52%" : "0%";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={innerRadius}
          outerRadius="84%"
          paddingAngle={2}
          stroke="var(--card)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`pie-cell-${entry.name}-${index}`}
              fill={PIE_COLORS[index % PIE_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          content={
            <PieTooltip
              metric={metric}
              meta={meta}
              formatOverride={format}
            />
          }
        />
        {showLegend ? <Legend content={<PieLegend />} verticalAlign="bottom" /> : null}
      </PieChart>
    </ResponsiveContainer>
  );
}
