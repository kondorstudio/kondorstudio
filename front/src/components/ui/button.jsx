// front/src/components/ui/button.jsx
import React from "react";
import { cn } from "@/utils/classnames.js";
export function Button({
  className = "",
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  leftIcon: LeftIcon,
  children,
  ...props
}) {
  const baseClasses =
    "inline-flex items-center justify-center gap-2 border text-sm font-semibold " +
    "transition-[transform,box-shadow,background-color,border-color,color] duration-[var(--motion-base)] ease-[var(--ease-standard)] " +
    "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
    "focus-visible:ring-[rgba(109,40,217,0.35)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none";

  const variantClasses = {
    primary:
      "bg-[var(--primary)] border-transparent text-white shadow-[var(--shadow-sm)] hover:bg-[var(--primary-dark)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5",
    default:
      "bg-[var(--primary)] border-transparent text-white shadow-[var(--shadow-sm)] hover:bg-[var(--primary-dark)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5",
    secondary:
      "bg-white border-[var(--border)] text-[var(--text)] hover:bg-slate-50 hover:shadow-[var(--shadow-sm)] hover:-translate-y-0.5",
    outline:
      "bg-white border-[var(--border)] text-[var(--text)] hover:bg-slate-50 hover:shadow-[var(--shadow-sm)] hover:-translate-y-0.5",
    ghost:
      "bg-transparent border-transparent text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text)]",
    danger: "bg-red-600 border-transparent text-white shadow-[var(--shadow-sm)] hover:bg-red-700 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5",
    link: "bg-transparent border-transparent text-[var(--primary)] underline-offset-4 hover:underline",
  };

  const sizeClasses = {
    sm: "h-8 px-3 rounded-[10px] text-xs",
    md: "h-10 px-4 rounded-[12px]",
    lg: "h-12 px-5 rounded-[12px] text-base",
  };

  const isDisabled = disabled || isLoading;

  return (
    <button
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      disabled={isDisabled}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{children}</span>
        </span>
      ) : (
        <>
          {LeftIcon ? <LeftIcon className="h-4 w-4" /> : null}
          {children}
        </>
      )}
    </button>
  );
}
