import React from "react";
import { Filter, Calendar, RefreshCw } from "lucide-react";
import { FilterBar } from "@/components/ui/filter-bar.jsx";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import { cn } from "@/utils/classnames.js";

const PLATFORM_OPTIONS = [
  { value: "META_ADS", label: "Meta Ads" },
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "TIKTOK_ADS", label: "TikTok Ads" },
  { value: "LINKEDIN_ADS", label: "LinkedIn Ads" },
  { value: "GA4", label: "GA4" },
  { value: "GMB", label: "GMB" },
  { value: "FB_IG", label: "FB/IG" },
];

export default function GlobalFiltersBar({
  filters,
  onChange,
  className = "",
}) {
  const platforms = Array.isArray(filters?.platforms) ? filters.platforms : [];
  const compareTo = filters?.compareTo || "none";
  const autoRefreshSec = String(filters?.autoRefreshSec ?? 0);
  const preset = filters?.dateRange?.preset || "last_7_days";

  const togglePlatform = (value) => {
    const next = platforms.includes(value)
      ? platforms.filter((item) => item !== value)
      : [...platforms, value];
    onChange({ ...filters, platforms: next });
  };

  return (
    <FilterBar className={cn("gap-5 bg-white", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <Filter className="h-4 w-4 text-[var(--text-muted)]" />
        Filtros globais
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Periodo
          </label>
          <Select
            value={preset}
            onValueChange={(value) =>
              onChange({
                ...filters,
                dateRange: {
                  ...filters?.dateRange,
                  preset: value,
                  start: value === "custom" ? filters?.dateRange?.start || "" : "",
                  end: value === "custom" ? filters?.dateRange?.end || "" : "",
                },
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_7_days">Ultimos 7 dias</SelectItem>
              <SelectItem value="last_30_days">Ultimos 30 dias</SelectItem>
              <SelectItem value="custom">Customizado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {preset === "custom" ? (
          <>
            <div className="min-w-[160px]">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Inicio
              </label>
              <DateField
                value={filters?.dateRange?.start || ""}
                onChange={(event) =>
                  onChange({
                    ...filters,
                    dateRange: { ...filters?.dateRange, start: event.target.value },
                  })
                }
                placeholder="dd/mm/aaaa"
              />
            </div>
            <div className="min-w-[160px]">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Fim
              </label>
              <DateField
                value={filters?.dateRange?.end || ""}
                onChange={(event) =>
                  onChange({
                    ...filters,
                    dateRange: { ...filters?.dateRange, end: event.target.value },
                  })
                }
                placeholder="dd/mm/aaaa"
              />
            </div>
          </>
        ) : null}

        <div className="min-w-[200px]">
          <label className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            <Calendar className="h-3.5 w-3.5" />
            Plataformas
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_OPTIONS.map((platform) => {
              const active = platforms.includes(platform.value);
              return (
                <button
                  type="button"
                  key={platform.value}
                  onClick={() => togglePlatform(platform.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition",
                    active
                      ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
                      : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:border-slate-300"
                  )}
                >
                  {platform.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-[180px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Comparacao
          </label>
          <Select
            value={compareTo}
            onValueChange={(value) =>
              onChange({
                ...filters,
                compareTo: value === "none" ? null : value,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Sem comparacao" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem comparacao</SelectItem>
              <SelectItem value="previous_period">Periodo anterior</SelectItem>
              <SelectItem value="previous_year">Ano anterior</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[160px]">
          <label className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            <RefreshCw className="h-3.5 w-3.5" />
            Auto refresh
          </label>
          <Select
            value={autoRefreshSec}
            onValueChange={(value) =>
              onChange({
                ...filters,
                autoRefreshSec: Number(value),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Desligado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Desligado</SelectItem>
              <SelectItem value="30">30s</SelectItem>
              <SelectItem value="60">60s</SelectItem>
              <SelectItem value="300">5min</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </FilterBar>
  );
}
