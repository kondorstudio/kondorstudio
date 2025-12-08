import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input.jsx";

const STATUS_FILTERS = [
  { value: "all", label: "Todos os status" },
  { value: "in_use", label: "Em uso" },
  { value: "approved", label: "Aprovado" },
  { value: "archived", label: "Arquivado" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "Todos os tipos" },
  { value: "image", label: "Imagens" },
  { value: "video", label: "Vídeos" },
  { value: "gif", label: "GIFs" },
];

function FilterChip({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const currentLabel =
    options.find((option) => option.value === value)?.label || label;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className={`inline-flex items-center gap-2 px-4 h-11 rounded-full border text-sm font-semibold transition ${
          open
            ? "border-purple-300 bg-purple-50 text-purple-700"
            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
        }`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {currentLabel}
        <ChevronDown className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-52 rounded-2xl border border-slate-100 bg-white shadow-xl py-2 z-30">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`w-full text-left px-4 py-2 text-sm font-medium transition hover:bg-purple-50 ${
                value === option.value ? "text-purple-700" : "text-slate-600"
              }`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FiltersBar({
  searchTerm,
  onSearchChange,
  filterClient,
  onClientChange,
  clients,
  filterType,
  onTypeChange,
  filterStatus,
  onStatusChange,
  total,
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-4 lg:p-6 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar criativos..."
            className="h-12 pl-11 rounded-2xl border-slate-200"
          />
        </div>

        <div className="flex items-center gap-3 lg:w-auto">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 bg-slate-100 px-4 py-2 rounded-2xl hover:bg-slate-200 transition"
          >
            <Filter className="w-4 h-4" />
            {expanded ? "Ocultar filtros" : "Mostrar filtros"}
          </button>
          <div className="text-sm text-slate-500 font-medium">
            {total} criativo{total === 1 ? "" : "s"} encontrados
          </div>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-wrap gap-3">
          <FilterChip
            label="Todos os clientes"
            value={filterClient}
            options={[
              { value: "all", label: "Todos os clientes" },
              ...clients.map((client) => ({
                value: client.id,
                label: client.name,
              })),
            ]}
            onChange={onClientChange}
          />

          <FilterChip
            label="Todos os tipos"
            value={filterType}
            options={TYPE_OPTIONS}
            onChange={onTypeChange}
          />

          <FilterChip
            label="Todos os status"
            value={filterStatus}
            options={STATUS_FILTERS}
            onChange={onStatusChange}
          />
        </div>
      )}
    </div>
  );
}

FiltersBar.defaultProps = {
  clients: [],
  total: 0,
};
