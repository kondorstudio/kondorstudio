import React, { useEffect, useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { ChevronDown } from "lucide-react";

const TYPE_OPTIONS = [
  { value: "income", label: "Receita (income)" },
  { value: "expense", label: "Despesa (expense)" },
  { value: "subscription", label: "Assinatura (subscription)" },
  { value: "other", label: "Outro" },
];

function MiniSelect({ value, onChange, options = [], placeholder }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const current =
    options.find((option) => option.value === value)?.label || placeholder;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full h-11 px-4 rounded-2xl border text-left text-sm font-medium flex items-center justify-between transition ${
          open
            ? "border-purple-300 bg-purple-50 text-purple-700"
            : "border-gray-200 bg-white text-gray-700 hover:border-purple-200"
        }`}
      >
        <span>{current}</span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute z-40 mt-2 w-full rounded-2xl border border-gray-100 bg-white shadow-xl py-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`w-full text-left px-4 py-2 text-sm transition ${
                option.value === value
                  ? "text-purple-700 bg-purple-50"
                  : "text-gray-600 hover:bg-gray-50"
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

export default function Financeformdialog({
  open,
  onClose,
  record,
  clients = [],
  initialType = "income",
}) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    clientId: "",
    type: initialType,
    amount: "",
    currency: "BRL",
    occurredAt: "",
    note: "",
    costName: "",
  });

  useEffect(() => {
    if (record) {
      setFormData({
        clientId: record.clientId || "",
        type: record.type || "income",
        amount:
          typeof record.amountCents === "number"
            ? (record.amountCents / 100).toString()
            : "",
        currency: record.currency || "BRL",
        occurredAt: record.occurredAt
          ? record.occurredAt.slice(0, 10)
          : "",
        note: record.note || "",
        costName: record.metadata?.costName || "",
      });
    } else {
      setFormData({
        clientId: "",
        type: initialType,
        amount: "",
        currency: "BRL",
        occurredAt: "",
        note: "",
        costName: "",
      });
    }
  }, [record, initialType, open]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      const amountNumber = parseFloat(
        (data.amount || "0").toString().replace(",", ".")
      );
      const amountCents = isNaN(amountNumber)
        ? 0
        : Math.round(amountNumber * 100);

      const metadata = { ...(record?.metadata || {}) };
      if (data.costName?.trim()) {
        metadata.costName = data.costName.trim();
      } else {
        delete metadata.costName;
      }

      const payload = {
        clientId: data.clientId || null,
        type: data.type,
        amountCents,
        currency: data.currency || "BRL",
        note: data.note || null,
        occurredAt: data.occurredAt
          ? new Date(data.occurredAt).toISOString()
          : new Date().toISOString(),
        metadata: Object.keys(metadata).length ? metadata : null,
      };

      if (record) {
        return base44.entities.FinancialRecord.update(record.id, payload);
      } else {
        return base44.entities.FinancialRecord.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      onClose();
    },
  });

  const handleChange = (field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {record ? "Editar lançamento" : "Novo lançamento"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cliente + Tipo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <MiniSelect
                value={formData.clientId}
                onChange={handleChange("clientId")}
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Selecione um cliente"
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de lançamento</Label>
              <MiniSelect
                value={formData.type}
                onChange={handleChange("type")}
                options={TYPE_OPTIONS}
                placeholder="Selecione o tipo"
              />
            </div>
          </div>

          {formData.type !== "income" && (
            <div className="space-y-2">
              <Label>Nome do custo</Label>
              <Input
                value={formData.costName}
                onChange={handleChange("costName")}
                placeholder="Ex: Assinatura Canva"
              />
            </div>
          )}

          {/* Valor + Data */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={handleChange("amount")}
                placeholder="Ex: 1500.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Data do lançamento</Label>
              <Input
                type="date"
                value={formData.occurredAt}
                onChange={handleChange("occurredAt")}
              />
            </div>
          </div>

          {/* Observação */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={formData.note}
              onChange={handleChange("note")}
              placeholder="Detalhes sobre o lançamento..."
              rows={3}
            />
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700"
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? "Salvando..."
                : record
                ? "Atualizar lançamento"
                : "Criar lançamento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
