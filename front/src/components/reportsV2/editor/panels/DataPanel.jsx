import React from "react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { Input } from "@/components/ui/input.jsx";
import { cn } from "@/utils/classnames.js";
import FilterBuilder from "@/components/reportsV2/editor/FilterBuilder.jsx";

function buildSortOptions(widget) {
  const dimensions = Array.isArray(widget?.query?.dimensions)
    ? widget.query.dimensions
    : [];
  const metrics = Array.isArray(widget?.query?.metrics) ? widget.query.metrics : [];
  return Array.from(new Set([...dimensions, ...metrics])).filter(Boolean);
}

export default function DataPanel({
  widget,
  widgetTypes,
  metricOptions,
  dimensionOptions,
  onWidgetTypeChange,
  onToggleMetric,
  onDimensionChange,
  onFiltersChange,
  onSortChange,
  onLimitChange,
}) {
  if (!widget) return null;

  const metrics = Array.isArray(widget.query?.metrics) ? widget.query.metrics : [];
  const dimensions = Array.isArray(widget.query?.dimensions)
    ? widget.query.dimensions
    : [];
  const isTextWidget = widget.type === "text";
  const isPieLike = widget.type === "pie" || widget.type === "donut";
  const sortOptions = buildSortOptions(widget);
  const sortField = sortOptions.includes(widget.query?.sort?.field)
    ? widget.query.sort.field
    : "none";
  const sortDirection = widget.query?.sort?.direction || "asc";
  const limitValue = Number.isFinite(Number(widget.query?.limit))
    ? String(widget.query.limit)
    : "25";

  const dimensionChoices = isPieLike
    ? dimensionOptions.filter(
        (dimension) => dimension.value !== "none" && dimension.value !== "date"
      )
    : dimensionOptions;

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Tipo do widget
        </label>
        <Select value={widget.type} onValueChange={onWidgetTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {widgetTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Metricas
        </label>
        {isTextWidget ? (
          <div className="rounded-[12px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-xs text-[var(--text-muted)]">
            Blocos de texto nao usam metricas.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {metricOptions.map((metric) => {
              const active = metrics.includes(metric.value);
              const displayLabel = metric.shortLabel || metric.label;
              return (
                <button
                  key={metric.value}
                  type="button"
                  onClick={() => onToggleMetric(metric.value)}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-[10px] border px-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition",
                    active
                      ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] shadow-[var(--shadow-sm)]"
                      : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:border-slate-300"
                  )}
                  title={metric.label}
                >
                  {displayLabel}
                </button>
              );
            })}
          </div>
        )}
        {isPieLike ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Pie/Donut usa exatamente 1 metrica.
          </p>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Dimensao
        </label>
        <Select
          value={dimensions[0] || (isPieLike ? "platform" : "none")}
          onValueChange={onDimensionChange}
          disabled={widget.type === "timeseries" || isTextWidget}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {dimensionChoices.map((dimension) => (
              <SelectItem key={dimension.value} value={dimension.value}>
                {dimension.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {widget.type === "timeseries" ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Time series sempre usa dimensao date.
          </p>
        ) : isPieLike ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Pie/Donut exige 1 dimensao e nao aceita date.
          </p>
        ) : null}
      </div>

      {!isTextWidget ? (
        <>
          <FilterBuilder
            filters={widget.query?.filters || []}
            onChange={onFiltersChange}
          />

          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Sort e limite
            </p>
            <div className="grid gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Ordenar por
              </label>
              <Select
                value={sortField}
                onValueChange={(value) =>
                  onSortChange(
                    value === "none"
                      ? null
                      : {
                          field: value,
                          direction: sortDirection,
                        }
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem ordenacao" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem ordenacao</SelectItem>
                  {sortOptions.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Direcao
              </label>
              <Select
                value={sortDirection}
                onValueChange={(value) => {
                  if (sortField === "none") return;
                  onSortChange({
                    field: sortField,
                    direction: value,
                  });
                }}
                disabled={sortField === "none"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="asc" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">asc</SelectItem>
                  <SelectItem value="desc">desc</SelectItem>
                </SelectContent>
              </Select>

              <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Limite de linhas (1-500)
              </label>
              <Input
                type="number"
                min={1}
                max={500}
                value={limitValue}
                onChange={(event) => onLimitChange(event.target.value)}
                aria-label="Limite de linhas"
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
