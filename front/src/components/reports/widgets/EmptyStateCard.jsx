import React from "react";
import { cn } from "@/utils/classnames.js";

export default function EmptyStateCard({
  title,
  description,
  action,
  icon: Icon,
  className = "",
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-dashed border-[var(--border)] " +
          "bg-[var(--surface)] px-4 py-4 text-center text-sm text-[var(--text-muted)]",
        className
      )}
    >
      {Icon ? (
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text)]">
          <Icon className="h-4 w-4" />
        </div>
      ) : null}
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      {description ? <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
