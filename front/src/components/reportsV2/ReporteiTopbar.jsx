import React from "react";
import {
  Bell,
  Volume2,
  ChevronDown,
  ChevronLeft,
  UserRound,
  LayoutGrid,
} from "lucide-react";
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
        "reportei-topbar sticky top-0 z-50 border-b border-white/10",
        className
      )}
    >
      <div className="mx-auto flex h-[52px] max-w-[1760px] items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-4 text-white">
          <div className="reportei-logo flex items-center gap-2 text-xl font-semibold">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] bg-white text-[11px] font-extrabold text-[var(--primary)]">
              r
            </span>
            <span className="text-lg leading-none">reportei</span>
          </div>
          <div className="hidden items-center gap-2 text-white/80 xl:flex">
            <ChevronLeft className="h-4 w-4" />
            <UserRound className="h-4 w-4" />
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <LayoutGrid className="h-4 w-4 text-white/90" />
            <span className="text-xs font-semibold tracking-[0.01em] text-white/95">
              Overview
            </span>
            <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-950">
              Novo
            </span>
          </div>
          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
              P
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-semibold text-white/95"
            >
              <span className="max-w-[140px] truncate">Primeiro cliente</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {leftContent}
          </div>
        </div>
        <div className="flex items-center gap-3 text-white">
          {rightContent}
          {showDefaultActions ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Notificações"
              >
                <Bell className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
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
