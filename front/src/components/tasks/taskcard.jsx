import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Pencil, ChevronDown, CalendarDays } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "TODO", label: "Rascunho" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "REVIEW", label: "Revisão" },
  { value: "DONE", label: "Concluída" },
  { value: "BLOCKED", label: "Bloqueada" },
];

const STATUS_BAR_COLORS = {
  TODO: "#c4b5fd",
  IN_PROGRESS: "#a78bfa",
  REVIEW: "#B050F0",
  DONE: "#34d399",
  BLOCKED: "#fb7185",
};

function formatStatusLabel(value) {
  const option = STATUS_OPTIONS.find((opt) => opt.value === value);
  return option ? option.label : value;
}

function formatDueDate(dt) {
  if (!dt) return null;
  const date = new Date(dt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export default function Taskcard({ task, client, onEdit, onStatusChange }) {
  const dueLabel = formatDueDate(task.dueDate);
  const [localStatus, setLocalStatus] = useState(task.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

  const updateMenuPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        triggerRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      updateMenuPosition();
      window.addEventListener("resize", updateMenuPosition);
      window.addEventListener("scroll", updateMenuPosition, true);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("resize", updateMenuPosition);
        window.removeEventListener("scroll", updateMenuPosition, true);
      };
    }
  }, [menuOpen]);

  const handleStatusChange = (newStatus) => {
    setLocalStatus(newStatus);
    setMenuOpen(false);
    if (onStatusChange) {
      onStatusChange(task.id, newStatus);
    }
  };

  const barColor = STATUS_BAR_COLORS[localStatus] || STATUS_BAR_COLORS.TODO;

  return (
    <Card className="group relative w-full max-w-none overflow-visible border border-transparent bg-white/90 shadow-lg shadow-purple-100 transition-transform hover:-translate-y-1 hover:shadow-xl cursor-pointer rounded-2xl">
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{
          background: `linear-gradient(180deg, ${barColor}, rgba(255,255,255,0))`,
        }}
      />

      <CardHeader className="pb-2 pr-3">
        <div className="flex justify-between items-start gap-2">
          <div>
            <CardTitle className="text-sm font-semibold text-gray-900 line-clamp-2">
              {task.title || "Tarefa sem título"}
            </CardTitle>
            {client && (
              <p className="text-xs text-gray-500 mt-1">{client.name}</p>
            )}
          </div>
          <Badge className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100">
            {formatStatusLabel(localStatus)}
          </Badge>
        </div>
      </CardHeader>

      {task.description && (
        <CardContent className="pb-2 pr-3">
          <p className="text-xs text-gray-600 line-clamp-3 whitespace-pre-line">
            {task.description}
          </p>
        </CardContent>
      )}

      <CardFooter className="pt-2 flex flex-col gap-3 pr-3">
        {dueLabel && (
          <div className="w-full text-[11px] text-gray-500 flex items-center gap-2">
            <CalendarDays className="w-3 h-3" />
            Prazo: <span className="font-medium">{dueLabel}</span>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-[170px]">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
              ref={triggerRef}
              className="w-full inline-flex items-center justify-between rounded-full border border-purple-200 bg-white px-3 py-2 text-xs font-medium text-purple-700 transition hover:border-purple-300 hover:bg-purple-50"
            >
              <span>{formatStatusLabel(localStatus)}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto rounded-full bg-purple-500 text-white hover:bg-purple-600 focus-visible:ring-2 focus-visible:ring-purple-400"
            onClick={(event) => {
              event.stopPropagation();
              onEdit && onEdit(task);
            }}
          >
            <Pencil className="w-4 h-4 mr-1.5" />
            Editar
          </Button>
        </div>
      </CardFooter>

      {menuOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 rounded-2xl border border-slate-100 bg-white p-1 shadow-2xl shadow-purple-200/70"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              minWidth: menuPosition.width,
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-purple-50 ${
                  localStatus === opt.value
                    ? "bg-purple-50 text-purple-700"
                    : "text-gray-600"
                }`}
                onClick={() => handleStatusChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </Card>
  );
}
