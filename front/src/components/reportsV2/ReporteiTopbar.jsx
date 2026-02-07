import React from "react";
import { Bell, Volume2, ChevronDown } from "lucide-react";
import { cn } from "@/utils/classnames.js";

export default function ReporteiTopbar({
  leftContent,
  rightContent,
  className = "",
  showDefaultActions = true,
}) {
  return (
    <div
      className={cn(
        "reportei-topbar sticky top-0 z-50 border-b border-white/10 shadow-[0_10px_24px_rgba(2,6,23,0.18)]",
        className
      )}
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-4 text-white">
          <div className="reportei-logo flex items-center gap-2 text-lg font-semibold">
            reportei
          </div>
          {leftContent}
        </div>
        <div className="flex items-center gap-3 text-white">
          {rightContent}
          {showDefaultActions ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Notificações"
              >
                <Bell className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Som"
              >
                <Volume2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/20"
              >
                Minha empresa
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
