import React, { useEffect } from "react";
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
import { Pencil, ChevronDown } from "lucide-react";

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
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [localStatus, setLocalStatus] = React.useState(post.status);
  const triggerRef = React.useRef(null);
  const menuContentRef = React.useRef(null);
  const [menuPosition, setMenuPosition] = React.useState({
    top: 0,
    left: 0,
    width: 0,
  });

  const updateMenuPosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    setLocalStatus(post.status);
  }, [post.status]);

  const handleStatusChange = (newStatus) => {
    if (!onStatusChange) return;
    onStatusChange(post.id, newStatus);
  };

  const scheduledLabel = formatDate(
    post.scheduledAt || post.scheduled_at || post.scheduledDate
  );
  const description = post.body || post.caption;

  React.useEffect(() => {
    function handleClickOutside(event) {
      const triggerEl = triggerRef.current;
      const menuEl = menuContentRef.current;
      if (
        (triggerEl && triggerEl.contains(event.target)) ||
        (menuEl && menuEl.contains(event.target))
      ) {
        return;
      }
      setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  React.useEffect(() => {
    if (!menuOpen) return;
    updateMenuPosition();
    const handleReposition = () => updateMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [menuOpen, updateMenuPosition]);

  const triggerStatusMenu = (event) => {
    event.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  const selectStatus = (event, value) => {
    event.stopPropagation();
    setMenuOpen(false);
    if (value === localStatus) return;
    setLocalStatus(value);
    handleStatusChange(value);
  };

  return (
    <Card
      className="group relative w-full max-w-none overflow-visible border border-transparent bg-white/90 shadow-lg shadow-purple-100 transition-transform hover:-translate-y-1 hover:shadow-xl cursor-pointer rounded-2xl"
      onClick={() => onEdit && onEdit(post)}
      role="button"
      tabIndex={0}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-purple-400/90 to-purple-600/90 opacity-70" />
      <CardHeader className="pb-2 pr-3">
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
          <Badge className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100">
            {formatStatusLabel(localStatus)}
          </Badge>
        </div>
      </CardHeader>

      {description && (
        <CardContent className="pb-2 pr-3">
          <p className="text-xs text-gray-600 line-clamp-3 whitespace-pre-line">
            {description}
          </p>
        </CardContent>
      )}

      <CardFooter className="pt-2 flex flex-col gap-3 pr-3">
        {scheduledLabel && (
          <div className="w-full text-[11px] text-gray-500">
            Programado para: <span className="font-medium">{scheduledLabel}</span>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-auto">
            <button
              type="button"
              onClick={triggerStatusMenu}
              ref={triggerRef}
              className="w-full sm:w-[170px] inline-flex items-center justify-between rounded-full border border-purple-200 bg-white px-3 py-2 text-xs font-medium text-purple-700 transition hover:border-purple-300 hover:bg-purple-50"
            >
              <span>{formatStatusLabel(localStatus)}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto border border-transparent bg-purple-500 text-white hover:bg-purple-600 focus-visible:ring-2 focus-visible:ring-purple-400"
            onClick={(event) => {
              event.stopPropagation();
              onEdit && onEdit(post);
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
          // Dropdown usa portal + z-50 para ficar acima das demais colunas/cards.
          <div
            ref={menuContentRef}
            className="fixed z-50 rounded-2xl border border-slate-100 bg-white p-1 shadow-2xl shadow-purple-200/70"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              minWidth: menuPosition.width,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {STATUS_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={(event) => selectStatus(event, opt.value)}
                className={`w-full rounded-xl px-3 py-2 text-left text-xs transition ${
                  opt.value === localStatus
                    ? "bg-purple-50 text-purple-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
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
