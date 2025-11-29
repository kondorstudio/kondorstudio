import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";

function formatCurrencyBRL(value) {
  if (typeof value !== "number") return "R$ 0,00";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getClientName(clients, id) {
  if (!id) return "-";
  const c = clients.find((cl) => cl.id === id);
  return c ? c.name : "-";
}

function formatDate(dt) {
  if (!dt) return "-";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default function FinanceTable({
  records = [],
  clients = [],
  isLoading,
  onEdit,
  onDelete,
}) {
  if (isLoading) {
    return (
      <Card className="border border-purple-100">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-gray-800">
            Lançamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-10 bg-gray-100 animate-pulse rounded-lg"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-purple-100">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-gray-800">
          Lançamentos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhum lançamento financeiro cadastrado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Valor</th>
                  <th className="py-2 pr-4">Observações</th>
                  <th className="py-2 pr-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const amount = (r.amountCents || 0) / 100;
                  const isIncome = (r.type || "")
                    .toLowerCase()
                    .includes("income");

                  return (
                    <tr
                      key={r.id}
                      className="border-b border-gray-50 hover:bg-gray-50/80"
                    >
                      <td className="py-2 pr-4 text-gray-700">
                        {formatDate(r.occurredAt)}
                      </td>
                      <td className="py-2 pr-4 text-gray-700">
                        {getClientName(clients, r.clientId)}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant="outline"
                          className={
                            isIncome
                              ? "border-emerald-200 text-emerald-700"
                              : "border-gray-200 text-gray-700"
                          }
                        >
                          {r.type}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 font-semibold">
                        <span
                          className={
                            isIncome ? "text-emerald-600" : "text-gray-900"
                          }
                        >
                          {formatCurrencyBRL(amount)}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-700 max-w-xs">
                        <span className="line-clamp-2">
                          {r.note || "-"}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 border-purple-200"
                            onClick={() => onEdit && onEdit(r)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => onDelete && onDelete(r.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
