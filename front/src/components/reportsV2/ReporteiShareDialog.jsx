import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, RefreshCw, ShieldBan } from "lucide-react";
import { base44 } from "@/apiClient/base44Client";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.jsx";

export default function ReporteiShareDialog({
  dashboardId,
  open,
  onOpenChange,
  onToast,
  onShareUrlChange,
  isPublished = true,
}) {
  const queryClient = useQueryClient();
  const [shareUrl, setShareUrl] = React.useState("");

  const statusQuery = useQuery({
    queryKey: ["reportsV2-public-share", dashboardId],
    queryFn: () => base44.reportsV2.getPublicShareStatus(dashboardId),
    enabled: Boolean(dashboardId) && Boolean(open),
  });

  const shareEnabled = statusQuery.data?.status === "ACTIVE";

  React.useEffect(() => {
    if (!open) return;
    const url = statusQuery.data?.publicUrl || "";
    setShareUrl(url);
    onShareUrlChange?.(url);
  }, [open, onShareUrlChange, statusQuery.data?.publicUrl]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", dashboardId] });
    queryClient.invalidateQueries({ queryKey: ["reportsV2-public-share", dashboardId] });
    queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard-health", dashboardId] });
  };

  const createMutation = useMutation({
    mutationFn: () => base44.reportsV2.createPublicShare(dashboardId),
    onSuccess: (payload) => {
      const url = payload?.publicUrl || "";
      setShareUrl(url);
      onShareUrlChange?.(url);
      invalidate();
      if (url) {
        onToast?.("Link público gerado.", "success");
        return;
      }
      onToast?.("Compartilhamento já estava ativo.", "success");
    },
    onError: (error) => {
      onToast?.(error?.data?.error?.message || "Falha ao gerar link público.", "error");
    },
  });

  const rotateMutation = useMutation({
    mutationFn: () => base44.reportsV2.rotatePublicShare(dashboardId),
    onSuccess: (payload) => {
      const url = payload?.publicUrl || "";
      setShareUrl(url);
      onShareUrlChange?.(url);
      invalidate();
      onToast?.("Novo link público gerado.", "success");
    },
    onError: (error) => {
      onToast?.(error?.data?.error?.message || "Falha ao rotacionar link.", "error");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => base44.reportsV2.revokePublicShare(dashboardId),
    onSuccess: () => {
      setShareUrl("");
      onShareUrlChange?.("");
      invalidate();
      onToast?.("Compartilhamento desativado.", "success");
    },
    onError: (error) => {
      onToast?.(error?.data?.error?.message || "Falha ao desativar compartilhamento.", "error");
    },
  });

  const isBusy =
    createMutation.isPending || rotateMutation.isPending || revokeMutation.isPending;

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      onToast?.("Link copiado.", "success");
    } catch (error) {
      onToast?.("Não foi possível copiar o link.", "error");
    }
  };

  const handlePrimaryShareAction = () => {
    if (!isPublished) {
      onToast?.("Publique o dashboard antes de gerar link de compartilhamento.", "info");
      return;
    }
    if (shareEnabled) {
      rotateMutation.mutate();
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Compartilhar relatório</DialogTitle>
          <DialogDescription>
            Gere um link público para abrir este relatório no modo cliente. Se já existir link
            ativo, a ação principal rotaciona automaticamente para devolver uma nova URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            URL pública
          </label>
          <div className="flex items-center gap-2">
            <Input
              value={shareUrl}
              readOnly
              placeholder="Nenhum link gerado"
              className="font-mono text-xs"
            />
            <Button variant="secondary" onClick={handleCopy} disabled={!shareUrl}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handlePrimaryShareAction}
              disabled={isBusy || !isPublished}
              className="gap-2"
            >
              <Link2 className="h-4 w-4" />
              {shareEnabled
                ? rotateMutation.isPending
                  ? "Gerando novo link..."
                  : "Gerar novo link"
                : createMutation.isPending
                ? "Gerando..."
                : "Gerar link"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => rotateMutation.mutate()}
              disabled={!shareEnabled || isBusy || !isPublished}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Rotacionar token
            </Button>
            <Button
              variant="secondary"
              onClick={() => revokeMutation.mutate()}
              disabled={!shareEnabled || isBusy}
              className="gap-2"
            >
              <ShieldBan className="h-4 w-4" />
              Desativar
            </Button>
          </div>
          {!isPublished ? (
            <p className="text-xs text-amber-700">
              Este dashboard está em rascunho. Publique para habilitar link público.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange?.(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
