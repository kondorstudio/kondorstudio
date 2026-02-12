import React from "react";
import { PlayCircle, Plus } from "lucide-react";
import { cn } from "@/utils/classnames.js";

export default function ReporteiLeftRail({
  items = [],
  activeItem = "",
  onSelect,
  onAdd,
  className = "",
}) {
  return (
    <aside
      className={cn(
        "fixed left-2 top-[112px] z-30 hidden w-[34px] rounded-[16px] border border-[#d8e1ec] bg-white/95 py-2 shadow-[0_10px_22px_rgba(15,23,42,0.1)] backdrop-blur lg:flex lg:flex-col lg:items-center lg:gap-2",
        className
      )}
      aria-label="Acesso rápido às plataformas"
    >
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#d6e0ea] bg-white text-[#7b8ea3] transition hover:bg-slate-50"
        title="Iniciar apresentação"
      >
        <PlayCircle className="h-4 w-4" />
      </button>

      <div className="h-px w-5 bg-[#e2e8f0]" />

      {items.map((item) => {
        const active = item.value === activeItem;
        return (
          <button
            key={item.value}
            type="button"
            title={item.label}
            onClick={() => onSelect?.(item.value)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-extrabold transition",
              item.className || "bg-slate-100 text-slate-700",
              active && "ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-white"
            )}
          >
            {item.shortLabel || item.label?.slice(0, 1)}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#d6e0ea] bg-white text-[#76879a] transition hover:bg-slate-50"
        title="Adicionar métrica"
      >
        <Plus className="h-4 w-4" />
      </button>
    </aside>
  );
}
