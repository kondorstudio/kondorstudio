import React from "react";
import { MoreHorizontal, Copy, Trash2 } from "lucide-react";

export default function WidgetContextMenu({
  onDuplicate,
  onDelete,
  deleteLabel = "Excluir widget",
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event) => {
      if (!rootRef.current || rootRef.current.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Acoes do widget"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-muted)] transition hover:border-slate-300 hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Acoes do widget"
          className="absolute right-0 z-40 mt-2 w-44 rounded-[12px] border border-[var(--border)] bg-white p-1 shadow-[var(--shadow-md)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onDuplicate?.();
            }}
            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <Copy className="h-4 w-4 text-[var(--primary)]" />
            Duplicar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onDelete?.();
            }}
            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            <Trash2 className="h-4 w-4" />
            {deleteLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
