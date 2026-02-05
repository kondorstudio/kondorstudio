import React from "react";
import { Search, GripVertical } from "lucide-react";
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
}) {
  const filteredGroups = React.useMemo(() => {
    const query = String(searchTerm || "").trim().toLowerCase();
    const baseGroups =
      Array.isArray(groups) && groups.length
        ? groups
        : [
            {
              key: "all",
              label: "Métricas",
              metrics,
            },
          ];

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
  }, [groups, metrics, searchTerm]);

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Biblioteca de métricas
          </p>
          <p className="text-xs text-slate-500">
            Arraste para criar KPIs rapidamente.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Biblioteca
        </span>
      </div>

      {platforms.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {platforms.map((platform) => {
            const active = platform.value === activePlatform;
            return (
              <button
                key={platform.value}
                type="button"
                onClick={() => onPlatformChange?.(platform.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
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
      ) : null}

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchTerm}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder="Buscar métrica..."
          className="pl-9 bg-slate-50 border-slate-200"
        />
      </div>

      {filteredGroups.length ? (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
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
                    className="flex w-full items-center justify-between rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-slate-400" />
                      <span className="font-semibold">{metric.label}</span>
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {metric.value}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[12px] border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
          Nenhuma métrica encontrada.
        </div>
      )}
    </div>
  );
}
