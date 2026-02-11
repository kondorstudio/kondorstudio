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
      onToast?.("Link público gerado.", "success");
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
      onToast?.("Link rotacionado.", "success");
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

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      onToast?.("Link copiado.", "success");
    } catch (error) {
      onToast?.("Não foi possível copiar o link.", "error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Compartilhar relatório</DialogTitle>
          <DialogDescription>
            Gere um link público para abrir este relatório no modo cliente.
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
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || rotateMutation.isPending || revokeMutation.isPending}
              className="gap-2"
            >
              <Link2 className="h-4 w-4" />
              {shareEnabled ? "Regenerar link" : "Gerar link"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => rotateMutation.mutate()}
              disabled={!shareEnabled || rotateMutation.isPending || createMutation.isPending || revokeMutation.isPending}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Rotacionar token
            </Button>
            <Button
              variant="secondary"
              onClick={() => revokeMutation.mutate()}
              disabled={!shareEnabled || revokeMutation.isPending || createMutation.isPending || rotateMutation.isPending}
              className="gap-2"
            >
              <ShieldBan className="h-4 w-4" />
              Desativar
            </Button>
          </div>
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
