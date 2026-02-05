import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
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
import WidgetText from "@/components/reportsV2/widgets/WidgetText.jsx";
import WidgetPie from "@/components/reportsV2/widgets/WidgetPie.jsx";
import {
  buildWidgetQueryKey,
  mergeWidgetFilters,
  resolveDateRange,
  stableStringify,
} from "./utils.js";

const CHART_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "#B050F0",
  "var(--danger)",
  "#8b5cf6",
];
const PERCENT_METRICS = new Set(["ctr"]);
const RATIO_METRICS = new Set(["roas"]);
const CURRENCY_METRICS = new Set(["spend", "revenue", "cpc", "cpm", "cpa"]);
const PLATFORM_LABELS = {
  META_ADS: "Meta Ads",
  GOOGLE_ADS: "Google Ads",
  TIKTOK_ADS: "TikTok Ads",
  LINKEDIN_ADS: "LinkedIn Ads",
  GA4: "GA4",
  GMB: "Google Meu Negócio",
  FB_IG: "Facebook/Instagram",
};

const METRIC_LABELS = {
  spend: "Valor investido",
  impressions: "Impressões",
  clicks: "Cliques",
  conversions: "Conversões",
  revenue: "Receita",
  sessions: "Sessões",
  leads: "Leads",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
  cpa: "CPA",
  roas: "ROAS",
};

const COMPARISON_LABELS = {
  previous_period: "vs período anterior",
  previous_year: "vs ano anterior",
};

