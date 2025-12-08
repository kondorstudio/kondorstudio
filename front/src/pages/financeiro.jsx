import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "../apiClient/base44Client";
import { Button } from "@/components/ui/button.jsx";
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
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Financeiro
            </h1>
            <p className="text-gray-600">
              Acompanhe os lançamentos financeiros por cliente.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleNewCost}
              variant="outline"
              className="rounded-full border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo custo
            </Button>
            <Button
              onClick={handleNew}
              className="rounded-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo lançamento
            </Button>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-500">
                Receitas (income)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {formatCurrencyBRL(totalIncome)}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-500">
                Custos (expense)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">
                {formatCurrencyBRL(totalCosts)}
              </div>
            </CardContent>
          </Card>
          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-500">
                Outros lançamentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrencyBRL(totalOthers)}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-500">
                Total de lançamentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {records.length}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-500">
                Saldo (receitas - custos)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  balance >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatCurrencyBRL(balance)}
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
        />

        <Financeformdialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          record={editingRecord}
          clients={clients}
          initialType={defaultType}
        />
      </div>
    </div>
  );
}
