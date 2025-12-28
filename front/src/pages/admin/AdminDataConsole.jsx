// front/src/pages/admin/AdminDataConsole.jsx
import React, { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Loader2, Database } from "lucide-react";
import { hasAdminPermission } from "@/utils/adminPermissions";

export default function AdminDataConsole() {
  const authData = base44.storage.loadAuthFromStorage?.();
  const currentRole = authData?.user?.role;
  const canWrite = hasAdminPermission(currentRole, "data.write");

  const [sql, setSql] = useState("");
  const [mode, setMode] = useState("query");
  const [confirmExecute, setConfirmExecute] = useState(false);
  const [result, setResult] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const { data: tablesData, isLoading: loadingTables } = useQuery({
    queryKey: ["admin-data-tables"],
    queryFn: () => base44.admin.dataTables(),
  });

  const queryMutation = useMutation({
    mutationFn: (payload) => base44.admin.dataQuery(payload),
    onSuccess: (data) => {
      setResult(data);
      setFeedback({ type: "success", message: "Query executada com sucesso." });
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error?.data?.error || "Falha ao executar query.",
      });
    },
  });

  const executeMutation = useMutation({
    mutationFn: (payload) => base44.admin.dataExecute(payload),
    onSuccess: (data) => {
      setResult(data);
      setFeedback({ type: "success", message: "SQL executado com sucesso." });
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error?.data?.error || "Falha ao executar SQL.",
      });
    },
  });

  useEffect(() => {
    setFeedback(null);
    setResult(null);
    setConfirmExecute(false);
  }, [mode]);

  const handleRun = async () => {
    setFeedback(null);
    if (!sql.trim()) {
      setFeedback({ type: "error", message: "SQL nao pode estar vazio." });
      return;
    }
    if (mode === "execute" && !confirmExecute) {
      setFeedback({ type: "error", message: "Confirme a execucao primeiro." });
      return;
    }
    if (mode === "execute") {
      await executeMutation.mutateAsync({ sql, confirm: true });
    } else {
      await queryMutation.mutateAsync({ sql });
    }
  };

  const tables = tablesData?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-gray-500">Data Studio</p>
        <h1 className="text-3xl font-bold text-gray-900">Console SQL</h1>
        <p className="text-gray-600">
          Consulta direta no banco com auditoria. Use com cautela.
        </p>
      </div>

      {feedback && (
        <div
          className={
            "text-sm rounded-lg border px-4 py-2 " +
            (feedback.type === "success"
              ? "border-emerald-200 text-emerald-700 bg-emerald-50"
              : "border-red-200 text-red-700 bg-red-50")
          }
        >
          {feedback.message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-base text-gray-900">SQL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMode("query")}
                className={
                  "rounded-md px-3 py-1 text-xs font-medium border " +
                  (mode === "query"
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-white text-gray-600 border-gray-200")
                }
              >
                Query (SELECT)
              </button>
              <button
                type="button"
                onClick={() => setMode("execute")}
                disabled={!canWrite}
                className={
                  "rounded-md px-3 py-1 text-xs font-medium border " +
                  (mode === "execute"
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-white text-gray-600 border-gray-200") +
                  (!canWrite ? " opacity-50 cursor-not-allowed" : "")
                }
              >
                Execute (WRITE)
              </button>
              {!canWrite && (
                <Badge variant="outline" className="text-xs">
                  Sem permissao de escrita
                </Badge>
              )}
            </div>

            <textarea
              className="w-full min-h-[240px] rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder="SELECT * FROM users LIMIT 50;"
            />

            {mode === "execute" && (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={confirmExecute}
                  onChange={(e) => setConfirmExecute(e.target.checked)}
                />
                Confirmo que desejo executar comandos de escrita.
              </label>
            )}

            <Button
              type="button"
              onClick={handleRun}
              disabled={queryMutation.isLoading || executeMutation.isLoading}
            >
              {queryMutation.isLoading || executeMutation.isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Executando...
                </>
              ) : (
                "Executar"
              )}
            </Button>

            {result && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 overflow-auto">
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-gray-200 h-fit">
          <CardHeader>
            <CardTitle className="text-base text-gray-900">Tabelas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingTables && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando tabelas...
              </div>
            )}
            {!loadingTables && tables.length === 0 && (
              <p className="text-sm text-gray-500">Nenhuma tabela encontrada.</p>
            )}
            {!loadingTables &&
              tables.map((table) => (
                <div
                  key={table.table_name || table.tableName || table.name}
                  className="flex items-center gap-2 text-xs text-gray-600"
                >
                  <Database className="w-3 h-3 text-purple-500" />
                  {table.table_name || table.tableName || table.name}
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
