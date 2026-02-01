import React from "react";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/utils/classnames.js";

const VARIANTS = {
  danger: {
    container: "border-red-200 bg-red-50 text-red-700",
    icon: "text-red-600",
  },
  warning: {
    container: "border-amber-200 bg-amber-50 text-amber-700",
    icon: "text-amber-600",
  },
  info: {
    container: "border-blue-200 bg-blue-50 text-blue-700",
    icon: "text-blue-600",
  },
};

export default function AlertBanner({
  title,
  description,
  action,
  onDismiss,
  variant = "danger",
  className = "",
}) {
  const styles = VARIANTS[variant] || VARIANTS.danger;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-[12px] border px-4 py-3 text-sm",
        styles.container,
        className
      )}
    >
      <div className="flex items-center gap-3">
        <AlertCircle className={cn("h-5 w-5", styles.icon)} />
        <div>
          {title ? (
            <p className="text-xs font-semibold uppercase tracking-[0.12em]">
              {title}
            </p>
          ) : null}
          {description ? <p className="text-sm">{description}</p> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {action}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-current hover:border-current/30"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
