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
        "rounded-[16px] border border-[var(--border)] bg-white px-6 py-10 text-center " +
          "shadow-[var(--shadow-sm)] animate-fade-in-up",
        className
      )}
    >
      {Icon ? (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-[var(--accent)]">
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
