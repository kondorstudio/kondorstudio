import React from "react";
import { cn } from "@/utils/classnames.js";

export function FilterBar({ children, className = "" }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-4 rounded-[16px] border border-[var(--border)] " +
        "bg-[linear-gradient(135deg,rgba(var(--primary-rgb),0.05),rgba(var(--primary-rgb),0.02))] " +
          "px-5 py-4 shadow-[var(--shadow-sm)] backdrop-blur-sm " +
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
