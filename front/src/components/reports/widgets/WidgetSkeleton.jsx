import React from "react";
import { cn } from "@/utils/classnames.js";

export default function WidgetSkeleton({ className = "" }) {
  return (
    <div className={cn("animate-pulse space-y-3", className)}>
      <div className="h-3 w-24 rounded-full bg-[var(--surface-muted)]" />
      <div className="h-5 w-40 rounded-[10px] bg-[var(--surface-muted)]" />
      <div className="h-28 w-full rounded-[14px] bg-[var(--surface-muted)]" />
      <div className="h-3 w-20 rounded-full bg-[var(--surface-muted)]" />
    </div>
  );
}
