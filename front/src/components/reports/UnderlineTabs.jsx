import React from "react";
import { cn } from "@/utils/classnames.js";

export default function UnderlineTabs({
  value,
  onChange,
  tabs = [],
  className = "",
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-6 border-b border-[var(--border)] text-sm",
        className
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange?.(tab.value)}
            className={cn(
              "pb-2 text-sm font-medium transition",
              active
                ? "border-b-2 border-[var(--primary)] text-[var(--text)]"
                : "border-b-2 border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
