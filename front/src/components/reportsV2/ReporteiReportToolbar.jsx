import React from "react";
import { Check, ChevronDown, Share2, Eye, Save, ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { cn } from "@/utils/classnames.js";

export default function ReporteiReportToolbar({
  title,
  statusLabel = "Salvo",
  statusInteractive = false,
  statusDisabled = false,
  onStatusToggle,
  onBack,
  onSaveTemplate,
  onViewClient,
  onShare,
  saveTemplateDisabled = false,
  saveTemplateLoading = false,
  viewClientDisabled = false,
  shareDisabled = false,
  shareLoading = false,
  leftContent,
  extraActions,
  className = "",
}) {
  return (
    <div className={cn("border-b border-[#dbe3ed] bg-white", className)}>
      <div className="mx-auto flex min-h-[52px] max-w-[1760px] flex-wrap items-center justify-between gap-2 px-4 py-2 lg:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-[var(--text-muted)] hover:border-[#dbe3ed] hover:bg-[var(--surface-muted)]"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="truncate text-[20px] font-extrabold text-[var(--primary)] lg:text-[23px]">
            {title || "Relatório"}
          </p>
          <Pencil className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          {leftContent}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={statusInteractive ? onStatusToggle : undefined}
            disabled={!statusInteractive || statusDisabled}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-bold text-emerald-600",
              statusInteractive &&
                !statusDisabled &&
                "cursor-pointer hover:bg-emerald-50",
              statusDisabled && "opacity-60"
            )}
          >
            <Check className="h-3.5 w-3.5" />
            {statusLabel}
          </button>
          <Button
            size="sm"
            variant="secondary"
            className="kondor-reports-toolbar-button gap-1.5 px-3.5"
            onClick={onSaveTemplate}
            disabled={saveTemplateDisabled}
          >
            <Save className="h-3.5 w-3.5" />
            {saveTemplateLoading ? "Salvando..." : "Salvar como template"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="kondor-reports-toolbar-button gap-1.5 px-3.5"
            onClick={onViewClient}
            disabled={viewClientDisabled}
          >
            <Eye className="h-3.5 w-3.5" />
            Ver como cliente
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="kondor-reports-toolbar-button gap-1.5 px-3.5"
            onClick={onShare}
            disabled={shareDisabled}
          >
            <Share2 className="h-3.5 w-3.5" />
            {shareLoading ? "Compartilhando..." : "Compartilhar"}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {extraActions}
        </div>
      </div>
    </div>
  );
}
