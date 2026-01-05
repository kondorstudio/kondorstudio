// front/src/components/ui/badge.jsx
import React from "react";
import { cn } from "@/utils/classnames.js";
export function Badge({ className, variant = "default", ...props }) {
  const baseClasses =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium " +
    "transition-[color,background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] " +
    "shadow-[var(--shadow-sm)]";

  const variants = {
    default: "bg-[var(--primary-light)] text-[var(--primary)] border-transparent",
    outline: "bg-transparent text-[var(--text-muted)] border-[var(--border)]",
    success: "bg-emerald-50 text-emerald-700 border-emerald-100",
    warning: "bg-amber-50 text-amber-700 border-amber-100",
    danger: "bg-red-50 text-red-700 border-red-100",
  };

  return (
    <span
      className={cn(baseClasses, variants[variant] || variants.default, className)}
      {...props}
    />
  );
}

export default Badge;
