import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Archive, Download, ExternalLink, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";

const TYPE_LABELS = {
  image: "Imagem",
  video: "Vídeo",
  gif: "GIF",
};

function formatFileSize(size) {
  if (!size || Number.isNaN(Number(size))) return "—";
  const bytes = Number(size);
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatDimensions(creative) {
  if (creative.dimensions) return creative.dimensions;
  if (creative.width && creative.height) return `${creative.width}×${creative.height}`;
  if (creative.metadata?.width && creative.metadata?.height) {
    return `${creative.metadata.width}×${creative.metadata.height}`;
  }
  return "—";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function CreativeDetailsDrawer({
  creative,
  open,
  onClose,
  clientName,
  onUseInPost,
  onDownload,
  onDelete,
  onArchive,
}) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !creative) return null;

  const usageSources = [];
  if (creative.post_id) {
    usageSources.push(`Post vinculado #${creative.post_id}`);
  }
  if (creative.tasks && creative.tasks.length) {
    usageSources.push(...creative.tasks.map((task) => `Tarefa: ${task.title || task.id}`));
  }
  if (creative.used_in && creative.used_in.length) {
    usageSources.push(...creative.used_in);
  }

  const infoList = [
    { label: "Cliente", value: clientName || "—" },
    { label: "Tipo", value: TYPE_LABELS[creative.file_type] || "—" },
    { label: "Tamanho", value: formatFileSize(creative.file_size) },
    { label: "Dimensões", value: formatDimensions(creative) },
    { label: "Data de upload", value: formatDate(creative.created_date) },
    { label: "Enviado por", value: creative.uploaded_by || "—" },
  ];

  const drawer = (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
        role="presentation"
      />
      <div className="w-full max-w-xl h-full bg-white shadow-2xl border-l border-slate-100 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-xs uppercase text-slate-400 font-semibold">
              Detalhes do criativo
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              {creative.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div className="rounded-3xl border border-slate-100 overflow-hidden bg-slate-50">
            {creative.file_type === "video" ? (
              <video
                controls
                src={creative.file_url}
                className="w-full h-[320px] object-cover bg-black"
              />
            ) : (
              <img
                src={creative.file_url}
                alt={creative.name}
                className="w-full h-[320px] object-cover"
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {infoList.map((item) => (
              <div key={item.label} className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                <p className="text-xs uppercase text-slate-400 font-semibold">
                  {item.label}
                </p>
                <p className="text-sm font-medium text-slate-900 mt-1">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs uppercase text-slate-400 font-semibold mb-3">
              Em uso
            </p>
            {usageSources.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
                Não vinculado a posts ou tarefas ainda.
              </div>
            ) : (
              <ul className="space-y-2 text-sm text-slate-600">
                {usageSources.map((usage, index) => (
                  <li key={`${usage}-${index}`} className="rounded-2xl border border-slate-100 px-3 py-2">
                    {usage}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 px-6 py-5 flex flex-wrap gap-3">
          <Button
            className="flex-1 bg-purple-600 hover:bg-purple-700"
            onClick={() => onUseInPost?.(creative)}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Usar em Post
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onDownload?.(creative)}
          >
            <Download className="w-4 h-4 mr-2" />
            Baixar
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => onDelete?.(creative)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Excluir
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onArchive?.(creative)}
          >
            <Archive className="w-4 h-4 mr-2" />
            Arquivar
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(drawer, document.body);
}

CreativeDetailsDrawer.defaultProps = {
  open: false,
  onClose: () => {},
  onUseInPost: () => {},
  onDownload: () => {},
  onDelete: () => {},
  onArchive: () => {},
};
