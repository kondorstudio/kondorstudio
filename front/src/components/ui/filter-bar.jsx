import React from "react";
import { cn } from "@/utils/classnames.js";

export function FilterBar({ children, className = "" }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-[12px] border border-[var(--border)] " +
          "bg-[linear-gradient(135deg,rgba(109,40,217,0.06),rgba(14,165,233,0.04))] " +
          "px-4 py-3 shadow-[var(--shadow-sm)] backdrop-blur-sm " +
          "transition-[box-shadow,border-color] duration-[var(--motion-base)] ease-[var(--ease-standard)] " +
          "hover:shadow-[var(--shadow-md)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export default FilterBar;
