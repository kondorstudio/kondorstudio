import React from "react";
import { CheckCircle2, Info, AlertTriangle } from "lucide-react";

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    border: "border-emerald-500",
    text: "text-emerald-700",
  },
  error: {
    icon: AlertTriangle,
    border: "border-rose-500",
    text: "text-rose-700",
  },
  info: {
    icon: Info,
    border: "border-sky-500",
    text: "text-sky-700",
  },
};

export function Toast({ toast }) {
  if (!toast || !toast.message) return null;
  const variant = VARIANTS[toast.variant] || VARIANTS.info;
  const Icon = variant.icon;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div
        role="status"
        className={`flex items-start gap-2 rounded-[12px] border border-[var(--border)] border-l-4 ${variant.border} bg-white px-4 py-3 shadow-[var(--shadow-md)] animate-fade-in-up`}
      >
        {Icon ? <Icon className={`h-4 w-4 ${variant.text}`} /> : null}
        <div className="text-sm text-[var(--text)]">{toast.message}</div>
      </div>
    </div>
  );
}

export default Toast;
