import React from "react";
import { cn } from "@/utils/classnames.js";

export function PageHeader({ title, subtitle, kicker, actions, className = "" }) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 border-b border-[var(--border)] pb-5 md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div className="absolute -bottom-px left-0 h-[2px] w-24 rounded-full bg-gradient-to-r from-[var(--primary)] via-[var(--accent-sky)] to-transparent" />
      <div className="space-y-1">
        {kicker ? (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            {kicker}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export default PageHeader;
