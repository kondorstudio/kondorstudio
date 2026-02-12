import React from "react";
import {
  Search,
  GripVertical,
  BarChart3,
  CircleDot,
  Table2,
  ChartPie,
} from "lucide-react";
import { Input } from "@/components/ui/input.jsx";
import { cn } from "@/utils/classnames.js";

export default function MetricsLibraryPanel({
  platforms = [],
  activePlatform,
  onPlatformChange,
  groups = [],
  metrics = [],
  searchTerm = "",
  onSearchChange,
  onMetricClick,
  onMetricDragStart,
  mode = "panel",
}) {
  const [tab, setTab] = React.useState("predefined");
  const [predefinedTab, setPredefinedTab] = React.useState("network");
  const currentPlatform = platforms.find(
    (platform) => platform.value === activePlatform
  );

  const metricIconByValue = React.useMemo(
    () => ({
      spend: CircleDot,
      clicks: CircleDot,
      cpc: CircleDot,
      cpm: CircleDot,
      ctr: CircleDot,
      conversions: CircleDot,
      leads: CircleDot,
      revenue: CircleDot,
      roas: CircleDot,
      impressions: BarChart3,
      sessions: BarChart3,
      table: Table2,
      pie: ChartPie,
    }),
    []
  );

  const filteredGroups = React.useMemo(() => {
    const query = String(searchTerm || "").trim().toLowerCase();
    const baseGroupsSource =
      Array.isArray(groups) && groups.length
        ? groups
        : [
            {
              key: "all",
              label: "Métricas",
              metrics,
            },
          ];

    const baseGroups =
      predefinedTab === "custom"
        ? baseGroupsSource
            .map((group) => ({
              ...group,
              metrics: (group.metrics || []).filter((metric) =>
                /convers|lead|compra|receita|roas|cpa|cadastro/i.test(
                  `${metric.label || ""} ${metric.value || ""}`
                )
              ),
            }))
            .filter((group) => (group.metrics || []).length)
        : baseGroupsSource;

    if (!query) return baseGroups;
    return baseGroups
      .map((group) => {
        const items = (group.metrics || []).filter((metric) => {
          const label = String(metric.label || metric.value || "").toLowerCase();
          const key = String(metric.value || "").toLowerCase();
          return label.includes(query) || key.includes(query);
        });
        return { ...group, metrics: items };
      })
      .filter((group) => group.metrics && group.metrics.length);
  }, [groups, metrics, predefinedTab, searchTerm]);

  return (
    <div
      className={cn(
        "rounded-[14px] border border-[#d8e1ec] bg-white shadow-[var(--shadow-sm)]",
        mode === "drawer" ? "h-full" : ""
      )}
    >
      <div className="border-b border-[#d8e1ec] px-4 py-3.5">
        <p className="text-[12px] font-semibold text-slate-500">
          {currentPlatform?.label || "Fonte"}
        </p>
        <p className="text-[31px] font-extrabold leading-none text-[var(--primary)]">Métricas</p>
      </div>

      {platforms.length > 1 ? (
        <div className="border-b border-[#d8e1ec] px-4 py-3">
          <div className="flex flex-wrap gap-2">
          {platforms.map((platform) => {
            const active = platform.value === activePlatform;
            return (
              <button
                key={platform.value}
                type="button"
                onClick={() => onPlatformChange?.(platform.value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                  active
                    ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                )}
              >
                {platform.label}
              </button>
            );
          })}
          </div>
        </div>
      ) : null}

      <div className="border-b border-[#d8e1ec] px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTab("predefined")}
            className={cn(
              "rounded-[12px] border px-3 py-2 text-sm font-semibold transition",
              tab === "predefined"
                ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
            )}
          >
            Métricas predefinidas
          </button>
          <button
            type="button"
            onClick={() => setTab("custom")}
            className={cn(
              "rounded-[12px] border px-3 py-2 text-sm font-semibold transition",
              tab === "custom"
                ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
            )}
          >
            Métricas personalizáveis
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder="Buscar..."
            className="pl-9 bg-slate-50 border-slate-200"
          />
        </div>
      </div>

      {tab === "predefined" ? (
        <div className="border-b border-[#d8e1ec] px-4 pb-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPredefinedTab("network")}
              className={cn(
                "rounded-[10px] border-b-2 px-2 py-1.5 text-[12px] font-semibold transition",
                predefinedTab === "network"
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              Métricas da rede
            </button>
            <button
              type="button"
              onClick={() => setPredefinedTab("custom")}
              className={cn(
                "rounded-[10px] border-b-2 px-2 py-1.5 text-[12px] font-semibold transition",
                predefinedTab === "custom"
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              Conversões personalizadas
            </button>
          </div>
        </div>
      ) : null}

      {tab === "custom" ? (
        <div className="px-4 pb-4">
          <div className="rounded-[12px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-3 py-4 text-xs text-[var(--text-muted)]">
            Crie uma métrica personalizada em breve.
          </div>
        </div>
      ) : null}

      {tab === "predefined" && filteredGroups.length ? (
        <div className="max-h-[72vh] space-y-4 overflow-y-auto px-4 pb-4">
          {filteredGroups.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                <span>{group.label}</span>
                <span>{group.metrics.length}</span>
              </div>
              <div className="space-y-2">
                {group.metrics.map((metric) => (
                  <button
                    key={metric.value}
                    type="button"
                    draggable
                    onDragStart={(event) => onMetricDragStart?.(event, metric)}
                    onClick={() => onMetricClick?.(metric)}
                    className="group flex w-full items-center justify-between rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        {React.createElement(
                          metricIconByValue[metric.queryMetric || metric.value] || CircleDot,
                          {
                            className: "h-3.5 w-3.5",
                          }
                        )}
                      </span>
                      <span className="font-semibold">{metric.label}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      <GripVertical className="h-4 w-4" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "predefined" && !filteredGroups.length ? (
        <div className="rounded-[12px] border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
          Nenhuma métrica encontrada.
        </div>
      ) : null}

      <div className="border-t border-[#d8e1ec] px-4 py-3 text-xs text-[var(--text-muted)]">
        Não encontrou a métrica?
        <button
          type="button"
          className="ml-1 font-semibold text-[var(--primary)] hover:underline"
        >
          Criar métrica personalizada
        </button>
      </div>
    </div>
  );
}
