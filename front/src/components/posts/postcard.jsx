import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Building2, CalendarDays, ChevronDown, GripVertical } from "lucide-react";
import {
  getWorkflowStatuses,
  getWorkflowStatusConfig,
  resolveWorkflowStatus,
} from "@/utils/postStatus.js";

const STATUS_OPTIONS = getWorkflowStatuses();

function formatDate(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveNetworkLabel(post, integration) {
  const kind =
    integration?.settings?.kind ||
    post?.metadata?.integrationKind ||
    post?.metadata?.integration_kind ||
    null;

  if (kind === "meta_business") return "Meta Business";
  if (kind === "instagram_only") return "Instagram";
  if (kind === "tiktok") return "TikTok";

  const platform = post?.platform || null;
  if (platform === "instagram") return "Instagram";
  if (platform === "tiktok") return "TikTok";
  if (platform === "meta_business") return "Meta Business";

  if (integration?.providerName) return integration.providerName;
  if (integration?.provider) return integration.provider;

  const providerMeta =
    post?.metadata?.integrationProvider ||
    post?.metadata?.integration_provider ||
    null;
  if (providerMeta) return String(providerMeta);

  return null;
}

function resolvePostType(post) {
  const postKind =
    post?.postKind ||
    post?.post_kind ||
    post?.metadata?.postKind ||
    post?.metadata?.post_kind ||
    null;
  if (typeof postKind === "string") {
    const normalized = postKind.toLowerCase();
    if (normalized === "story") return "Story";
    if (normalized === "reel" || normalized === "reels") return "Reel";
    if (normalized === "feed") return "Feed";
  }

  const mediaType = post?.mediaType || post?.media_type;
  if (mediaType === "video") return "Video";
  if (mediaType === "carousel") return "Carrossel";
  return "Imagem";
}

const POST_KIND_LABELS = {
  feed: "Feed",
  story: "Story",
  reel: "Reel",
};

function normalizePostKinds(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = list
    .map((item) => (item ? String(item).trim().toLowerCase() : ""))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function resolvePostTypeLabels(post) {
  const rawKinds =
    post?.postKinds ||
    post?.post_kinds ||
    post?.metadata?.postKinds ||
    post?.metadata?.post_kinds ||
    post?.postKind ||
    post?.post_kind ||
    post?.metadata?.postKind ||
    post?.metadata?.post_kind ||
    null;
  const normalizedKinds = normalizePostKinds(rawKinds);
  if (normalizedKinds.length > 0) {
    return normalizedKinds.map((kind) => POST_KIND_LABELS[kind] || kind);
  }
  const fallback = resolvePostType(post);
  return fallback ? [fallback] : [];
}

function normalizePlatforms(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = list
    .map((item) => (item ? String(item).trim().toLowerCase() : ""))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function resolvePlatformLabel(value) {
  if (value === "instagram") return "Instagram";
  if (value === "facebook") return "Facebook";
  if (value === "tiktok") return "TikTok";
  if (value === "meta_business") return "Meta Business";
  return value;
}

function resolveNetworkLabels(post, integration) {
  const rawPlatforms =
    post?.platforms ||
    post?.platform_list ||
    post?.metadata?.platforms ||
    post?.metadata?.platform_list ||
    post?.platform ||
    post?.metadata?.platform ||
    null;
  const platforms = normalizePlatforms(rawPlatforms);
  if (platforms.length > 0) {
    return platforms.map(resolvePlatformLabel);
  }
  const fallback = resolveNetworkLabel(post, integration);
  return fallback ? [fallback] : [];
}

export default function Postcard({
  post,
  client,
  integration,
  onEdit,
  onStatusChange,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDragging = false,
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [localStatus, setLocalStatus] = React.useState(resolveWorkflowStatus(post));
  const triggerRef = React.useRef(null);
  const menuContentRef = React.useRef(null);
  const [menuPosition, setMenuPosition] = React.useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const clientFeedback = (post.clientFeedback || "").trim();
  const hasClientFeedback = Boolean(clientFeedback);
  const publishErrorMessage =
    typeof post?.metadata?.publishError?.message === "string"
      ? post.metadata.publishError.message
      : "";
  const hasPublishError = Boolean(publishErrorMessage);
  const statusConfig = getWorkflowStatusConfig(localStatus);

  const updateMenuPosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    setLocalStatus(resolveWorkflowStatus(post));
  }, [post]);

  const handleStatusChange = (newStatus) => {
    if (!onStatusChange) return;
    onStatusChange(post.id, newStatus);
  };

  const scheduledLabel = formatDate(
    post.scheduledAt || post.scheduled_at || post.scheduledDate || post.publishedDate
  );
  const networkLabels = resolveNetworkLabels(post, integration);
  const description = post.body || post.caption;
  const typeLabels = resolvePostTypeLabels(post);

  React.useEffect(() => {
    function handleClickOutside(event) {
      const triggerEl = triggerRef.current;
      const menuEl = menuContentRef.current;
      if (
        (triggerEl && triggerEl.contains(event.target)) ||
        (menuEl && menuEl.contains(event.target))
      ) {
        return;
      }
      setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  React.useEffect(() => {
    if (!menuOpen) return;
    updateMenuPosition();
    const handleReposition = () => updateMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [menuOpen, updateMenuPosition]);

  const triggerStatusMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  const selectStatus = (event, value) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(false);
    if (value === localStatus) return;
    setLocalStatus(value);
    handleStatusChange(value);
  };

  return (
    <Card
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group relative w-full overflow-hidden border border-[var(--border)] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-60" : ""
      }`}
      onClick={(event) => {
        if (isDragging) return;
        // Prevent default click behavior to keep scroll position stable.
        event.preventDefault();
        onEdit && onEdit(post);
      }}
      role="button"
      tabIndex={0}
    >
      <div
        className={`absolute left-0 top-0 h-full w-1.5 ${statusConfig.accent || "bg-slate-300"}`}
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={triggerStatusMenu}
            ref={triggerRef}
            className={`inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-[11px] font-semibold ${statusConfig.badge} shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]`}
            aria-label="Alterar status do post"
          >
            <span
              className={`h-2 w-2 rounded-full ${statusConfig.accent || "bg-slate-300"}`}
              aria-hidden="true"
            />
            <span>{statusConfig.label}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
          <div className="pointer-events-none flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-70 transition group-hover:opacity-100">
            <GripVertical className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Arraste</span>
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold leading-tight text-[var(--text)] line-clamp-2">
            {post.title || "Post sem titulo"}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Building2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="font-medium text-[var(--text)]">
              {client?.name || "Cliente nao informado"}
            </span>
          </div>
        </div>

        <div
          className={`flex items-center justify-between gap-3 rounded-[12px] border ${statusConfig.accentBorder || "border-[var(--border)]"} ${statusConfig.accentSoft || "bg-[var(--surface-muted)]"} px-3 py-2`}
        >
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            <CalendarDays
              className={`h-3.5 w-3.5 ${statusConfig.accentText || "text-[var(--text-muted)]"}`}
            />
            Publicacao
          </div>
          <span
            className={`text-xs font-semibold ${
              scheduledLabel ? "text-[var(--text)]" : "text-[var(--text-muted)]"
            }`}
          >
            {scheduledLabel || "Sem data"}
          </span>
        </div>

        {(description || hasClientFeedback || hasPublishError) && (
          <div className="space-y-3">
            {hasPublishError && (
              <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                  Erro ao publicar
                </p>
                <p className="text-xs text-rose-800 line-clamp-2 whitespace-pre-line">
                  {publishErrorMessage}
                </p>
              </div>
            )}
            {description && (
              <p className="text-xs text-[var(--text-muted)] line-clamp-2 whitespace-pre-line">
                {description}
              </p>
            )}
            {hasClientFeedback && (
              <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Ajustes solicitados
                </p>
                <p className="text-xs text-amber-800 line-clamp-2 whitespace-pre-line">
                  {clientFeedback}
                </p>
              </div>
            )}
          </div>
        )}

        {(typeLabels.length > 0 || networkLabels.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {typeLabels.map((label) => (
              <Badge key={`type-${label}`} variant="outline" className="text-[10px]">
                {label}
              </Badge>
            ))}
            {networkLabels.map((label) => (
              <Badge key={`network-${label}`} variant="outline" className="text-[10px]">
                {label}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end border-t border-[var(--border)] pt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onEdit && onEdit(post);
            }}
          >
            Detalhes
          </Button>
        </div>
      </div>
      {menuOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuContentRef}
            className="fixed z-50 rounded-[12px] border border-[var(--border)] bg-white p-1 shadow-[var(--shadow-md)]"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              minWidth: menuPosition.width,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {STATUS_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.key}
                onClick={(event) => selectStatus(event, opt.key)}
                className={`w-full rounded-[10px] px-3 py-2 text-left text-xs transition ${
                  opt.key === localStatus
                    ? "bg-[var(--primary-light)] text-[var(--primary)] font-semibold"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </Card>
  );
}
