import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "../apiClient/base44Client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Financeformdialog from "../components/finance/financeformdialog.jsx";
import Financetable from "../components/finance/financetable.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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

  // Resumo simples: soma income vs outros
  let totalIncome = 0;
  let totalOthers = 0;

  records.forEach((r) => {
    const amount = (r.amountCents || 0) / 100;
    const isIncome = (r.type || "").toLowerCase().includes("income");
    if (isIncome) {
      totalIncome += amount;
    } else {
      totalOthers += amount;
    }
  });

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Financeiro
            </h1>
            <p className="text-gray-600">
              Acompanhe os lançamentos financeiros por cliente.
            </p>
          </div>
          <Button
            onClick={handleNew}
            className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo lançamento
          </Button>
        </div>

        {/* Cards de resumo */}
        <div className="grid gap-4 md:grid-cols-3">
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
        />
      </div>
    </div>
  );
}
