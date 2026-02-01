import React, { useEffect, useState } from "react";
import { MoreHorizontal, Pencil, Copy, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge.jsx";
import { cn } from "@/utils/classnames.js";
import { getSourceMeta, getWidgetTypeMeta } from "./widgetMeta.js";
import { WidgetStatusPill } from "./WidgetStates.jsx";

function SourcePill({ source }) {
  const meta = getSourceMeta(source);
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] font-medium",
        meta.accent
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function WidgetMenu({ onEdit, onDuplicate, onRemove }) {
  const [open, setOpen] = useState(false);
  if (!onEdit && !onDuplicate && !onRemove) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-[var(--text-muted)] transition hover:border-[var(--border)] hover:text-[var(--text)]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-20 w-40 rounded-[10px] border border-[var(--border)] bg-white p-1">
          {onEdit ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--surface-muted)]"
              onClick={() => {
                onEdit();
                setOpen(false);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar widget
            </button>
          ) : null}
          {onDuplicate ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--surface-muted)]"
              onClick={() => {
                onDuplicate();
                setOpen(false);
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicar
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-xs text-red-600 hover:bg-red-50"
              onClick={() => {
                onRemove();
                setOpen(false);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const WidgetCard = React.memo(function WidgetCard({
  widget,
  children,
  className = "",
  showActions = true,
  status,
  sourceLabel,
  onEdit,
  onDuplicate,
  onRemove,
}) {
  const typeMeta = getWidgetTypeMeta(widget?.widgetType);
  const TitleIcon = typeMeta?.icon;
  const sourceMeta = getSourceMeta(widget?.source);
  const resolvedSourceLabel = sourceLabel || sourceMeta?.label || "";
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  useEffect(() => {
    if (status === "LIVE") {
      setLastUpdatedAt(Date.now());
    }
  }, [status]);

  return (
    <div
      className={cn(
        "group flex h-full flex-col looker-card p-4 transition hover:border-[rgba(31,111,235,0.35)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--surface-muted)] text-[var(--text)]">
            {TitleIcon ? <TitleIcon className="h-4 w-4" /> : null}
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">
              {widget?.title || "Widget"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{typeMeta?.label || "Widget"}</Badge>
              {widget?.source ? <SourcePill source={widget.source} /> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {status ? (
              <WidgetStatusPill status={status} sourceLabel={resolvedSourceLabel} />
            ) : null}
            {showActions ? (
              <WidgetMenu onEdit={onEdit} onDuplicate={onDuplicate} onRemove={onRemove} />
            ) : null}
          </div>
          {status === "LIVE" && lastUpdatedAt ? (
            <span className="text-[11px] text-[var(--text-muted)]">
              Atualizado agora
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </div>
  );
});

export default WidgetCard;
