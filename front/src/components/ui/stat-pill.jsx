import React from "react";
import { cn } from "@/utils/classnames.js";

const variants = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-purple-50 text-purple-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
};

export function StatPill({ label, value, variant = "default", className = "" }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1 text-xs font-semibold shadow-[var(--shadow-sm)]",
        variants[variant],
        className
      )}
    >
      <span>{label}</span>
      <span className="text-[var(--text)]">{value}</span>
    </div>
  );
}

export default StatPill;
