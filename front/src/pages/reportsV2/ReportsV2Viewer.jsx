import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Edit3, Share2, Download, Copy } from "lucide-react";
import PageShell from "@/components/ui/page-shell.jsx";
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
import Toast from "@/components/ui/toast.jsx";
import GlobalFiltersBar from "@/components/reportsV2/GlobalFiltersBar.jsx";
import DashboardRenderer from "@/components/reportsV2/DashboardRenderer.jsx";
import { base44 } from "@/apiClient/base44Client";
import { useDebouncedValue } from "@/components/reportsV2/utils.js";
import useToast from "@/hooks/useToast.js";

const themeStyle = {
  "--background": "#FFFFFF",
  "--surface": "#FFFFFF",
  "--surface-muted": "#F8FAFC",
  "--border": "#E2E8F0",
  "--text": "#0F172A",
  "--text-muted": "#64748B",
  "--primary": "#F59E0B",
  "--primary-dark": "#D97706",
  "--accent": "#22C55E",
  "--shadow-sm": "0 2px 6px rgba(15, 23, 42, 0.08)",
  "--shadow-md": "0 18px 32px rgba(15, 23, 42, 0.12)",
  "--radius-card": "16px",
  "--radius-button": "16px",
  "--radius-input": "12px",
};

function buildInitialFilters(layout) {
  const base = {
    dateRange: { preset: "last_7_days" },
    platforms: [],
    accounts: [],
    compareTo: null,
    autoRefreshSec: 0,
  };
  if (!layout?.globalFilters) return base;
  return {
    ...base,
    ...layout.globalFilters,
    dateRange: {
      ...base.dateRange,
      ...(layout.globalFilters?.dateRange || {}),
    },
  };
}

export default function ReportsV2Viewer() {
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["reportsV2-dashboard", id],
    queryFn: () => base44.reportsV2.getDashboard(id),
  });

  const dashboard = data || null;
  const layout =
    dashboard?.latestVersion?.layoutJson ||
    dashboard?.publishedVersion?.layoutJson ||
    null;
  const shareEnabled = Boolean(dashboard?.sharedEnabled);

  const [filters, setFilters] = React.useState(() => buildInitialFilters(layout));
  const debouncedFilters = useDebouncedValue(filters, 400);

  React.useEffect(() => {
    setFilters(buildInitialFilters(layout));
  }, [layout]);

  React.useEffect(() => {
    const refreshSec = Number(filters?.autoRefreshSec || 0);
    if (!refreshSec || !id) return undefined;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["reportsV2-widget", id] });
    }, refreshSec * 1000);
    return () => clearInterval(interval);
  }, [filters?.autoRefreshSec, id, queryClient]);

  const shareMutation = useMutation({
    mutationFn: () => base44.reportsV2.createShare(id),
    onSuccess: (payload) => {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = payload?.publicUrlPath ? `${origin}${payload.publicUrlPath}` : "";
      setShareUrl(url);
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      showToast("Link publico gerado com sucesso.", "success");
    },
    onError: (err) => {
      const message =
        err?.data?.error?.message ||
        err?.message ||
        "Nao foi possivel gerar o link publico.";
      showToast(message, "error");
    },
  });

  const disableShareMutation = useMutation({
    mutationFn: () => base44.reportsV2.disableShare(id),
    onSuccess: () => {
      setShareUrl("");
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      showToast("Compartilhamento desativado.", "success");
    },
    onError: (err) => {
      const message =
        err?.data?.error?.message ||
        err?.message ||
        "Nao foi possivel desativar o link.";
      showToast(message, "error");
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => base44.reportsV2.createExport(id, { format: "pdf" }),
    onSuccess: (payload) => {
      if (payload?.downloadUrl) {
        window.open(payload.downloadUrl, "_blank", "noopener");
      }
      showToast("PDF gerado com sucesso.", "success");
    },
    onError: (err) => {
      const message =
        err?.data?.error?.message ||
        err?.message ||
        "Nao foi possivel exportar o PDF.";
      showToast(message, "error");
    },
  });

  const ensurePublished = () => {
    if (dashboard?.status === "PUBLISHED") return true;
    showToast("Publique o dashboard antes de compartilhar ou exportar.", "error");
    return false;
  };

  const handleGenerateShare = () => {
    if (!ensurePublished()) return;
    shareMutation.mutate();
  };

  const handleExport = () => {
    if (!ensurePublished()) return;
    exportMutation.mutate();
  };

  const handleCopyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Link copiado.", "success");
    } catch (err) {
      showToast("Nao foi possivel copiar o link.", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white" style={themeStyle}>
        <PageShell>
          <div className="h-6 w-40 rounded-full kondor-shimmer" />
          <div className="mt-6 h-32 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
          <div className="mt-6 h-64 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
        </PageShell>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-white" style={themeStyle}>
        <PageShell>
          <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700">
            Dashboard nao encontrado.
          </div>
        </PageShell>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={themeStyle}>
      <PageShell>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]"
              onClick={() => navigate("/relatorios/v2")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </button>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              {dashboard.name}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {dashboard.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={Share2}
              onClick={() => setShareOpen(true)}
            >
              Compartilhar
            </Button>
            <Button
              variant="secondary"
              leftIcon={Download}
              onClick={handleExport}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? "Exportando..." : "Exportar PDF"}
            </Button>
            <Button
              variant="secondary"
              leftIcon={Edit3}
              onClick={() => navigate(`/relatorios/v2/${dashboard.id}/edit`)}
            >
              Editar
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <GlobalFiltersBar filters={filters} onChange={setFilters} />
        </div>

        <div className="mt-8">
          {layout ? (
            <DashboardRenderer
              layout={layout}
              dashboardId={dashboard.id}
              brandId={dashboard.brandId}
              globalFilters={debouncedFilters}
            />
          ) : (
            <div className="rounded-[16px] border border-[var(--border)] bg-white px-6 py-5 text-sm text-[var(--text-muted)]">
              Layout nao encontrado para este dashboard.
            </div>
          )}
        </div>
      </PageShell>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Compartilhar dashboard</DialogTitle>
            <DialogDescription>
              Gere um link publico read-only para este dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--text-muted)]">
              Status:{" "}
              <span className="font-semibold text-[var(--text)]">
                {shareEnabled ? "Link ativo" : "Compartilhamento desligado"}
              </span>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Link publico
              </label>
              <Input
                readOnly
                value={shareUrl}
                placeholder="Gere um link para compartilhar"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={handleCopyShare}
                  disabled={!shareUrl}
                  leftIcon={Copy}
                >
                  Copiar link
                </Button>
                <Button
                  onClick={handleGenerateShare}
                  disabled={shareMutation.isPending}
                >
                  {shareMutation.isPending
                    ? "Gerando..."
                    : shareEnabled
                    ? "Gerar novo link"
                    : "Gerar link"}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" onClick={() => setShareOpen(false)}>
              Fechar
            </Button>
            {shareEnabled ? (
              <Button
                variant="danger"
                onClick={() => disableShareMutation.mutate()}
                disabled={disableShareMutation.isPending}
              >
                {disableShareMutation.isPending
                  ? "Desativando..."
                  : "Desativar compartilhamento"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toast toast={toast} />
    </div>
  );
}
