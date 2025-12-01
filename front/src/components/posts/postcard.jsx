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
import { Pencil } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "PENDING_APPROVAL", label: "Aguardando aprovação" },
  { value: "APPROVED", label: "Aprovado" },
  { value: "SCHEDULED", label: "Programado" },
  { value: "PUBLISHED", label: "Publicado" },
  { value: "ARCHIVED", label: "Arquivado" },
];

function formatStatusLabel(value) {
  const found = STATUS_OPTIONS.find((s) => s.value === value);
  return found ? found.label : value;
}

function formatDate(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Postcard({ post, client, onEdit, onStatusChange }) {
  const handleStatusChange = (newStatus) => {
    if (!onStatusChange) return;
    onStatusChange(post.id, newStatus);
  };

  const scheduledLabel = formatDate(post.scheduledAt);

  return (
    <Card className="border border-purple-100 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <div>
            <CardTitle className="text-sm font-semibold text-gray-900 line-clamp-2">
              {post.title || "Post sem título"}
            </CardTitle>
            {client && (
              <p className="text-xs text-gray-500 mt-1">
                {client.name}
              </p>
            )}
          </div>
          <Badge variant="outline" className="text-[10px] border-purple-200 text-purple-700">
            {formatStatusLabel(post.status)}
          </Badge>
        </div>
      </CardHeader>

      {post.body && (
        <CardContent className="pb-2">
          <p className="text-xs text-gray-600 line-clamp-3 whitespace-pre-line">
            {post.body}
          </p>
        </CardContent>
      )}

      <CardFooter className="pt-2 flex flex-col gap-2">
        {scheduledLabel && (
          <div className="w-full text-[11px] text-gray-500">
            Programado para: <span className="font-medium">{scheduledLabel}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 w-full">
          <Select
            value={post.status}
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

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-purple-200"
            onClick={() => onEdit && onEdit(post)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
