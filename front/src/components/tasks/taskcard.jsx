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
import { Pencil, Trash2, CalendarDays } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
} from "@/components/ui/select.jsx";

const STATUS_OPTIONS = [
  { value: "TODO", label: "A fazer" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "REVIEW", label: "Revisão" },
  { value: "DONE", label: "Concluída" },
  { value: "BLOCKED", label: "Bloqueada" },
];

function formatStatusLabel(value) {
  const found = STATUS_OPTIONS.find((s) => s.value === value);
  return found ? found.label : value;
}

function formatDate(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export default function Taskcard({
  task,
  client,
  onEdit,
  onDelete,
  onStatusChange,
}) {
  const handleStatusChange = (newStatus) => {
    if (!onStatusChange) return;
    onStatusChange(task.id, newStatus);
  };

  const dueLabel = formatDate(task.dueDate);

  return (
    <Card className="border border-transparent bg-white/95 shadow-lg shadow-purple-50 rounded-2xl hover:-translate-y-0.5 transition transform">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-3">
          <div>
            <CardTitle className="text-sm font-semibold text-gray-900 line-clamp-2">
              {task.title || "Tarefa sem título"}
            </CardTitle>
            {client && (
              <p className="text-[11px] text-gray-500 mt-1">{client.name}</p>
            )}
          </div>
          <Badge className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100">
            {formatStatusLabel(task.status)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pb-0">
        {task.description ? (
          <p className="text-xs text-gray-600 line-clamp-3 whitespace-pre-line">
            {task.description}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">Sem descrição</p>
        )}

        {dueLabel && (
          <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-3 bg-gray-50 rounded-lg px-2 py-1 w-fit">
            <CalendarDays className="w-3 h-3" />
            <span>Prazo {dueLabel}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-4 flex items-center justify-between gap-3">
        <Select value={task.status} onValueChange={handleStatusChange}>
          <SelectTrigger className="h-8 text-xs w-[160px] border-purple-200">
            <SelectValue placeholder="Mudar status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-purple-200 hover:bg-purple-50"
            onClick={() => onEdit && onEdit(task)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => onDelete && onDelete(task.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
