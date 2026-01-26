import React from "react";
import { AlertTriangle, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { cn } from "@/utils/classnames.js";

export default function WidgetErrorState({
  title,
  description,
  onRetry,
  onConnect,
  showConnect = false,
  className = "",
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-center",
        className
      )}
    >
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      {description ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
      ) : null}
      <div className="mt-3 flex justify-center gap-2">
        {showConnect && onConnect ? (
          <Button size="sm" variant="secondary" onClick={onConnect}>
            <Link2 className="mr-2 h-3.5 w-3.5" />
            Associar conta
          </Button>
        ) : null}
        {onRetry ? (
          <Button size="sm" variant="ghost" onClick={onRetry}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        ) : null}
      </div>
    </div>
  );
}
