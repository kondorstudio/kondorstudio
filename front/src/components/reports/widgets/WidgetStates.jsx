import React from "react";
import { AlertTriangle, BarChart3, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { cn } from "@/utils/classnames.js";

const EMPTY_VARIANTS = {
  "no-connection": {
    icon: Link2,
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  "no-data": {
    icon: BarChart3,
    tone: "border-slate-200 bg-slate-50 text-slate-700",
  },
  error: {
    icon: AlertTriangle,
    tone: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

const STATUS_META = {
  LIVE: {
    label: "Ao vivo",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  LOADING: {
    label: "Atualizando",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  ERROR: {
    label: "Erro",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
  EMPTY: {
    label: "Sem dados",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

function SkeletonLine({ className = "" }) {
  return (
    <div
      className={cn(
        "h-3 rounded-full bg-[var(--surface-muted)] kondor-shimmer",
        className
      )}
    />
  );
}

function KpiSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonLine className="w-20" />
      <div className="h-8 w-32 rounded-[12px] bg-[var(--surface-muted)] kondor-shimmer" />
      <SkeletonLine className="w-28" />
    </div>
  );
}

function ChartSkeleton() {
  const bars = [70, 45, 85, 55, 90, 38, 72, 60];
  return (
    <div className="space-y-3">
      <SkeletonLine className="w-24" />
      <div className="flex h-36 items-end gap-2">
        {bars.map((height, index) => (
          <div
            key={`bar-${index}`}
            className="flex-1 rounded-[8px] bg-[var(--surface-muted)] kondor-shimmer"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <SkeletonLine className="w-32" />
    </div>
  );
}

function PieSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="h-24 w-24 rounded-full bg-[var(--surface-muted)] kondor-shimmer" />
      <div className="flex-1 space-y-2">
        <SkeletonLine className="w-28" />
        <SkeletonLine className="w-32" />
        <SkeletonLine className="w-20" />
      </div>
    </div>
  );
}

function TableSkeleton() {
  const rows = Array.from({ length: 5 });
  return (
    <div className="space-y-3">
      <SkeletonLine className="w-24" />
      <div className="space-y-2">
        {rows.map((_, index) => (
          <div
            key={`row-${index}`}
            className="h-3 rounded-full bg-[var(--surface-muted)] kondor-shimmer"
            style={{ width: `${80 - index * 8}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function WidgetSkeleton({ type = "KPI", className = "" }) {
  const normalized = String(type || "KPI").toUpperCase();
  const content =
    normalized === "KPI"
      ? KpiSkeleton()
      : normalized === "TABLE"
        ? TableSkeleton()
        : normalized === "PIE"
          ? PieSkeleton()
          : ChartSkeleton();

  return (
    <div
      className={cn(
        "rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4",
        className
      )}
    >
      {content}
    </div>
  );
}

export function WidgetEmpty({
  title,
  description,
  actionLabel,
  onAction,
  variant = "no-data",
  className = "",
}) {
  const config = EMPTY_VARIANTS[variant] || EMPTY_VARIANTS["no-data"];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-center",
        className
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border",
            config.tone
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      ) : null}
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      {description ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function WidgetStatusPill({ status, sourceLabel, className = "" }) {
  const meta = STATUS_META[status] || STATUS_META.EMPTY;
  if (!status) return null;
  const text = sourceLabel ? `${sourceLabel} • ${meta.label}` : meta.label;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
        meta.className,
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          status === "LOADING" ? "kondor-pulse" : ""
        )}
      />
      {text}
    </span>
  );
}
