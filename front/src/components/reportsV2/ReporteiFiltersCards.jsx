import React from "react";
import { CalendarDays, Link2, PencilLine, EyeOff, Copy } from "lucide-react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Button } from "@/components/ui/button.jsx";
import { resolveDateRange, toDateKey } from "@/components/reportsV2/utils.js";
import { cn } from "@/utils/classnames.js";

function formatDatePtBr(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function dateRangeLabel(filters) {
  const resolved = resolveDateRange(filters?.dateRange || {});
  return `${formatDatePtBr(resolved.start)} a ${formatDatePtBr(resolved.end)}`;
}

function compareLabel(filters) {
  const compareTo = filters?.compareTo || null;
  if (!compareTo) return "Sem comparação";

  const resolved = resolveDateRange(filters?.dateRange || {});
  const startDate = new Date(`${resolved.start}T00:00:00`);
  const endDate = new Date(`${resolved.end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "Sem comparação";
  }

  if (compareTo === "previous_year") {
    const prevStart = new Date(startDate);
    prevStart.setFullYear(prevStart.getFullYear() - 1);
    const prevEnd = new Date(endDate);
    prevEnd.setFullYear(prevEnd.getFullYear() - 1);
    return `${formatDatePtBr(toDateKey(prevStart))} a ${formatDatePtBr(toDateKey(prevEnd))}`;
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  const spanDays = Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
  const prevEnd = new Date(startDate);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (spanDays - 1));
  return `${formatDatePtBr(toDateKey(prevStart))} a ${formatDatePtBr(toDateKey(prevEnd))}`;
}

export default function ReporteiFiltersCards({
  filters,
  onChange,
  shareUrl = "",
  className = "",
  collapsible = true,
  defaultExpanded = false,
  showAdvancedPanel = false,
}) {
  const [expanded, setExpanded] = React.useState(
    Boolean(showAdvancedPanel && defaultExpanded)
  );
  const preset = filters?.dateRange?.preset || "last_7_days";

  const handleCopyShareLink = async () => {
    if (!shareUrl || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch (error) {
      // noop
    }
  };

  const updateDateRange = (patch) => {
    onChange?.({
      ...(filters || {}),
      dateRange: {
        ...(filters?.dateRange || {}),
        ...patch,
      },
    });
  };

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="reportei-card flex min-h-[76px] items-center gap-3 px-4 py-3.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[var(--primary)]">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              Período de análise
            </p>
            <p className="text-[16px] font-extrabold leading-tight text-[var(--text)] lg:text-[22px]">
              {dateRangeLabel(filters)}
            </p>
          </div>
        </div>
        <div className="reportei-card flex min-h-[76px] items-center gap-3 px-4 py-3.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[var(--primary)]">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              Período de comparação
            </p>
            <p className="text-[16px] font-extrabold leading-tight text-[var(--text)] lg:text-[22px]">
              {compareLabel(filters)}
            </p>
          </div>
        </div>
        <div className="reportei-card flex min-h-[76px] items-center gap-3 px-4 py-3.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[var(--primary)]">
            <Link2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              Link de compartilhamento
            </p>
            <p className="truncate text-[13px] text-[var(--text-muted)]">
              {shareUrl || "Link ainda não gerado"}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 rounded-full border border-[#d1dae6] bg-white p-0 text-slate-500"
            onClick={handleCopyShareLink}
            disabled={!shareUrl}
            aria-label="Copiar link"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {collapsible ? (
        <div className="flex items-center gap-3 py-0.5">
          <div className="h-px flex-1 bg-[#d4dee9]" />
          {showAdvancedPanel ? (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-[22px] font-semibold text-[#6f879d] hover:text-[#45637f]"
            >
              <EyeOff className="h-4 w-4" />
              {expanded ? "Esconder detalhes" : "Mostrar detalhes"}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[22px] font-semibold text-[#6f879d]">
              <EyeOff className="h-4 w-4" />
              Esconder capa
            </span>
          )}
          <div className="h-px flex-1 bg-[#d4dee9]" />
        </div>
      ) : null}

      {showAdvancedPanel && (!collapsible || expanded) && onChange ? (
        <div className="reportei-card grid gap-3 p-4 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Preset
            </label>
            <Select
              value={preset}
              onValueChange={(value) =>
                updateDateRange({
                  preset: value,
                  start: value === "custom" ? filters?.dateRange?.start || "" : "",
                  end: value === "custom" ? filters?.dateRange?.end || "" : "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
                <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" ? (
            <>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  De
                </label>
                <DateField
                  value={filters?.dateRange?.start || ""}
                  onChange={(event) =>
                    updateDateRange({ start: event?.target?.value || "" })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Até
                </label>
                <DateField
                  value={filters?.dateRange?.end || ""}
                  onChange={(event) =>
                    updateDateRange({ end: event?.target?.value || "" })
                  }
                />
              </div>
            </>
          ) : null}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Comparação
            </label>
            <Select
              value={filters?.compareTo || "none"}
              onValueChange={(value) =>
                onChange({
                  ...(filters || {}),
                  compareTo: value === "none" ? null : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem comparação</SelectItem>
                <SelectItem value="previous_period">Período anterior</SelectItem>
                <SelectItem value="previous_year">Ano anterior</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-4">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Link de compartilhamento
            </label>
            <div className="relative">
              <Input value={shareUrl || ""} readOnly placeholder="Link ainda não gerado" />
              <PencilLine className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