function formatPlatformList(list) {
  if (!Array.isArray(list) || !list.length) return "conexões necessárias";
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
    if (formatOverride === "full") {
      if (CURRENCY_METRICS.has(metricKey) && meta?.currency) {
        return formatNumber(number, { currency: meta.currency, compact: false });
      }
      return formatNumber(number, { compact: false });
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

function formatMetricLabel(metricKey) {
  if (!metricKey) return "-";
  return METRIC_LABELS[metricKey] || metricKey;
}

function buildComparison(currentValue, compareValue) {
  if (compareValue === null || compareValue === undefined) return null;
  const currentNum = Number(currentValue);
  const compareNum = Number(compareValue);
  if (!Number.isFinite(compareNum)) return null;
  const absoluteDifference = (Number.isFinite(currentNum) ? currentNum : 0) - compareNum;
  const difference = compareNum === 0 ? null : (absoluteDifference / compareNum) * 100;
  return {
    values: compareValue,
    difference,
    absoluteDifference,
  };
}

function formatComparisonPercent(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(1)}%`;
}

function normalizeReporteiCell(value) {
  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "text")) return value.text;
    if (Object.prototype.hasOwnProperty.call(value, "value")) return value.value;
    if (Object.prototype.hasOwnProperty.call(value, "title")) return value.title;
  }
  return value;
}

function buildTotalsFromRows(rows, metrics) {
  const totals = {};
  metrics.forEach((metric) => {
    totals[metric] = rows.reduce((sum, row) => {
      const value = row?.[metric];
      const numeric = Number(value);
      return Number.isFinite(numeric) ? sum + numeric : sum;
    }, 0);
  });
  return totals;
}

function normalizeReporteiEntry(entry, widget) {
  if (!entry || typeof entry !== "object") return null;
  const metrics = Array.isArray(widget?.query?.metrics) ? widget.query.metrics : [];
  const dimensions = Array.isArray(widget?.query?.dimensions)
    ? widget.query.dimensions
    : [];
  const widgetType = widget?.type || "kpi";
  const rows = [];
  const pageInfo = { limit: rows.length, offset: 0, hasMore: false };

  if (widgetType === "kpi") {
    const metric = metrics[0];
    return {
      rows: [],
      totals: metric ? { [metric]: entry.values ?? 0 } : {},
      meta: {
        comparison: entry.comparison ?? null,
        trend: entry.trend ?? null,
      },
      pageInfo,
    };
  }

  if (Array.isArray(entry.labels) && Array.isArray(entry.values)) {
    const dimension = dimensions[0] || "label";
    entry.labels.forEach((label, index) => {
      const row = { [dimension]: label };
      entry.values.forEach((serie) => {
        const serieName = serie?.name || "value";
        const serieValue = Array.isArray(serie?.data) ? serie.data[index] : null;
        row[serieName] = serieValue;
      });
      rows.push(row);
    });
    return {
      rows,
      totals: buildTotalsFromRows(rows, metrics),
      meta: {},
      pageInfo: { ...pageInfo, limit: rows.length },
    };
  }

  if (Array.isArray(entry.values)) {
    const columns = [...dimensions, ...metrics];
    entry.values.forEach((rowValues) => {
      const row = {};
      columns.forEach((column, columnIndex) => {
        row[column] = normalizeReporteiCell(rowValues?.[columnIndex]);
      });
      rows.push(row);
    });
    return {
      rows,
      totals: buildTotalsFromRows(rows, metrics),
      meta: {},
      pageInfo: { ...pageInfo, limit: rows.length },
    };
  }

  return null;
}

function resolveReporteiData(data, widget) {
  if (!data || typeof data !== "object") return null;
  if (data.rows || data.totals || data.pageInfo) return null;
  const entry = widget?.id && data[widget.id] ? data[widget.id] : data;
  return normalizeReporteiEntry(entry, widget);
}

function resolveRefreshLabel(fetchReason) {
  if (fetchReason === "auto") return "Atualizando automaticamente...";
  if (fetchReason === "filters") return "Aplicando filtros...";
  return "Atualizando...";
}

function resolveFriendlyError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.data?.error?.code || error?.code || "").toUpperCase();

  if (
    status === 0 ||
    code.includes("NETWORK") ||
    code.includes("FAILED_TO_FETCH") ||
    code.includes("ERR_NETWORK")
  ) {
    return {
      title: "Sem conexão",
      description: "Verifique sua conexão com a internet e tente novamente.",
    };
  }

  if (
    code.includes("TIMEOUT") ||
    code.includes("ETIMEDOUT") ||
    code.includes("ECONNABORTED") ||
    status === 408 ||
    status === 504
  ) {
    return {
      title: "Tempo de resposta excedido",
      description: "A consulta demorou mais que o esperado. Tente novamente em instantes.",
    };
  }

  if (code.includes("INVALID_QUERY")) {
    return {
      title: "Configuração inválida",
      description: "Este widget possui uma configuração inválida. Ajuste no editor.",
    };
  }

  if (status >= 500 || status === 502 || status === 503) {
    return {
      title: "Serviço temporariamente indisponível",
      description: "Não foi possível carregar agora. Tente novamente em alguns instantes.",
    };
  }

  return {
    title: "Não foi possível carregar",
    description: "Ocorreu um erro ao consultar os dados deste widget.",
  };
}

function ChartTooltip({ active, payload, label, meta, formatOverride }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs shadow-[var(--shadow-sm)]">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
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

function WidgetStatusReporter({ widgetId, status, reason, onStatusChange }) {
  React.useEffect(() => {
    if (!onStatusChange || !widgetId) return undefined;
    onStatusChange(widgetId, { status, reason: reason || null });
    return undefined;
  }, [onStatusChange, reason, status, widgetId]);
  return null;
}

export default function WidgetRenderer({
  widget,
  dashboardId,
  brandId,
  publicToken,
  pageId,
  globalFilters,
  onStatusChange,
  healthIssue,
  fetchReason,
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
  const isCompact = Number(widget?.layout?.h || 0) <= 3;
  const showGrid = vizOptions.showGrid !== false;
  const legendProps = resolveLegendProps(vizOptions.legendPosition);
  const widgetLimitRaw = Number(widget?.query?.limit);
  const widgetLimit = Number.isFinite(widgetLimitRaw)
    ? Math.max(1, Math.min(500, Math.round(widgetLimitRaw)))
    : null;
  const sortField = String(widget?.query?.sort?.field || "").trim();
  const sortDirection = widget?.query?.sort?.direction === "desc" ? "desc" : "asc";
  const sort = sortField ? { field: sortField, direction: sortDirection } : undefined;
  const healthReason =
    healthIssue?.reasonCode || healthIssue?.reason || healthIssue?.status || null;

  const [pageSize, setPageSize] = React.useState(widgetLimit || 25);
  const [pageIndex, setPageIndex] = React.useState(0);
  const effectivePageSize = React.useMemo(() => {
    const base = Math.max(1, Math.min(500, Number(pageSize) || 25));
    if (!widgetLimit) return base;
    return Math.max(1, Math.min(base, widgetLimit));
  }, [pageSize, widgetLimit]);
  const effectiveOffset = React.useMemo(() => {
    const rawOffset = Math.max(0, pageIndex) * effectivePageSize;
    if (!widgetLimit) return rawOffset;
    const maxOffset = Math.max(widgetLimit - effectivePageSize, 0);
    return Math.min(rawOffset, maxOffset);
  }, [effectivePageSize, pageIndex, widgetLimit]);

  const dateRange = resolveDateRange(globalFilters?.dateRange || {});
  const mergedFilters = mergeWidgetFilters(widget?.query?.filters || [], globalFilters);
  const compareTo = globalFilters?.compareTo
    ? { mode: globalFilters.compareTo }
    : null;

  const tableResetKey = stableStringify({
    widgetId: widget?.id,
    globalFilters,
    query: widget?.query || {},
    effectivePageSize,
  });

  React.useEffect(() => {
    if (!isTable) return;
    setPageIndex(0);
  }, [isTable, tableResetKey]);

  React.useEffect(() => {
    if (!isTable) return;
    setPageSize(widgetLimit || 25);
    setPageIndex(0);
  }, [isTable, widget?.id, widgetLimit]);

  const pagination = isTable
    ? {
        limit: effectivePageSize,
        offset: effectiveOffset,
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
    ...(widgetLimit ? { limit: widgetLimit } : {}),
    pagination,
    sort,
    responseFormat: "reportei",
    widgetId: widget?.id,
    widgetType,
  };

  const queryKey = buildWidgetQueryKey({
    dashboardId,
    widget,
    globalFilters: { ...globalFilters, dateRange },
    pagination,
    pageId,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      isPublic
        ? base44.publicReports.queryMetrics(payload)
        : base44.reportsV2.queryMetrics(payload),
    enabled: Boolean(
      widgetType !== "text" &&
        !(healthReason === "MISSING_CONNECTION" || healthReason === "INVALID_QUERY") &&
        (isPublic ? publicToken : brandId) &&
        dateRange.start &&
        dateRange.end &&
        metrics.length
    ),
    keepPreviousData: true,
  });
  const isRefreshing = isFetching && !isLoading;
  const refreshLabel = resolveRefreshLabel(fetchReason);

  if (widgetType === "text") {
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="ready"
          reason={null}
          onStatusChange={onStatusChange}
        />
        <WidgetText widget={widget} />
      </>
    );
  }

  if (healthReason === "MISSING_CONNECTION") {
    const platformLabel = formatPlatformList([healthIssue.platform]);
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="warn"
          reason="MISSING_CONNECTIONS"
          onStatusChange={onStatusChange}
        />
      <WidgetEmptyState
        title="Dados parcialmente indisponíveis"
        description={
          isPublic
            ? "Dados indisponíveis. Conecte a plataforma para visualizar."
            : `Dados indisponíveis. Conecte ${platformLabel} para visualizar este gráfico.`
        }
        variant="connection"
        actionLabel={isPublic ? undefined : "Conectar agora"}
        onAction={
          isPublic
            ? undefined
            : () => {
                  const params = new URLSearchParams();
                  if (brandId) params.set("brandId", brandId);
                  if (healthIssue.platform) params.set("platform", healthIssue.platform);
                  const query = params.toString();
                  navigate(`/relatorios/v2/conexoes${query ? `?${query}` : ""}`);
                }
        }
        compact={isCompact}
        className="border-0 bg-transparent p-0"
      />
    </>
  );
}

  if (healthReason === "INVALID_QUERY") {
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="error"
          reason="INVALID_QUERY"
          onStatusChange={onStatusChange}
        />
      <WidgetEmptyState
        title="Configuração inválida"
        description="Configuração inválida neste widget. Abra no Editor para corrigir."
        variant="metrics"
        actionLabel={isPublic ? undefined : "Abrir no editor"}
        onAction={
          isPublic
            ? undefined
            : () => navigate(`/relatorios/v2/${dashboardId}/edit`)
        }
        compact={isCompact}
        className="border-0 bg-transparent p-0"
      />
    </>
  );
}

  if (!metrics.length) {
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="error"
          reason="MISSING_METRICS"
          onStatusChange={onStatusChange}
        />
      <WidgetEmptyState
        title="Widget sem métricas"
        description="Edite este widget para selecionar métricas."
        variant="metrics"
        compact={isCompact}
        className="border-0 bg-transparent p-0"
      />
    </>
  );
}

  if (isLoading && !data) {
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="loading"
          reason={null}
          onStatusChange={onStatusChange}
        />
        <WidgetSkeleton
          widgetType={widgetType}
          variant="embedded"
          className="border-0 bg-transparent p-0"
        />
      </>
    );
  }

  if (
    error?.status === 409 &&
    error?.data?.error?.code === "MISSING_CONNECTIONS"
  ) {
    const missing = error?.data?.error?.details?.missing || [];
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="warn"
          reason="MISSING_CONNECTIONS"
          onStatusChange={onStatusChange}
        />
      <WidgetEmptyState
        title="Conexões pendentes"
        description={`Conecte ${formatPlatformList(missing)} para ver este widget.`}
        variant="connection"
        actionLabel={isPublic ? undefined : "Ir para conexões"}
        onAction={
          isPublic
            ? undefined
            : () =>
                navigate(
                  `/relatorios/v2/conexoes${brandId ? `?brandId=${brandId}` : ""}`
                )
        }
        compact={isCompact}
        className="border-0 bg-transparent p-0"
      />
    </>
  );
}

  if (error) {
    const friendlyError = resolveFriendlyError(error);
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="error"
          reason="QUERY_ERROR"
          onStatusChange={onStatusChange}
        />
      <WidgetErrorState
        title={friendlyError.title}
        description={friendlyError.description}
        onRetry={() => refetch()}
        compact={isCompact}
        className="border-0 bg-transparent p-0"
      />
    </>
  );
}

  const normalizedData = React.useMemo(
    () => resolveReporteiData(data, widget) || data,
    [data, widget]
  );

  const rows = Array.isArray(normalizedData?.rows) ? normalizedData.rows : [];
  const totals = normalizedData?.totals || {};
  const meta = normalizedData?.meta || {};
  const pageInfo = normalizedData?.pageInfo || {
    limit: pagination?.limit || 0,
    offset: pagination?.offset || 0,
    hasMore: false,
  };

  if (!rows.length && widgetType !== "kpi") {
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="ready"
          reason="EMPTY_DATA"
          onStatusChange={onStatusChange}
        />
      <WidgetEmptyState
        title="Sem dados para este período"
        description="Ajuste os filtros globais para ver resultados."
        variant="no-data"
        compact={isCompact}
        className="border-0 bg-transparent p-0"
      />
    </>
  );
}

  if (widgetType === "kpi") {
    const metric = metrics[0];
    const value = getKpiValue(rows, totals, metric, dimensions);
    const comparison =
      meta?.comparison ??
      (data?.compare?.totals && metric
        ? buildComparison(value, data.compare.totals[metric])
        : null);
    const diffPercentLabel = formatComparisonPercent(comparison?.difference);
    const diffTone =
      comparison?.difference > 0
        ? "bg-emerald-50 text-emerald-700"
        : comparison?.difference < 0
        ? "bg-rose-50 text-rose-600"
        : "bg-slate-100 text-slate-500";
    const diffIcon =
      comparison?.difference > 0
        ? "▲"
        : comparison?.difference < 0
        ? "▼"
        : "•";
    const comparisonLabel = compareTo?.mode
      ? COMPARISON_LABELS[compareTo.mode] || "vs período anterior"
      : "comparação";
    const diffAbsoluteLabel =
      comparison?.absoluteDifference !== null &&
      comparison?.absoluteDifference !== undefined
        ? formatMetricValue(metric, comparison.absoluteDifference, meta, formatOverride)
        : null;
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="ready"
          reason={null}
          onStatusChange={onStatusChange}
        />
        <div className="flex h-full flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            {formatMetricLabel(metric)}
          </div>
          <div className="text-3xl font-semibold text-[var(--text)]">
            {formatMetricValue(metric, value, meta, formatOverride)}
          </div>
          {diffPercentLabel ? (
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ${diffTone}`}
                title={diffAbsoluteLabel ? `Δ ${diffAbsoluteLabel}` : undefined}
              >
                {diffIcon} {diffPercentLabel}
              </span>
              <span className="text-[var(--muted)]">{comparisonLabel}</span>
            </div>
          ) : null}
          <div className="mt-auto text-xs text-[var(--muted)]">
            {isRefreshing ? refreshLabel : "Atualizado agora"}
          </div>
        </div>
      </>
    );
  }

  if (widgetType === "timeseries") {
    const chartData = buildChartData(rows, metrics, "date");
    const lineType = vizOptions.lineType || "monotone";
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="ready"
          reason={null}
          onStatusChange={onStatusChange}
        />
        <div className="flex h-full flex-col">
          <div className="flex-1">
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
          </div>
          {isRefreshing ? (
            <div className="mt-2 text-xs text-[var(--muted)]">{refreshLabel}</div>
          ) : null}
        </div>
      </>
    );
  }

  if (widgetType === "bar") {
    const dimension = dimensions[0] || "label";
    const chartData = buildChartData(rows, metrics, dimension);
    const barRadius = Array.isArray(vizOptions.barRadius)
      ? vizOptions.barRadius
      : [6, 6, 0, 0];
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="ready"
          reason={null}
          onStatusChange={onStatusChange}
        />
        <div className="flex h-full flex-col">
          <div className="flex-1">
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
          </div>
          {isRefreshing ? (
            <div className="mt-2 text-xs text-[var(--muted)]">{refreshLabel}</div>
          ) : null}
        </div>
      </>
    );
  }

  if (widgetType === "table") {
    const columns = [...dimensions, ...metrics];
    const basePageOptions = [25, 50, 100, 200];
    const pageOptions = widgetLimit
      ? Array.from(
          new Set([
            ...basePageOptions.filter((option) => option <= widgetLimit),
            widgetLimit,
          ])
        ).sort((a, b) => a - b)
      : basePageOptions;
    const currentPage = Math.floor((pageInfo.offset || 0) / effectivePageSize) + 1;
    const hasNextWithinLimit = widgetLimit
      ? effectiveOffset + effectivePageSize < widgetLimit
      : true;
    const hasNextPage = Boolean(pageInfo?.hasMore) && hasNextWithinLimit;
    const showTotals = vizOptions.showTotals !== false;
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="ready"
          reason={null}
          onStatusChange={onStatusChange}
        />
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--card)]">
                <tr className="border-b border-[var(--border)]">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-xs font-semibold uppercase text-[var(--muted)]"
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
              <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                  Totais
                </div>
                <div className="mt-1 flex flex-wrap gap-3">
                  {metrics.map((metric) => (
                    <div key={`total-${metric}`} className="text-[var(--text)]">
                      <span className="mr-1 text-[11px] font-semibold uppercase text-[var(--muted)]">
                        {metric}
                      </span>
                      {formatMetricValue(metric, totals?.[metric], meta, formatOverride)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
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
                className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--text)]"
              >
                {pageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <div className="text-xs text-[var(--muted)]">
                Página {currentPage}
              </div>
              {widgetLimit ? (
                <div className="text-[11px] text-[var(--muted)]">
                  Limite do widget: {widgetLimit} linhas
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
                disabled={pageIndex === 0}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPageIndex((prev) => prev + 1)}
                disabled={!hasNextPage}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Proximo
              </button>
            </div>
          </div>
        </div>
        {isRefreshing ? (
          <div className="mt-2 text-xs text-[var(--muted)]">{refreshLabel}</div>
        ) : null}
      </>
    );
  }

  if (widgetType === "pie" || widgetType === "donut") {
    const metric = metrics[0];
    const dimension = dimensions[0] || "platform";
    const variant =
      widgetType === "donut"
        ? "donut"
        : widget?.viz?.variant === "donut"
        ? "donut"
        : "pie";
    return (
      <>
        <WidgetStatusReporter
          widgetId={widget?.id}
          status="ready"
          reason={null}
          onStatusChange={onStatusChange}
        />
        <WidgetPie
          rows={rows}
          dimension={dimension}
          metric={metric}
          meta={meta}
          format={formatOverride}
          showLegend={showLegend}
          variant={variant}
          options={widget?.viz?.options}
        />
        {isRefreshing ? (
          <div className="mt-2 text-xs text-[var(--muted)]">{refreshLabel}</div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <WidgetStatusReporter
        widgetId={widget?.id}
        status="error"
        reason="UNSUPPORTED_WIDGET"
        onStatusChange={onStatusChange}
      />
    <WidgetEmptyState
      title="Tipo não suportado"
      description="Este widget ainda não possui visualização."
      variant="metrics"
      compact={isCompact}
      className="border-0 bg-transparent p-0"
    />
    </>
  );
}
