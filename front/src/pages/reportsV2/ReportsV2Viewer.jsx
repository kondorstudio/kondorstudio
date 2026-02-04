import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Edit3, Share2, Download, Copy, RefreshCw, Link2Off } from "lucide-react";
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

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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
  const [widgetStatusById, setWidgetStatusById] = React.useState({});
  const shareStatusQuery = useQuery({
    queryKey: ["reportsV2-public-share", id],
    queryFn: () => base44.reportsV2.getPublicShareStatus(id),
    enabled: Boolean(id) && shareOpen,
  });

  const shareStatus = shareStatusQuery.data || null;
  const shareEnabled =
    shareStatus?.status === "ACTIVE" || Boolean(dashboard?.sharedEnabled);

  const [filters, setFilters] = React.useState(() =>
    buildInitialFilters(normalizedLayout)
  );
  const debouncedFilters = useDebouncedValue(filters, 400);

  React.useEffect(() => {
    setShareUrl("");
  }, [id]);

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

  const activePageWidgets = React.useMemo(() => {
    if (!pages.length) return [];
    const activePage =
      pages.find((page) => page.id === activePageId) || pages[0] || null;
    return Array.isArray(activePage?.widgets) ? activePage.widgets : [];
  }, [activePageId, pages]);

  const activeWidgetIds = React.useMemo(
    () => new Set(activePageWidgets.map((widget) => widget.id)),
    [activePageWidgets]
  );

  React.useEffect(() => {
    if (!activeWidgetIds.size) {
      setWidgetStatusById({});
      return;
    }
    setWidgetStatusById((previous) => {
      const next = {};
      for (const widgetId of Object.keys(previous)) {
        if (activeWidgetIds.has(widgetId)) {
          next[widgetId] = previous[widgetId];
        }
      }
      if (
        Object.keys(next).length === Object.keys(previous).length &&
        Object.keys(next).every((key) => next[key] === previous[key])
      ) {
        return previous;
      }
      return next;
    });
  }, [activeWidgetIds]);

  const handleWidgetStatusChange = React.useCallback((widgetId, payload) => {
    if (!widgetId) return;
    setWidgetStatusById((previous) => {
      const nextPayload = payload || { status: "ok", reason: null };
      const current = previous[widgetId];
      if (
        current?.status === nextPayload.status &&
        current?.reason === nextPayload.reason
      ) {
        return previous;
      }
      return {
        ...previous,
        [widgetId]: nextPayload,
      };
    });
  }, []);

  const hasInvalidWidgets = React.useMemo(() => {
    for (const widgetId of activeWidgetIds) {
      const status = widgetStatusById[widgetId];
      if (!status) continue;
      if (status.status === "error" || status.status === "invalid") return true;
    }
    return false;
  }, [activeWidgetIds, widgetStatusById]);

  React.useEffect(() => {
    const refreshSec = Number(filters?.autoRefreshSec || 0);
    if (!refreshSec || !id) return undefined;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["reportsV2-widget", id] });
    }, refreshSec * 1000);
    return () => clearInterval(interval);
  }, [filters?.autoRefreshSec, id, queryClient]);

  const createShareMutation = useMutation({
    mutationFn: () => base44.reportsV2.createPublicShare(id),
    onSuccess: (payload) => {
      if (payload?.publicUrl) {
        setShareUrl(payload.publicUrl);
      }
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      queryClient.invalidateQueries({ queryKey: ["reportsV2-public-share", id] });
      if (payload?.publicUrl) {
        showToast("Link publico gerado com sucesso.", "success");
      } else {
        showToast("Link ja esta ativo. Rotacione para gerar um novo token.", "success");
      }
    },
    onError: (err) => {
      const message =
        err?.data?.error?.message ||
        err?.message ||
        "Nao foi possivel gerar o link publico.";
      showToast(message, "error");
    },
  });

  const rotateShareMutation = useMutation({
    mutationFn: () => base44.reportsV2.rotatePublicShare(id),
    onSuccess: (payload) => {
      if (payload?.publicUrl) {
        setShareUrl(payload.publicUrl);
      }
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      queryClient.invalidateQueries({ queryKey: ["reportsV2-public-share", id] });
      showToast("Link rotacionado com sucesso.", "success");
    },
    onError: (err) => {
      const message =
        err?.data?.error?.message ||
        err?.message ||
        "Nao foi possivel rotacionar o link.";
      showToast(message, "error");
    },
  });

  const revokeShareMutation = useMutation({
    mutationFn: () => base44.reportsV2.revokePublicShare(id),
    onSuccess: () => {
      setShareUrl("");
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      queryClient.invalidateQueries({ queryKey: ["reportsV2-public-share", id] });
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
    mutationFn: () =>
      base44.reportsV2.exportPdf(id, {
        filters,
        page: "current",
        activePageId,
        orientation: "landscape",
      }),
    onSuccess: (result) => {
      if (!result?.blob) {
        showToast("Nao foi possivel gerar o PDF.", "error");
        return;
      }
      const fallbackDate = new Date().toISOString().slice(0, 10);
      const fallbackName = `Relatorio - ${dashboard?.name || "Dashboard"} - ${fallbackDate}.pdf`;
      const filename = result.filename || fallbackName;
      const objectUrl = window.URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
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
    createShareMutation.mutate();
  };

  const handleRotateShare = () => {
    if (!ensurePublished()) return;
    const confirmed = window.confirm(
      "Rotacionar invalida o link atual e cria um novo. Deseja continuar?"
    );
    if (!confirmed) return;
    rotateShareMutation.mutate();
  };

  const handleDisableShare = () => {
    const confirmed = window.confirm(
      "Desativar compartilhamento vai revogar o link publico atual. Continuar?"
    );
    if (!confirmed) return;
    revokeShareMutation.mutate();
  };

  const handleExport = () => {
    if (!ensurePublished()) return;
    if (hasInvalidWidgets) {
      window.alert(
        "Nao e possivel exportar este relatorio pois existem widgets com dados invalidos ou conexoes pendentes."
      );
      return;
    }
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
            <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <span>{dashboard.status === "PUBLISHED" ? "Publicado" : "Rascunho"}</span>
              {hasInvalidWidgets ? (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Dados invalidos
                </span>
              ) : null}
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
              onWidgetStatusChange={handleWidgetStatusChange}
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
              <div className="flex items-center justify-between gap-2">
                <span>
                  Status:{" "}
                  <span className="font-semibold text-[var(--text)]">
                    {shareStatusQuery.isLoading
                      ? "Carregando..."
                      : shareEnabled
                      ? "Ativo"
                      : "Inativo"}
                  </span>
                </span>
                <span>
                  Criado em:{" "}
                  <span className="font-semibold text-[var(--text)]">
                    {formatDateTime(shareStatus?.createdAt)}
                  </span>
                </span>
              </div>
              {shareStatusQuery.error ? (
                <p className="mt-2 text-rose-600">
                  Nao foi possivel carregar o status do compartilhamento.
                </p>
              ) : null}
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
                  disabled={
                    createShareMutation.isPending ||
                    dashboard?.status !== "PUBLISHED"
                  }
                >
                  {createShareMutation.isPending ? "Gerando..." : "Gerar link"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleRotateShare}
                  disabled={!shareEnabled || rotateShareMutation.isPending}
                  leftIcon={RefreshCw}
                >
                  {rotateShareMutation.isPending ? "Rotacionando..." : "Rotacionar link"}
                </Button>
              </div>
              {shareEnabled && !shareUrl ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Link ativo. Para copiar um novo link, clique em "Rotacionar link".
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" onClick={() => setShareOpen(false)}>
              Fechar
            </Button>
            {shareEnabled ? (
              <Button
                variant="danger"
                onClick={handleDisableShare}
                disabled={revokeShareMutation.isPending}
                leftIcon={Link2Off}
              >
                {revokeShareMutation.isPending
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
