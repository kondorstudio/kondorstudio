import React from "react";
import { Check, ChevronDown, Share2, Eye, Save, ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { cn } from "@/utils/classnames.js";

export default function ReporteiReportToolbar({
  title,
  statusLabel = "Salvo",
  onBack,
  onSaveTemplate,
  onViewClient,
  onShare,
  extraActions,
  className = "",
}) {
  return (
    <div className={cn("border-b border-[#dbe3ed] bg-white", className)}>
      <div className="mx-auto flex h-[48px] max-w-[1760px] items-center justify-between gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-[var(--text-muted)] hover:border-[#dbe3ed] hover:bg-[var(--surface-muted)]"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="truncate text-[23px] font-extrabold text-[var(--primary)]">
            {title || "Relatório"}
          </p>
          <Pencil className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[13px] font-bold text-emerald-600">
            <Check className="h-3.5 w-3.5" />
            {statusLabel}
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 rounded-full border-[#d1dae6] bg-white px-3.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50"
            onClick={onSaveTemplate}
          >
            <Save className="h-3.5 w-3.5" />
            Salvar como template
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 rounded-full border-[#d1dae6] bg-white px-3.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50"
            onClick={onViewClient}
          >
            <Eye className="h-3.5 w-3.5" />
            Ver como cliente
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 rounded-full border-[#d1dae6] bg-white px-3.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50"
            onClick={onShare}
          >
            <Share2 className="h-3.5 w-3.5" />
            Compartilhar
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {extraActions}
        </div>
      </div>
    </div>
  );
}
