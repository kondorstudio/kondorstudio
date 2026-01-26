import React from "react";
import { Link2, Sliders, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { cn } from "@/utils/classnames.js";

const VARIANT_META = {
  connection: {
    icon: Link2,
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  metrics: {
    icon: Sliders,
    tone: "border-slate-200 bg-slate-50 text-slate-700",
  },
  "no-data": {
    icon: BarChart3,
    tone: "border-slate-200 bg-slate-50 text-slate-700",
  },
};

export default function WidgetEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  variant = "no-data",
  className = "",
}) {
  const config = VARIANT_META[variant] || VARIANT_META["no-data"];
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
