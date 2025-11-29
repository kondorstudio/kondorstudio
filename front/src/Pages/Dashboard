import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../apiClient/base44Client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react";

function formatCurrencyBRL(value) {
  if (typeof value !== "number") return "R$ 0,00";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function Dashboard() {
  const {
    data: summary,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => base44.entities.Dashboard.summary({ range: "7d" }),
  });

  const totals = summary?.totals || { clients: 0, posts: 0, tasks: 0 };
  const postsByStatus = summary?.postsByStatus || {};
  const tasksByStatus = summary?.tasksByStatus || {};
  const upcomingTasks = summary?.upcomingTasks || [];
  const finance = summary?.finance || [];
  const metrics = summary?.metrics || [];

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Visão Geral
            </h1>
            <p className="text-gray-600">
              Resumo dos últimos {summary?.rangeDays || 7} dias.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Cards principais */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-500">
                Clientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {totals.clients}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Contas ativas na sua agência
              </p>
            </CardContent>
          </Card>

          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-500">
                Posts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {totals.posts}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Posts no pipeline (todos os status)
              </p>
            </CardContent>
          </Card>

          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-500">
                Tarefas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {totals.tasks}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Itens no board de tarefas
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Status de posts e tarefas */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-800">
                Status dos Posts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.keys(postsByStatus).length === 0 ? (
                <p className="text-xs text-gray-500">
                  Nenhum post cadastrado ainda.
                </p>
              ) : (
                Object.entries(postsByStatus).map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-600">{status}</span>
                    <Badge variant="outline" className="border-purple-200">
                      {count}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-800">
                Status das Tarefas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.keys(tasksByStatus).length === 0 ? (
                <p className="text-xs text-gray-500">
                  Nenhuma tarefa cadastrada ainda.
                </p>
              ) : (
                Object.entries(tasksByStatus).map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-600">{status}</span>
                    <Badge variant="outline" className="border-purple-200">
                      {count}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Próximas tarefas + financeiro */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Próximas tarefas */}
          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-800">
                Próximas tarefas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingTasks.length === 0 ? (
                <p className="text-xs text-gray-500">
                  Nenhuma tarefa com prazo definido.
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {upcomingTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-col border border-gray-100 rounded-lg p-2.5 bg-white"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-800 line-clamp-1">
                          {task.title}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-purple-200"
                        >
                          {task.status}
                        </Badge>
                      </div>
                      {task.dueDate && (
                        <span className="text-[11px] text-gray-500 mt-1">
                          Prazo:{" "}
                          {new Date(task.dueDate).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Financeiro simples */}
          <Card className="border border-purple-100">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-800">
                Resumo financeiro (últimos {summary?.rangeDays || 7} dias)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {finance.length === 0 ? (
                <p className="text-xs text-gray-500">
                  Nenhum lançamento financeiro registrado neste período.
                </p>
              ) : (
                finance.map((item) => {
                  const isIncome = (item.type || "").toLowerCase().includes("income");
                  const Icon = isIncome ? ArrowUpRight : ArrowDownRight;
                  return (
                    <div
                      key={item.type}
                      className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 bg-white"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center ${
                            isIncome ? "bg-green-50" : "bg-red-50"
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 ${
                              isIncome ? "text-green-500" : "text-red-500"
                            }`}
                          />
                        </div>
                        <span className="text-gray-700 font-medium">
                          {item.type}
                        </span>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          isIncome ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrencyBRL(item.amount)}
                      </span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Métricas de mídia paga / social */}
        <Card className="border border-purple-100">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-gray-800">
              Métricas agregadas (ads / social)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.length === 0 ? (
              <p className="text-xs text-gray-500">
                Nenhuma métrica registrada neste período.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 text-sm">
                {metrics.map((m, idx) => (
                  <div
                    key={`${m.source}-${m.key}-${idx}`}
                    className="border border-gray-100 rounded-lg px-3 py-2 bg-white"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700 font-medium">
                        {m.source} · {m.key}
                      </span>
                    </div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
