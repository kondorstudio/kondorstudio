import React from "react";
import Taskcard from "./taskcard.jsx";

const BASE_COLUMNS = [
  {
    status: "TODO",
    title: "A fazer",
    description: "Ideias e cards recém criados.",
    accent: "from-blue-50 to-white",
  },
  {
    status: "IN_PROGRESS",
    title: "Em andamento",
    description: "Equipe atuando agora.",
    accent: "from-purple-50 to-white",
  },
  {
    status: "REVIEW",
    title: "Revisão",
    description: "Esperando revisão/cliente.",
    accent: "from-amber-50 to-white",
  },
  {
    status: "DONE",
    title: "Concluída",
    description: "Prontas e entregues.",
    accent: "from-emerald-50 to-white",
  },
  {
    status: "BLOCKED",
    title: "Bloqueada",
    description: "Aguardando dependências.",
    accent: "from-rose-50 to-white",
  },
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

  const allStatuses = Array.from(
    new Set(tasks.map((t) => t.status).filter(Boolean))
  );
  const dynamicColumns = allStatuses
    .filter((s) => !BASE_COLUMNS.find((col) => col.status === s))
    .map((s) => ({
      status: s,
      title: s,
      description: "Status personalizado",
      accent: "from-gray-50 to-white",
    }));

  const columns = [...BASE_COLUMNS, ...dynamicColumns];

  const renderSkeleton = () => (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-20 rounded-2xl bg-slate-200/60 animate-pulse"
        />
      ))}
    </div>
  );

  return (
    <div className="flex gap-5 overflow-x-auto pb-2">
      {columns.map((col) => {
        const columnTasks = tasksByStatus.get(col.status) || [];

        return (
          <div key={col.status} className="min-w-[280px] flex-shrink-0">
            <div
              className={`flex h-full flex-col rounded-3xl border border-slate-200 bg-gradient-to-b ${col.accent} p-5 shadow-sm shadow-slate-100 backdrop-blur`}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {col.title}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {col.description}
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow">
                  {columnTasks.length}
                </span>
              </div>

              <div
                className="flex-1 space-y-4 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
                style={{ maxHeight: "calc(100vh - 260px)" }}
              >
                {isLoading
                  ? renderSkeleton()
                  : columnTasks.length === 0
                  ? (
                    <div className="rounded-2xl border border-dashed border-white/70 bg-white/60 px-4 py-6 text-center text-xs text-slate-400">
                      Nenhuma tarefa nesta coluna.
                    </div>
                    )
                  : columnTasks.map((task) => (
                      <Taskcard
                        key={task.id}
                        task={task}
                        client={getClient(task.clientId)}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onStatusChange={onStatusChange}
                      />
                    ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
