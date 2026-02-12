import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation, useIsFetching } from "@tanstack/react-query";
import { ArrowLeft, Edit3, Share2, Download, Copy, RefreshCw, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.jsx";
import Toast from "@/components/ui/toast.jsx";
import DashboardRenderer from "@/components/reportsV2/DashboardRenderer.jsx";
import ThemeProvider from "@/components/reportsV2/ThemeProvider.jsx";
import ReporteiTopbar from "@/components/reportsV2/ReporteiTopbar.jsx";
import ReporteiLeftRail from "@/components/reportsV2/ReporteiLeftRail.jsx";
import ReporteiFiltersCards from "@/components/reportsV2/ReporteiFiltersCards.jsx";
import ReporteiCoverCard from "@/components/reportsV2/ReporteiCoverCard.jsx";
import { base44 } from "@/apiClient/base44Client";
import {
  useDebouncedValue,
  normalizeLayoutFront,
  stableStringify,
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

const PLATFORM_LABELS = {
  META_ADS: "Meta Ads",
  GOOGLE_ADS: "Google Ads",
  TIKTOK_ADS: "TikTok Ads",
  LINKEDIN_ADS: "LinkedIn Ads",
  GA4: "GA4",
  GMB: "Google Meu Negócio",
  FB_IG: "Facebook/Instagram",
};

const PLATFORM_BADGE = {
  META_ADS: { short: "M", className: "bg-blue-100 text-blue-700" },
  GOOGLE_ADS: { short: "G", className: "bg-emerald-100 text-emerald-700" },
  TIKTOK_ADS: { short: "T", className: "bg-slate-200 text-slate-700" },
  LINKEDIN_ADS: { short: "In", className: "bg-sky-100 text-sky-700" },
  GA4: { short: "GA", className: "bg-orange-100 text-orange-700" },
  GMB: { short: "GMB", className: "bg-lime-100 text-lime-700" },
  FB_IG: { short: "FB", className: "bg-indigo-100 text-indigo-700" },
};

function formatPlatform(platform) {
  return PLATFORM_LABELS[platform] || platform;
}

function buildConnectionsPath(brandId, platform) {
  const params = new URLSearchParams();
  if (brandId) params.set("brandId", brandId);
  if (platform) params.set("platform", platform);
  const query = params.toString();
  return `/relatorios/v2/conexoes${query ? `?${query}` : ""}`;
}

function describeIssue(issue) {
  if (!issue) return "Widget com pendência.";
  if (issue.reasonCode === "MISSING_CONNECTION") {
    return `Conexão pendente: ${formatPlatform(issue.platform || "plataforma desconhecida")}.`;
  }
  if (issue.reasonCode === "INVALID_QUERY") {
    return "Configuração de widget inválida.";
  }
  return "Widget com pendência.";
}

export default function ReportsV2Viewer() {
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { toast, showToast } = useToast();
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState("");
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportPage, setExportPage] = React.useState("current");
  const [exportOrientation, setExportOrientation] = React.useState("landscape");
  const [blockedAction, setBlockedAction] = React.useState(null);
  const [widgetStatusesByPage, setWidgetStatusesByPage] = React.useState({});
  const [isAutoRefreshing, setIsAutoRefreshing] = React.useState(false);
  const [isFilterRefreshing, setIsFilterRefreshing] = React.useState(false);
  const previousFiltersKeyRef = React.useRef("");

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
  const canExportAllPages = pages.length > 1;
  const [activePageId, setActivePageId] = React.useState(pages[0]?.id || null);
  const shareStatusQuery = useQuery({
    queryKey: ["reportsV2-public-share", id],
    queryFn: () => base44.reportsV2.getPublicShareStatus(id),
    enabled: Boolean(id),
  });

  const shareStatus = shareStatusQuery.data || null;
  const shareEnabled =
    shareStatus?.status === "ACTIVE" || Boolean(dashboard?.sharedEnabled);
  const healthQuery = useQuery({
    queryKey: ["reportsV2-dashboard-health", id],
    queryFn: () => base44.reportsV2.getDashboardHealth(id),
    enabled: Boolean(id && dashboard?.status === "PUBLISHED"),
  });
  const connectionsQuery = useQuery({
    queryKey: ["reportsV2-connections-viewer", dashboard?.brandId],
    queryFn: () => base44.reportsV2.listConnections({ brandId: dashboard?.brandId }),
    enabled: Boolean(dashboard?.brandId),
  });
  const connections = connectionsQuery.data?.items || [];
  const health = healthQuery.data || null;
  const healthStatus = health?.status || null;
  const missingPlatforms = Array.isArray(health?.summary?.missingPlatforms)
    ? health.summary.missingPlatforms
    : [];
  const invalidWidgets = Array.isArray(health?.widgets)
    ? health.widgets.filter((item) => item.status !== "OK")
    : [];
  const isHealthBlocked = healthStatus === "BLOCKED";
  const isHealthWarn = healthStatus === "WARN";

  const [filters, setFilters] = React.useState(() =>
    buildInitialFilters(normalizedLayout)
  );
  const debouncedFilters = useDebouncedValue(filters, 400);
  const debouncedFiltersKey = React.useMemo(
    () => stableStringify(debouncedFilters),
    [debouncedFilters]
  );
  const widgetFetchingCount = useIsFetching({
    queryKey: ["reportsV2-widget", id],
  });

  React.useEffect(() => {
    setShareUrl("");
  }, [id]);

  React.useEffect(() => {
    if (!shareStatusQuery.data?.publicUrl) return;
    setShareUrl(shareStatusQuery.data.publicUrl);
  }, [shareStatusQuery.data?.publicUrl]);

  React.useEffect(() => {
    setWidgetStatusesByPage({});
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

  React.useEffect(() => {
    if (canExportAllPages) return;
    if (exportPage === "all") {
      setExportPage("current");
    }
  }, [canExportAllPages, exportPage]);
  const widgetTitleById = React.useMemo(() => {
    const map = new Map();
    pages.forEach((page) => {
      (page.widgets || []).forEach((widget) => {
        map.set(widget.id, widget.title || "Widget");
      });
    });
    return map;
  }, [pages]);
  const healthIssuesByWidgetId = React.useMemo(() => {
    const map = {};
    invalidWidgets.forEach((issue) => {
      if (!issue?.widgetId) return;
      const current = map[issue.widgetId];
      if (!current) {
        map[issue.widgetId] = issue;
        return;
      }
      if (
        current.reasonCode !== "MISSING_CONNECTION" &&
        issue.reasonCode === "MISSING_CONNECTION"
      ) {
        map[issue.widgetId] = issue;
      }
    });
    return map;
  }, [invalidWidgets]);

  React.useEffect(() => {
    const refreshSec = Number(filters?.autoRefreshSec || 0);
    if (!refreshSec || !id) return undefined;
    const interval = setInterval(() => {
      setIsAutoRefreshing(true);
      queryClient.invalidateQueries({ queryKey: ["reportsV2-widget", id] });
    }, refreshSec * 1000);
    return () => clearInterval(interval);
  }, [filters?.autoRefreshSec, id, queryClient]);

  React.useEffect(() => {
    const previousKey = previousFiltersKeyRef.current;
    if (!previousKey) {
      previousFiltersKeyRef.current = debouncedFiltersKey;
      return;
    }
    if (previousKey !== debouncedFiltersKey) {
      previousFiltersKeyRef.current = debouncedFiltersKey;
      setIsFilterRefreshing(true);
    }
  }, [debouncedFiltersKey]);

  React.useEffect(() => {
    if (widgetFetchingCount > 0) return;
    setIsAutoRefreshing(false);
    setIsFilterRefreshing(false);
  }, [widgetFetchingCount]);

  const activeWidgets = React.useMemo(() => {
    const activePage = pages.find((page) => page.id === activePageId);
    return Array.isArray(activePage?.widgets) ? activePage.widgets : [];
  }, [activePageId, pages]);

  const visibleWidgetStatuses = React.useMemo(() => {
    const currentStatuses = widgetStatusesByPage?.[activePageId] || {};
    const statusMap = {};
    activeWidgets.forEach((widget) => {
      if (!widget?.id) return;
      statusMap[widget.id] = currentStatuses[widget.id] || {
        status: "loading",
        reason: null,
      };
    });
    return statusMap;
  }, [activePageId, activeWidgets, widgetStatusesByPage]);

  const railItems = React.useMemo(() => {
    const activeConnections = Array.isArray(connections)
      ? connections.filter((item) => String(item?.status || "").toUpperCase() === "ACTIVE")
      : [];
    const uniquePlatforms = Array.from(
      new Set(activeConnections.map((item) => String(item?.platform || "").toUpperCase()))
    ).filter(Boolean);
    return uniquePlatforms.map((platform) => {
      const badge = PLATFORM_BADGE[platform] || {
        short: platform.slice(0, 1),
        className: "bg-slate-100 text-slate-700",
      };
      return {
        value: platform,
        label: PLATFORM_LABELS[platform] || platform,
        shortLabel: badge.short,
        className: badge.className,
      };
    });
  }, [connections]);

  const isExportReady = React.useMemo(() => {
    const statuses = Object.values(visibleWidgetStatuses || {});
    return statuses.every((entry) => entry?.status !== "loading") && widgetFetchingCount === 0;
  }, [visibleWidgetStatuses, widgetFetchingCount]);

  React.useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.setAttribute("data-export-ready", isExportReady ? "true" : "false");
    return () => {
      document.body.removeAttribute("data-export-ready");
    };
  }, [isExportReady]);

  const refreshNotice = React.useMemo(() => {
    if (widgetFetchingCount <= 0) return null;
    if (isAutoRefreshing) return "Atualizando automaticamente...";
    if (isFilterRefreshing) return "Aplicando filtros...";
    return "Atualizando...";
  }, [isAutoRefreshing, isFilterRefreshing, widgetFetchingCount]);

  const fetchReason = React.useMemo(() => {
    if (isAutoRefreshing) return "auto";
    if (isFilterRefreshing) return "filters";
    return "manual";
  }, [isAutoRefreshing, isFilterRefreshing]);

  const handleWidgetStatusesChange = React.useCallback(({ pageId, statuses }) => {
    if (!pageId || !statuses || typeof statuses !== "object") return;
    setWidgetStatusesByPage((prev) => {
      const current = prev?.[pageId] || {};
      const next = statuses || {};
      if (stableStringify(current) === stableStringify(next)) {
        return prev;
      }
      return {
        ...(prev || {}),
        [pageId]: next,
      };
    });
  }, []);

  const createShareMutation = useMutation({
    mutationFn: () => base44.reportsV2.createPublicShare(id),
    onSuccess: (payload) => {
      if (payload?.publicUrl) {
        setShareUrl(payload.publicUrl);
      }
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      queryClient.invalidateQueries({ queryKey: ["reportsV2-public-share", id] });
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard-health", id] });
      if (payload?.publicUrl) {
        showToast("Link público gerado com sucesso.", "success");
      } else {
        showToast("Link já está ativo. Rotacione para gerar um novo token.", "success");
      }
    },
    onError: (err) => {
      if (err?.data?.error?.code === "DASHBOARD_BLOCKED") {
        setBlockedAction("share");
        return;
      }
      const message =
        err?.data?.error?.message ||
        err?.message ||
        "Não foi possível gerar o link público.";
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
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard-health", id] });
      showToast("Link rotacionado com sucesso.", "success");
    },
    onError: (err) => {
      if (err?.data?.error?.code === "DASHBOARD_BLOCKED") {
        setBlockedAction("share");
        return;
      }
      const message =
        err?.data?.error?.message ||
        err?.message ||
        "Não foi possível rotacionar o link.";
      showToast(message, "error");
    },
  });

  const revokeShareMutation = useMutation({
    mutationFn: () => base44.reportsV2.revokePublicShare(id),
    onSuccess: () => {
      setShareUrl("");
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard", id] });
      queryClient.invalidateQueries({ queryKey: ["reportsV2-public-share", id] });
      queryClient.invalidateQueries({ queryKey: ["reportsV2-dashboard-health", id] });
      showToast("Compartilhamento desativado.", "success");
    },
    onError: (err) => {
      const message =
        err?.data?.error?.message ||
        err?.message ||
        "Não foi possível desativar o link.";
      showToast(message, "error");
    },
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      base44.reportsV2.exportPdf(id, {
        filters,
        page: exportPage,
        activePageId: exportPage === "current" ? activePageId : null,
        orientation: exportOrientation,
      }),
    onSuccess: (result) => {
      if (!result?.blob) {
        showToast("Não foi possível gerar o PDF.", "error");
        return;
      }
      const fallbackDate = new Date().toISOString().slice(0, 10);
      const fallbackName = `Relatório - ${dashboard?.name || "Dashboard"} - ${fallbackDate}.pdf`;
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
      setExportOpen(false);
    },
    onError: (err) => {
      if (err?.data?.error?.code === "DASHBOARD_BLOCKED") {
        setBlockedAction("export");
        return;
      }
      const message =
        err?.data?.error?.message ||
        err?.message ||
        "Não foi possível exportar o PDF.";
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
    if (isHealthBlocked) {
      setBlockedAction("share");
      return;
    }
    createShareMutation.mutate();
  };

  const handleRotateShare = () => {
    if (!ensurePublished()) return;
    if (isHealthBlocked) {
      setBlockedAction("share");
      return;
    }
    const confirmed = window.confirm(
      "Rotacionar invalida o link atual e cria um novo. Deseja continuar?"
    );
    if (!confirmed) return;
    rotateShareMutation.mutate();
  };

  const handleDisableShare = () => {
    const confirmed = window.confirm(
      "Desativar compartilhamento vai revogar o link público atual. Continuar?"
    );
    if (!confirmed) return;
    revokeShareMutation.mutate();
  };

  const handleExport = () => {
    if (!ensurePublished()) return;
    if (isHealthBlocked) {
      setBlockedAction("export");
      return;
    }
    if (!isExportReady) {
      showToast("Aguarde o carregamento completo dos dados para exportar.", "info");
      return;
    }
    setExportOpen(true);
  };

  const handleConfirmExport = () => {
    if (!isExportReady) {
      showToast("Aguarde o carregamento completo dos dados para exportar.", "info");
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
      showToast("Não foi possível copiar o link.", "error");
    }
  };

  if (isLoading) {
    return (
      <ThemeProvider
        theme={normalizedLayout?.theme}
        className="reportei-theme min-h-screen bg-[var(--surface-muted)]"
      >
        <div className="mx-auto max-w-[1500px] px-5 py-8">
          <div className="h-6 w-40 rounded-full kondor-shimmer" />
          <div className="mt-6 h-32 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
          <div className="mt-6 h-64 rounded-[16px] border border-[var(--border)] kondor-shimmer" />
        </div>
      </ThemeProvider>
    );
  }

  if (error || !dashboard) {
    return (
      <ThemeProvider
        theme={normalizedLayout?.theme}
        className="reportei-theme min-h-screen bg-[var(--surface-muted)]"
      >
        <div className="mx-auto max-w-[1500px] px-5 py-8">
          <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700">
            Dashboard não encontrado.
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider
      theme={normalizedLayout?.theme}
      className="reportei-theme min-h-screen bg-[var(--surface-muted)]"
    >
      <ReporteiTopbar />

      <div className="border-b border-[#dbe3ed] bg-white">
        <div className="mx-auto flex h-[48px] max-w-[1760px] items-center justify-between gap-3 px-4 lg:px-6">
          <div className="min-w-0">
            <button
              type="button"
              className="mb-0.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]"
              onClick={() => navigate("/relatorios/v2")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </button>
            <p className="truncate text-[18px] font-extrabold text-[var(--primary)]">
              {dashboard.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              {dashboard.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
            </span>
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
              disabled={exportMutation.isPending || isHealthBlocked}
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
      </div>

      <div className="mx-auto max-w-[1760px] px-4 py-5 lg:px-6">
        <ReporteiLeftRail
          items={railItems}
          activeItem={Array.isArray(filters?.platforms) ? filters.platforms[0] || "" : ""}
          onSelect={(platform) =>
            setFilters((prev) => ({
              ...(prev || {}),
              platforms: platform ? [platform] : [],
            }))
          }
          onAdd={() => navigate(buildConnectionsPath(dashboard?.brandId))}
        />

        {refreshNotice ? (
          <p className="mb-3 text-xs text-[var(--text-muted)]">{refreshNotice}</p>
        ) : null}
        {isHealthWarn ? (
          <span className="mb-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            Dados parcialmente indisponíveis
          </span>
        ) : null}

        {dashboard.status === "PUBLISHED" && (isHealthBlocked || isHealthWarn) ? (
          <div
            className={
              isHealthBlocked
                ? "mb-5 rounded-[16px] border border-purple-200 bg-purple-50 px-5 py-4"
                : "mb-5 rounded-[16px] border border-slate-200 bg-slate-50 px-5 py-4"
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">
                  {isHealthBlocked
                    ? "Configuração inválida"
                    : "Dados parcialmente indisponíveis"}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {isHealthBlocked
                    ? "Corrija widgets inválidos no editor para habilitar exportação e compartilhamento."
                    : "Alguns widgets não puderam ser carregados por falta de conexão."}
                </p>
              </div>
              {missingPlatforms.length ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate(buildConnectionsPath(dashboard.brandId, missingPlatforms[0]))
                  }
                >
                  Gerenciar conexões
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/relatorios/v2/${dashboard.id}/edit`)}
                >
                  Abrir no editor
                </Button>
              )}
            </div>

            {missingPlatforms.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {missingPlatforms.map((platform) => (
                  <span
                    key={platform}
                    className="rounded-full border border-purple-300 bg-white px-2.5 py-1 text-xs font-semibold text-purple-700"
                  >
                    {formatPlatform(platform)}
                  </span>
                ))}
              </div>
            ) : null}

            {invalidWidgets.length ? (
              <details className="mt-3 rounded-[12px] border border-[var(--border)] bg-white px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-[var(--text)]">
                  Ver detalhes
                </summary>
                <ul className="mt-2 space-y-2 text-sm text-[var(--text-muted)]">
                  {invalidWidgets.map((issue, index) => (
                    <li key={`${issue.widgetId || index}-${issue.status}-${issue.platform || ""}`}>
                      <span className="font-semibold text-[var(--text)]">
                        {widgetTitleById.get(issue.widgetId) ||
                          issue.widgetTitle ||
                          "Widget"}
                      </span>
                      {" - "}
                      {describeIssue(issue)}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        <ReporteiFiltersCards
          filters={filters}
          onChange={setFilters}
          shareUrl={shareUrl}
        />

        <div className="mt-6">
          {normalizedLayout ? (
            <>
              <ReporteiCoverCard
                title={dashboard.name}
                subtitle={dashboard.subtitle || "Análise de desempenho"}
                filters={filters}
                className="mb-4"
              />
              {pages.length > 1 ? (
                <div
                  role="tablist"
                  aria-label="Páginas do dashboard"
                  className="mb-4 flex flex-wrap gap-2 rounded-[16px] border border-[var(--border)] bg-white p-2"
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
                          : "rounded-[12px] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
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
                healthIssuesByWidgetId={healthIssuesByWidgetId}
                fetchReason={fetchReason}
                onWidgetStatusesChange={handleWidgetStatusesChange}
              />
            </>
          ) : (
            <div className="rounded-[16px] border border-[var(--border)] bg-white px-6 py-5 text-sm text-[var(--text-muted)]">
              Layout não encontrado para este dashboard.
            </div>
          )}
        </div>
      </div>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Exportar PDF</DialogTitle>
            <DialogDescription>
              Escolha o formato e o escopo da exportação. Os filtros atuais serão aplicados.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                Páginas
              </label>
              <Select value={exportPage} onValueChange={setExportPage}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Página atual</SelectItem>
                  {canExportAllPages ? (
                    <SelectItem value="all">Todas as páginas</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                Orientação
              </label>
              <Select value={exportOrientation} onValueChange={setExportOrientation}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Retrato</SelectItem>
                  <SelectItem value="landscape">Paisagem</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setExportOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmExport} disabled={exportMutation.isPending}>
              {exportMutation.isPending ? "Exportando..." : "Exportar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Compartilhar dashboard</DialogTitle>
            <DialogDescription>
              Gere um link público read-only para este dashboard.
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
                  Não foi possível carregar o status do compartilhamento.
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                Link público
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
                    dashboard?.status !== "PUBLISHED" ||
                    isHealthBlocked
                  }
                >
                  {createShareMutation.isPending ? "Gerando..." : "Gerar link"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleRotateShare}
                  disabled={!shareEnabled || rotateShareMutation.isPending || isHealthBlocked}
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
              {isHealthBlocked ? (
                <p className="mt-2 text-xs text-purple-700">
                  Compartilhamento bloqueado até corrigir widgets com configuração inválida.
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

      <Dialog open={Boolean(blockedAction)} onOpenChange={(open) => !open && setBlockedAction(null)}>
        <DialogContent className="max-w-[540px]">
          <DialogHeader>
            <DialogTitle>
              {blockedAction === "share"
                ? "Compartilhamento bloqueado"
                : "Exportação bloqueada"}
            </DialogTitle>
            <DialogDescription>
              {missingPlatforms.length
                ? `Não é possível ${blockedAction === "share" ? "compartilhar" : "exportar"} este relatório enquanto houver conexões pendentes.`
                : `Não é possível ${blockedAction === "share" ? "compartilhar" : "exportar"} este relatório enquanto houver widgets com configuração inválida.`}
            </DialogDescription>
          </DialogHeader>

          {missingPlatforms.length ? (
            <div className="flex flex-wrap gap-2">
              {missingPlatforms.map((platform) => (
                <span
                  key={`blocked-${platform}`}
                  className="rounded-full border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700"
                >
                  {formatPlatform(platform)}
                </span>
              ))}
            </div>
          ) : null}

          <DialogFooter className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setBlockedAction(null)}>
              Fechar
            </Button>
            <Button
              onClick={() => {
                const firstPlatform = missingPlatforms[0] || null;
                setBlockedAction(null);
                if (missingPlatforms.length) {
                  navigate(buildConnectionsPath(dashboard?.brandId, firstPlatform));
                  return;
                }
                navigate(`/relatorios/v2/${dashboard?.id}/edit`);
              }}
            >
              {missingPlatforms.length ? "Gerenciar conexões" : "Abrir no editor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toast toast={toast} />
    </ThemeProvider>
  );
}
