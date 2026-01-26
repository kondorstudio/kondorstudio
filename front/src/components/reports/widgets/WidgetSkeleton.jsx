import React from "react";
import { cn } from "@/utils/classnames.js";

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
      <SkeletonLine className="w-24" />
      <div className="h-8 w-36 rounded-[12px] bg-[var(--surface-muted)] kondor-shimmer" />
      <SkeletonLine className="w-28" />
    </div>
  );
}

function ChartSkeleton() {
  const bars = [70, 45, 85, 55, 90, 38, 72, 60];
  return (
    <div className="space-y-3">
      <SkeletonLine className="w-28" />
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

function TextSkeleton() {
  return (
    <div className="space-y-2">
      <SkeletonLine className="w-40" />
      <SkeletonLine className="w-56" />
      <SkeletonLine className="w-32" />
    </div>
  );
}

function ImageSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonLine className="w-24" />
      <div className="h-32 w-full rounded-[14px] bg-[var(--surface-muted)] kondor-shimmer" />
    </div>
  );
}

export default function WidgetSkeleton({ widgetType = "KPI", variant = "default" }) {
  const normalized = String(widgetType || "KPI").toUpperCase();
  const content =
    normalized === "KPI"
      ? KpiSkeleton()
      : normalized === "TABLE"
        ? TableSkeleton()
        : normalized === "PIE"
          ? PieSkeleton()
          : normalized === "TEXT"
            ? TextSkeleton()
            : normalized === "IMAGE"
              ? ImageSkeleton()
              : ChartSkeleton();

  return (
    <div
      className={cn(
        "rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4",
        variant === "mini" ? "p-3" : ""
      )}
    >
      {content}
    </div>
  );
}
