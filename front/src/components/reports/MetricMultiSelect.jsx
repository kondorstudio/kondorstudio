import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/utils/classnames.js";

export default function MetricMultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = "Selecione metricas",
  emptyText = "Nenhuma metrica encontrada",
  className = "",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);

  const selectedMap = useMemo(() => {
    const map = new Map();
    options.forEach((option) => {
      map.set(option.value, option.label || option.value);
    });
    return map;
  }, [options]);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((option) =>
      String(option.label || option.value).toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  const handleSelect = (key) => {
    if (!onChange) return;
    if (value.includes(key)) {
      onChange(value.filter((item) => item !== key));
      return;
    }
    onChange([...value, key]);
  };

  const handleRemove = (key, event) => {
    event?.stopPropagation();
    if (!onChange) return;
    onChange(value.filter((item) => item !== key));
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={cn(
          "flex min-h-[44px] w-full flex-wrap items-center gap-2 rounded-[10px] border border-[var(--border)] " +
            "bg-white px-3 py-2 text-left text-sm text-[var(--text)] shadow-[var(--shadow-sm)] " +
            "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(31,111,235,0.2)]",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-blue-200"
        )}
      >
        {value.length ? (
          value.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
            >
              {selectedMap.get(item) || item}
              <button
                type="button"
                onClick={(event) => handleRemove(item, event)}
                className="rounded-full p-0.5 text-blue-500 hover:bg-blue-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-sm text-[var(--text-muted)]">{placeholder}</span>
        )}
        <span className="ml-auto flex items-center text-[var(--text-muted)]">
          <ChevronDown className={cn("h-4 w-4 transition", open ? "rotate-180" : "")} />
        </span>
      </button>

      {open ? (
        <div className="absolute z-30 mt-2 w-full rounded-[12px] border border-[var(--border)] bg-white shadow-[var(--shadow-md)]">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar metrica"
              className="h-8 flex-1 border-0 bg-transparent px-0 text-sm focus:ring-0"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const selected = value.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition",
                      selected
                        ? "bg-blue-50 text-blue-700"
                        : "text-[var(--text)] hover:bg-[var(--surface-muted)]"
                    )}
                  >
                    <span>{option.label || option.value}</span>
                    {selected ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-3 text-sm text-[var(--text-muted)]">
                {emptyText}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
