import React from "react";
import { Trash2, Plus } from "lucide-react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { Input } from "@/components/ui/input.jsx";
import { cn } from "@/utils/classnames.js";

const FILTER_FIELDS = [
  { value: "platform", label: "Plataforma" },
  { value: "account_id", label: "Conta" },
  { value: "campaign_id", label: "Campanha" },
];

const FILTER_OPERATORS = [
  { value: "eq", label: "Igual" },
  { value: "in", label: "Contem (lista)" },
];

function normalizeFilter(filter = {}) {
  const field = FILTER_FIELDS.some((item) => item.value === filter.field)
    ? filter.field
    : "platform";
  const op = FILTER_OPERATORS.some((item) => item.value === filter.op)
    ? filter.op
    : "eq";
  if (op === "in") {
    const list = Array.isArray(filter.value)
      ? filter.value.map((item) => String(item).trim()).filter(Boolean)
      : String(filter.value || "")
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean);
    return { field, op, value: list };
  }
  return { field, op, value: String(filter.value || "") };
}

function getFilterError(filter) {
  if (!filter?.field || !filter?.op) {
    return "Filtro incompleto";
  }
  if (filter.op === "in") {
    return Array.isArray(filter.value) && filter.value.length
      ? ""
      : "Informe ao menos um valor";
  }
  return String(filter.value || "").trim() ? "" : "Informe um valor";
}

export default function FilterBuilder({ filters, onChange }) {
  const current = Array.isArray(filters) ? filters.map(normalizeFilter) : [];

  const updateAt = (index, patch) => {
    const next = [...current];
    const prev = normalizeFilter(next[index] || {});
    const updated = normalizeFilter({ ...prev, ...patch });
    next[index] = updated;
    onChange(next);
  };

  const addFilter = () => {
    onChange([
      ...current,
      {
        field: "platform",
        op: "eq",
        value: "",
      },
    ]);
  };

  const removeAt = (index) => {
    onChange(current.filter((_, idx) => idx !== index));
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Filtros do widget
        </label>
        <button
          type="button"
          onClick={addFilter}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </button>
      </div>

      <div className="space-y-3">
        {current.map((filter, index) => {
          const error = getFilterError(filter);
          return (
            <div
              key={`${filter.field}-${filter.op}-${index}`}
              className={cn(
                "rounded-[12px] border bg-[var(--surface-muted)] p-3",
                error ? "border-rose-200" : "border-[var(--border)]"
              )}
            >
              <div className="grid gap-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Campo
                </label>
                <Select
                  value={filter.field}
                  onValueChange={(value) => updateAt(index, { field: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Campo" />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTER_FIELDS.map((field) => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Operacao
                </label>
                <Select
                  value={filter.op}
                  onValueChange={(value) =>
                    updateAt(index, {
                      op: value,
                      value: value === "in" ? [] : "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Operacao" />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTER_OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Valor
                </label>
                {filter.op === "in" ? (
                  <textarea
                    className="min-h-[88px] rounded-[12px] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                    value={Array.isArray(filter.value) ? filter.value.join("\n") : ""}
                    onChange={(event) => {
                      const values = event.target.value
                        .split(/\r?\n|,/)
                        .map((item) => item.trim())
                        .filter(Boolean);
                      updateAt(index, { value: values });
                    }}
                    placeholder={"Um valor por linha\nou separado por virgula"}
                  />
                ) : (
                  <Input
                    value={String(filter.value || "")}
                    onChange={(event) =>
                      updateAt(index, { value: event.target.value })
                    }
                    placeholder="Valor exato"
                  />
                )}
              </div>

              <div className="mt-2 flex items-center justify-between">
                {error ? <p className="text-xs text-rose-600">{error}</p> : <span />}
                <button
                  type="button"
                  aria-label="Remover filtro"
                  onClick={() => removeAt(index)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-rose-200 text-rose-600 transition hover:border-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!current.length ? (
        <p className="text-xs text-[var(--text-muted)]">Nenhum filtro configurado.</p>
      ) : null}
    </div>
  );
}
