import React, { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { cn } from "@/utils/classnames.js";

function reorder(list, fromIndex, toIndex) {
  if (fromIndex === toIndex) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export default function SortableChips({
  items = [],
  onChange,
  getLabel,
  className = "",
}) {
  const [dragging, setDragging] = useState(null);

  const handleDrop = (target) => {
    if (dragging === null || dragging === target) return;
    const fromIndex = items.findIndex((item) => item === dragging);
    const toIndex = items.findIndex((item) => item === target);
    if (fromIndex < 0 || toIndex < 0) return;
    onChange?.(reorder(items, fromIndex, toIndex));
  };

  const moveItem = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    onChange?.(reorder(items, index, nextIndex));
  };

  if (!items.length) {
    return (
      <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-xs text-[var(--text-muted)]">
        Nenhuma metrica selecionada.
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((item, index) => (
        <div
          key={item}
          draggable
          onDragStart={() => setDragging(item)}
          onDragEnd={() => setDragging(null)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => handleDrop(item)}
          className={cn(
            "flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700",
            dragging === item ? "opacity-60" : ""
          )}
        >
          <GripVertical className="h-3.5 w-3.5 text-blue-400" />
          <span>{getLabel ? getLabel(item) : item}</span>
          <div className="flex items-center gap-1 text-blue-500">
            <button
              type="button"
              onClick={() => moveItem(index, -1)}
              className="rounded-full p-0.5 hover:bg-blue-100"
              aria-label="Mover para cima"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => moveItem(index, 1)}
              className="rounded-full p-0.5 hover:bg-blue-100"
              aria-label="Mover para baixo"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
