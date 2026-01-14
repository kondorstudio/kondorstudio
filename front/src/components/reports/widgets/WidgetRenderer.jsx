import React, { useMemo } from "react";
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
import { AlertTriangle, Link2, RefreshCw, Sliders } from "lucide-react";
import { base44 } from "@/apiClient/base44Client";
import { Button } from "@/components/ui/button.jsx";
import EmptyStateCard from "./EmptyStateCard.jsx";
import WidgetSkeleton from "./WidgetSkeleton.jsx";

const CHART_COLORS = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#ef4444"];

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
  onConnect,
  onEdit,
  variant = "default",
}) {
  const widgetType = widget?.widgetType || "KPI";
  const source = widget?.source || "";
  const metrics = Array.isArray(widget?.metrics) ? widget.metrics : [];
  const breakdown = widget?.breakdown || null;
  const hasSource = Boolean(source);
  const needsData = widgetType !== "TEXT" && widgetType !== "IMAGE";
  const hasMetrics = metrics.length > 0;
  const canFetch =
    enableQuery &&
    hasSource &&
    needsData &&
    hasMetrics &&
    (Boolean(connectionId) || forceMock);
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
      <EmptyStateCard
        title="Configure este widget"
        description="Selecione fonte, nivel e metricas."
        icon={Sliders}
        action={
          onEdit ? (
            <Button size="sm" onClick={onEdit}>
              Configurar
            </Button>
          ) : null
        }
      />
    );
  }

  if (!hasMetrics) {
    return (
      <EmptyStateCard
        title="Selecione metricas"
        description="Adicione pelo menos uma metrica para exibir dados."
        icon={Sliders}
        action={
          onEdit ? (
            <Button size="sm" onClick={onEdit}>
              Configurar
            </Button>
          ) : null
        }
      />
    );
  }

  if (!connectionId && !forceMock) {
    return (
      <EmptyStateCard
        title="Acao necessaria"
        description={`Widget sem conta selecionada para ${source}. Clique em configurar para vincular.`}
        icon={Link2}
        action={
          onConnect ? (
            <Button size="sm" variant="accent" onClick={() => onConnect()}>
              Associar conta
            </Button>
          ) : null
        }
      />
    );
  }

  if ((isLoading || isFetching) && !data) {
    return <WidgetSkeleton />;
  }

  if (isFetching && data) {
    return <WidgetSkeleton />;
  }

  if (isError) {
    return (
      <EmptyStateCard
        title="Falha ao carregar dados"
        description={error?.data?.error || error?.message || "Erro inesperado."}
        icon={AlertTriangle}
        action={
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        }
      />
    );
  }

  const totals = data?.totals && typeof data.totals === "object" ? data.totals : {};
  const seriesList = normalizeSeries(data?.series || [], metrics);
  const chartData = buildChartData(seriesList);
  const pieData = Array.isArray(data?.pie) ? data.pie : [];
  const table = data?.table && Array.isArray(data.table.rows) ? data.table : null;
  const hasTable = table && table.rows.length;
  const hasChart = chartData.length;
  const hasTotals = Object.keys(totals || {}).length > 0;
  const meta = data?.meta || {};

  if (!hasChart && !hasTotals && !pieData.length && !hasTable) {
    return (
      <EmptyStateCard
        title="Sem dados no periodo"
        description="Tente ajustar o intervalo ou filtros."
      />
    );
  }

  if (widgetType === "KPI") {
    const metricKey = metrics[0] || Object.keys(totals || {})[0] || null;
    const value = metricKey ? totals[metricKey] : null;
    return (
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        <p className="text-xs text-[var(--text-muted)]">{metricKey || "Metrica"}</p>
        <p className="mt-1 text-2xl font-semibold text-[var(--text)]">
          {formatValue(value, meta)}
        </p>
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
        <EmptyStateCard
          title="Sem dados no periodo"
          description="Tente ajustar o intervalo ou filtros."
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
                    {formatValue(row[column.key], meta)}
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
    <EmptyStateCard
      title="Widget sem suporte"
      description={`Tipo ${widgetType} ainda nao suportado.`}
    />
  );
}
