import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Pencil, CalendarDays } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select.jsx";

const STATUS_OPTIONS = [
  { value: "TODO", label: "Rascunho" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "REVIEW", label: "Revisão" },
  { value: "DONE", label: "Concluída" },
  { value: "BLOCKED", label: "Bloqueada" },
];

const STATUS_STYLES = {
  TODO: { bar: "#c4b5fd", badge: "bg-purple-50 text-purple-700" },
  IN_PROGRESS: { bar: "#a78bfa", badge: "bg-indigo-50 text-indigo-700" },
  REVIEW: { bar: "#fcd34d", badge: "bg-amber-50 text-amber-700" },
  DONE: { bar: "#34d399", badge: "bg-emerald-50 text-emerald-700" },
  BLOCKED: { bar: "#fb7185", badge: "bg-rose-50 text-rose-700" },
};

function formatStatusLabel(value) {
  const found = STATUS_OPTIONS.find((opt) => opt.value === value);
  return found ? found.label : value;
}

function formatDate(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export default function Taskcard({
  task,
  client,
  onEdit,
  onStatusChange,
  onDelete,
}) {
  const dueLabel = formatDate(task.dueDate);
  const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES.TODO;
  const handleStatusChange = (value) => {
    if (!onStatusChange) return;
    onStatusChange(task.id, value);
  };

  return (
    <Card className="relative overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_10px_30px_-22px_rgba(109,40,217,0.8)]">
      <span
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: statusStyle.bar }}
      />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-gray-900 line-clamp-2">
              {task.title || "Tarefa sem título"}
            </CardTitle>
            {client && (
              <p className="text-xs text-gray-500 mt-1">{client.name}</p>
            )}
          </div>
          <Badge
            className={`text-[10px] border border-transparent ${statusStyle.badge}`}
          >
            {formatStatusLabel(task.status)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pb-0">
        {task.description ? (
          <p className="text-xs text-gray-600 whitespace-pre-line line-clamp-3">
            {task.description}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">Sem descrição</p>
        )}

        {dueLabel && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 text-[11px] text-gray-500">
            <CalendarDays className="w-3.5 h-3.5" />
            Prazo {dueLabel}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Select value={task.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-9 w-full rounded-full border border-purple-200 text-xs font-medium text-purple-700 bg-white sm:w-[170px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            className="w-full rounded-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-xs font-semibold sm:w-auto"
            onClick={() => onEdit && onEdit(task)}
          >
            <Pencil className="w-4 h-4 mr-2" />
            Editar
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
