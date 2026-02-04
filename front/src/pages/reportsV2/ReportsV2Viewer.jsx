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
import ThemeProvider from "@/components/reportsV2/ThemeProvider.jsx";
import { base44 } from "@/apiClient/base44Client";
import {
  useDebouncedValue,
  normalizeLayoutFront,
  DEFAULT_FILTER_CONTROLS,
} from "@/components/reportsV2/utils.js";
import useToast from "@/hooks/useToast.js";

function buildInitialFilters(layout) {
  const base = {
    dateRange: { preset: "last_7_days" },
    platforms: [],
    accounts: [],
    compareTo: null,
    autoRefreshSec: 0,
    controls: DEFAULT_FILTER_CONTROLS,
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
  const normalizedLayout = normalizeLayoutFront(layout);
  const pages = normalizedLayout?.pages || [];
  const globalFilterControls = normalizedLayout?.globalFilters?.controls;
  const [activePageId, setActivePageId] = React.useState(pages[0]?.id || null);
  const shareEnabled = Boolean(dashboard?.sharedEnabled);

  const [filters, setFilters] = React.useState(() =>
    buildInitialFilters(normalizedLayout)
  );
  const debouncedFilters = useDebouncedValue(filters, 400);

  React.useEffect(() => {
    setFilters(buildInitialFilters(normalizedLayout));
  }, [normalizedLayout]);

  React.useEffect(() => {
    if (!pages.length) return;
    setActivePageId((current) => {
      if (current && pages.some((page) => page.id === current)) return current;
      return pages[0].id;
    });
  }, [pages]);

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
      <ThemeProvider theme={normalizedLayout?.theme} className="min-h-screen bg-[var(--bg)]">
        <PageShell>
          <div className="h-6 w-40 rounded-full kondor-shimmer" />
          <div className="mt-6 h-32 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
          <div className="mt-6 h-64 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
        </PageShell>
      </ThemeProvider>
    );
  }

  if (error || !dashboard) {
    return (
      <ThemeProvider theme={normalizedLayout?.theme} className="min-h-screen bg-[var(--bg)]">
        <PageShell>
          <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700">
            Dashboard nao encontrado.
          </div>
        </PageShell>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={normalizedLayout?.theme} className="min-h-screen bg-[var(--bg)]">
      <PageShell>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]"
              onClick={() => navigate("/relatorios/v2")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </button>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              {dashboard.name}
            </h1>
            <p className="text-sm text-[var(--muted)]">
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
          <GlobalFiltersBar
            filters={filters}
            controls={globalFilterControls}
            onChange={setFilters}
          />
        </div>

        <div className="mt-8">
          {normalizedLayout ? (
            <>
              {pages.length > 1 ? (
                <div
                  role="tablist"
                  aria-label="Paginas do dashboard"
                  className="mb-4 flex flex-wrap gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-2"
                >
                  {pages.map((page) => (
                    <button
                      key={page.id}
                      role="tab"
                      type="button"
                      aria-selected={page.id === activePageId}
                      className={
                        page.id === activePageId
                        ? "rounded-[12px] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                          : "rounded-[12px] px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                      }
                      onClick={() => setActivePageId(page.id)}
                    >
                      {page.name}
                    </button>
                  ))}
                </div>
              ) : null}
            <DashboardRenderer
              layout={normalizedLayout}
              dashboardId={dashboard.id}
              brandId={dashboard.brandId}
              globalFilters={debouncedFilters}
              activePageId={activePageId}
            />
            </>
          ) : (
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-6 py-5 text-sm text-[var(--muted)]">
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
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-xs text-[var(--muted)]">
              Status:{" "}
              <span className="font-semibold text-[var(--text)]">
                {shareEnabled ? "Link ativo" : "Compartilhamento desligado"}
              </span>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
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
    </ThemeProvider>
  );
}
