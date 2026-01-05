import React from "react";
import { cn } from "@/utils/classnames.js";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
  className = "",
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] border border-dashed border-[var(--border)] " +
          "bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(109,40,217,0.04))] " +
          "px-6 py-8 text-center shadow-[var(--shadow-sm)] animate-fade-in-up",
        className
      )}
    >
      {Icon ? (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      {description ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
