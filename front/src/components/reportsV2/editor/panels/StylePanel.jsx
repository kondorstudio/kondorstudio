import React from "react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Checkbox } from "@/components/ui/checkbox.jsx";

const LEGEND_WIDGETS = new Set(["timeseries", "bar", "pie"]);

export default function StylePanel({
  widget,
  formatOptions,
  onTitleChange,
  onShowLegendChange,
  onFormatChange,
}) {
  if (!widget) return null;

  const formatValue = formatOptions.some(
    (option) => option.value === widget?.viz?.format
  )
    ? widget.viz.format
    : "auto";

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Titulo do widget
        </label>
        <Input
          value={widget.title || ""}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Nome do widget"
        />
      </div>

      {LEGEND_WIDGETS.has(widget.type) ? (
        <div className="flex items-center justify-between rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">
              Mostrar legenda
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Disponivel para graficos com series.
            </p>
          </div>
          <Checkbox
            checked={widget.viz?.showLegend !== false}
            onCheckedChange={(checked) => onShowLegendChange(Boolean(checked))}
          />
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Formato
        </label>
        <Select value={formatValue} onValueChange={onFormatChange}>
          <SelectTrigger>
            <SelectValue placeholder="Auto" />
          </SelectTrigger>
          <SelectContent>
            {formatOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-muted)]">
        Usa o tema do dashboard para cores, bordas e radius.
      </div>
    </div>
  );
}
