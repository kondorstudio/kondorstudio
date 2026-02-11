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
        "fixed left-2 top-[106px] z-30 hidden w-8 rounded-full bg-transparent py-1 lg:flex lg:flex-col lg:items-center lg:gap-1.5",
        className
      )}
      aria-label="Acesso rápido às plataformas"
    >
      <button
        type="button"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#d6e0ea] bg-white text-[#7b8ea3] transition hover:bg-slate-50"
        title="Iniciar apresentação"
      >
        <PlayCircle className="h-3.5 w-3.5" />
      </button>

      {items.map((item) => {
        const active = item.value === activeItem;
        return (
          <button
            key={item.value}
            type="button"
            title={item.label}
            onClick={() => onSelect?.(item.value)}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-extrabold transition",
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
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#d6e0ea] bg-white text-[#76879a] transition hover:bg-slate-50"
        title="Adicionar métrica"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </aside>
  );
}
