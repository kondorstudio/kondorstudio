import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "../../apiClient/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
} from "@/components/ui/select";

const TYPE_OPTIONS = [
  { value: "income", label: "Receita (income)" },
  { value: "expense", label: "Despesa (expense)" },
  { value: "subscription", label: "Assinatura (subscription)" },
  { value: "other", label: "Outro" },
];

export default function FinanceFormDialog({ open, onClose, record, clients = [] }) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    clientId: "",
    type: "income",
    amount: "",
    currency: "BRL",
    occurredAt: "",
    note: "",
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
      });
    } else {
      setFormData({
        clientId: "",
        type: "income",
        amount: "",
        currency: "BRL",
        occurredAt: "",
        note: "",
      });
    }
  }, [record]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      const amountNumber = parseFloat(
        (data.amount || "0").toString().replace(",", ".")
      );
      const amountCents = isNaN(amountNumber)
        ? 0
        : Math.round(amountNumber * 100);

      const payload = {
        clientId: data.clientId || null,
        type: data.type,
        amountCents,
        currency: data.currency || "BRL",
        note: data.note || null,
        occurredAt: data.occurredAt
          ? new Date(data.occurredAt).toISOString()
          : new Date().toISOString(),
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
              <Select
                value={formData.clientId}
                onValueChange={handleChange("clientId")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de lançamento</Label>
              <Select
                value={formData.type}
                onValueChange={handleChange("type")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

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
