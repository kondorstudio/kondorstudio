import React from "react";
import { Download, ExternalLink, Image as ImageIcon, Video } from "lucide-react";

const TYPE_LABELS = {
  image: "Imagem",
  video: "Vídeo",
  gif: "GIF",
};

const STATUS_LABELS = {
  in_use: "Em uso",
  approved: "Aprovado",
  archived: "Arquivado",
};

function formatFileSize(size) {
  if (!size || Number.isNaN(Number(size))) return null;
  const bytes = Number(size);
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatDimensions(creative) {
  if (creative.dimensions) return creative.dimensions;
  if (creative.width && creative.height) {
    return `${creative.width}×${creative.height}`;
  }
  if (creative.metadata?.width && creative.metadata?.height) {
    return `${creative.metadata.width}×${creative.metadata.height}`;
  }
  return null;
}

export default function CreativeCard({
  creative,
  clientName,
  onSelect,
  onUseInPost,
  onDownload,
  onDelete,
}) {
  const typeLabel = TYPE_LABELS[creative.file_type] || "Criativo";
  const fileSizeLabel = formatFileSize(creative.file_size);
  const dimensionsLabel = formatDimensions(creative);
  const statusKey = creative.status || "in_use";
  const statusLabel = STATUS_LABELS[statusKey] || "Ativo";

  const handleDownload = (e) => {
    e.stopPropagation();
    onDownload?.(creative);
  };

  const handleUse = (e) => {
    e.stopPropagation();
    onUseInPost?.(creative);
  };

  const handleDetails = (e) => {
    e.stopPropagation();
    onSelect?.(creative);
  };

  return (
    <div
      className="group rounded-[26px] bg-white shadow-[0_15px_45px_rgba(28,36,57,0.08)] border border-transparent hover:border-purple-200 transition-all cursor-pointer overflow-hidden"
      onClick={() => onSelect?.(creative)}
    >
      <div className="relative aspect-square bg-slate-100 overflow-hidden">
        {creative.file_type === "video" ? (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="w-16 h-16 text-slate-300" />
          </div>
        ) : creative.file_url ? (
          <img
            src={creative.file_url}
            alt={creative.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-16 h-16 text-slate-300" />
          </div>
        )}

        <div className="absolute top-4 left-4">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/90 text-slate-700">
            {statusLabel}
          </span>
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end gap-2 p-4">
          <button
            onClick={handleDetails}
            className="pointer-events-auto w-full text-sm font-semibold text-white bg-white/20 backdrop-blur rounded-2xl py-2 border border-white/30"
          >
            Ver detalhes
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleUse}
              className="pointer-events-auto flex-1 bg-purple-600 text-white text-sm font-semibold rounded-2xl py-2 hover:bg-purple-500"
            >
              Usar em post
            </button>
            <button
              onClick={handleDownload}
              className="pointer-events-auto w-12 flex items-center justify-center rounded-2xl bg-white/20 text-white border border-white/30"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-900 leading-tight">
              {creative.name}
            </p>
            {clientName && (
              <p className="text-xs text-slate-500 mt-1">{clientName}</p>
            )}
          </div>
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-purple-50 text-purple-700">
            {typeLabel}
          </span>
        </div>

        <div className="text-xs text-slate-500">
          {[dimensionsLabel, fileSizeLabel]
            .filter(Boolean)
            .join(" • ") || "Metadados indisponíveis"}
        </div>

        {creative.tags && creative.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {creative.tags.slice(0, 3).map((tag, idx) => (
              <span
                key={idx}
                className="text-[11px] font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600"
              >
                #{tag}
              </span>
            ))}
            {creative.tags.length > 3 && (
              <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                +{creative.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

CreativeCard.defaultProps = {
  creative: {},
  onSelect: () => {},
  onUseInPost: () => {},
  onDownload: () => {},
  onDelete: () => {},
};
