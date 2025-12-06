import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Button } from "@/components/ui/button.jsx";
import Taskcard from "./taskcard.jsx";

const DEFAULT_COLUMNS = [
  { status: "TODO", title: "A fazer" },
  { status: "IN_PROGRESS", title: "Em andamento" },
  { status: "REVIEW", title: "Revisão" },
  { status: "DONE", title: "Concluída" },
  { status: "BLOCKED", title: "Bloqueada" },
];

export default function Taskboard({
  tasks = [],
  clients = [],
  isLoading,
  onEdit,
  onDelete,
  onStatusChange,
}) {
  const clientMap = React.useMemo(() => {
    const map = new Map();
    (clients || []).forEach((client) => {
      if (client?.id) map.set(client.id, client);
    });
    return map;
  }, [clients]);

  const tasksByStatus = React.useMemo(() => {
    const grouped = new Map();
    (tasks || []).forEach((task) => {
      const bucket = grouped.get(task.status) || [];
      bucket.push(task);
      grouped.set(task.status, bucket);
    });
    return grouped;
  }, [tasks]);

  const getClient = (id) => {
    if (!id) return null;
    return clientMap.get(id) || null;
  };

  const allStatuses = Array.from(new Set(tasks.map((t) => t.status).filter(Boolean)));
  const columnsFromData = allStatuses
    .filter((s) => !DEFAULT_COLUMNS.find((c) => c.status === s))
    .map((s) => ({ status: s, title: s }));

  const columns = [...DEFAULT_COLUMNS, ...columnsFromData];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {columns.map((col) => (
          <Card key={col.status} className="border-dashed border-purple-200">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-800">
                {col.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 bg-gray-100 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {columns.map((col) => {
        const columnTasks = tasksByStatus.get(col.status) || [];

        return (
          <Card key={col.status} className="bg-slate-50/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-800">
                  {col.title}
                </CardTitle>
                <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                  {columnTasks.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {columnTasks.length === 0 ? (
                <div className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg p-3 text-center">
                  Nenhuma tarefa aqui ainda.
                </div>
              ) : (
                columnTasks.map((task) => (
                  <Taskcard
                    key={task.id}
                    task={task}
                    client={getClient(task.clientId)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onStatusChange={onStatusChange}
                  />
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
