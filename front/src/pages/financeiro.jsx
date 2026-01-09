import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "../apiClient/base44Client";
import { Button } from "@/components/ui/button.jsx";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { Plus } from "lucide-react";
import Financeformdialog from "../components/finance/financeformdialog.jsx";
import Financetable from "../components/finance/financetable.jsx";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card.jsx";

function formatCurrencyBRL(value) {
  if (typeof value !== "number") return "R$ 0,00";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function Financeiro() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [defaultType, setDefaultType] = useState("income");
  const queryClient = useQueryClient();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["finance"],
    queryFn: () => base44.entities.FinancialRecord.list(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.FinancialRecord.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
  });

  const handleNew = () => {
    setEditingRecord(null);
    setDefaultType("income");
    setDialogOpen(true);
  };

  const handleNewCost = () => {
    setEditingRecord(null);
    setDefaultType("expense");
    setDialogOpen(true);
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (confirm("Tem certeza que deseja excluir este lançamento?")) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingRecord(null);
  };

  // Resumo simples: soma income vs custos vs outros
  let totalIncome = 0;
  let totalCosts = 0;
  let totalOthers = 0;

  records.forEach((r) => {
    const amount = (r.amountCents || 0) / 100;
    const normalizedType = (r.type || "").toLowerCase();
    const isIncome =
      normalizedType.includes("income") ||
      normalizedType.includes("revenue") ||
      normalizedType.includes("recurring");
    const isExpense =
      normalizedType.includes("expense") ||
      normalizedType.includes("cost") ||
      normalizedType.includes("subscription") ||
      normalizedType.includes("desp");

    if (isIncome) {
      totalIncome += amount;
    } else if (isExpense) {
      totalCosts += amount;
    } else {
      totalOthers += amount;
    }
  });

  const balance = totalIncome - totalCosts;

  return (
    <PageShell>
      <PageHeader
        title="Financeiro"
        subtitle="Acompanhe receitas, custos e saldo da agencia em um so painel."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" leftIcon={Plus} onClick={handleNewCost}>
              Registrar custo
            </Button>
            <Button size="lg" leftIcon={Plus} onClick={handleNew}>
              Registrar receita
            </Button>
          </div>
        }
      />

      <div className="mt-8 space-y-10">
        <div className="grid gap-6 lg:grid-cols-12">
          <Card
            className={`relative overflow-hidden lg:col-span-7 ${
              balance >= 0 ? "bg-emerald-50/60" : "bg-rose-50/60"
            }`}
          >
            <div
              className={`absolute inset-x-0 top-0 h-1 ${
                balance >= 0 ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Saldo (receitas - custos)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-3xl font-semibold md:text-4xl ${
                  balance >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {formatCurrencyBRL(balance)}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden lg:col-span-5">
            <div className="absolute inset-x-0 top-0 h-1 bg-emerald-500" />
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Receitas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-emerald-700">
                {formatCurrencyBRL(totalIncome)}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden lg:col-span-4">
            <div className="absolute inset-x-0 top-0 h-1 bg-rose-500" />
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Custos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-rose-700">
                {formatCurrencyBRL(totalCosts)}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden lg:col-span-4">
            <div className="absolute inset-x-0 top-0 h-1 bg-slate-400" />
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Outros lançamentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-[var(--text)]">
                {formatCurrencyBRL(totalOthers)}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden lg:col-span-4">
            <div className="absolute inset-x-0 top-0 h-1 bg-[var(--primary)]" />
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Total de lançamentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-[var(--text)]">
                {records.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de lançamentos */}
        <Financetable
          records={records}
          clients={clients}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onCreate={handleNew}
        />

        <Financeformdialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          record={editingRecord}
          clients={clients}
          initialType={defaultType}
        />
      </div>
    </PageShell>
  );
}
