import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, CalendarDays } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
} from "@/components/ui/select";

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

export default function TaskCard({
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
    <Card className="border border-purple-100 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <div>
            <CardTitle className="text-sm font-semibold text-gray-900 line-clamp-2">
              {task.title || "Tarefa sem título"}
            </CardTitle>
            {client && (
              <p className="text-xs text-gray-500 mt-1">
                {client.name}
              </p>
            )}
          </div>
          <Badge
            variant="outline"
            className="text-[10px] border-purple-200 text-purple-700"
          >
            {formatStatusLabel(task.status)}
          </Badge>
        </div>
      </CardHeader>

      {task.description && (
        <CardContent className="pb-2">
          <p className="text-xs text-gray-600 line-clamp-3 whitespace-pre-line">
            {task.description}
          </p>
        </CardContent>
      )}

      <CardFooter className="pt-2 flex flex-col gap-2">
        {dueLabel && (
          <div className="flex items-center justify-between w-full text-[11px] text-gray-500">
            <div className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              <span>Prazo: {dueLabel}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 w-full">
          <Select
            value={task.status}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="h-8 text-xs w-[140px]">
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
              className="h-8 w-8 border-purple-200"
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
        </div>
      </CardFooter>
    </Card>
  );
}
