import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Postcard from "./postcard.jsx";
import {
  WORKFLOW_STATUS_CONFIG,
  WORKFLOW_STATUS_ORDER,
  resolveWorkflowStatus,
} from "@/utils/postStatus.js";

export default function Postkanban({
  posts = [],
  clients = [],
  integrations = [],
  onEdit,
  onStatusChange,
  isLoading,
  collapsedColumns,
  onCollapsedChange,
}) {
  const isControlled = collapsedColumns !== undefined;
  const [internalCollapsed, setInternalCollapsed] = React.useState(
    () => collapsedColumns || {}
  );

  React.useEffect(() => {
    if (!isControlled) return;
    setInternalCollapsed(collapsedColumns || {});
  }, [collapsedColumns, isControlled]);

  const collapsed = isControlled ? collapsedColumns || internalCollapsed : internalCollapsed;
  const [dragState, setDragState] = React.useState(null);
  const [dragOverKey, setDragOverKey] = React.useState(null);

  const parseDragPayload = (event) => {
    const types = Array.from(event.dataTransfer?.types || []);
    if (!types.includes("application/x-kondor-post")) return null;
    const raw = event.dataTransfer?.getData("application/x-kondor-post");
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (error) {
        return null;
      }
    }
    return null;
  };

  const handleDragStart = React.useCallback(
    (event, postId, fromStatus) => {
      if (!onStatusChange) return;
      const payload = { postId, fromStatus };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-kondor-post", JSON.stringify(payload));
      event.dataTransfer.setData("text/plain", String(postId));
      setDragState(payload);
    },
    [onStatusChange]
  );

  const handleDragEnd = React.useCallback(() => {
    setDragState(null);
    setDragOverKey(null);
  }, []);

  const handleDragOver = React.useCallback(
    (event, statusKey) => {
      if (!dragState) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dragOverKey !== statusKey) setDragOverKey(statusKey);
    },
    [dragState, dragOverKey]
  );

  const handleDrop = React.useCallback(
    (event, statusKey) => {
      if (!onStatusChange) return;
      event.preventDefault();
      const payload = dragState || parseDragPayload(event);
      setDragState(null);
      setDragOverKey(null);
      if (!payload?.postId) return;
      if (payload.fromStatus && payload.fromStatus === statusKey) return;
      onStatusChange(payload.postId, statusKey);
    },
    [dragState, onStatusChange]
  );

  const groupedPosts = React.useMemo(() => {
    const next = {};
    WORKFLOW_STATUS_ORDER.forEach((key) => {
      next[key] = [];
    });
    (posts || []).forEach((post) => {
      const statusKey = resolveWorkflowStatus(post);
      if (!next[statusKey]) next[statusKey] = [];
      next[statusKey].push(post);
    });
    return next;
  }, [posts]);

  const clientMap = React.useMemo(() => {
    const map = new Map();
    (clients || []).forEach((client) => {
      if (client?.id) map.set(client.id, client);
    });
    return map;
  }, [clients]);

  const integrationMap = React.useMemo(() => {
    const map = new Map();
    (integrations || []).forEach((integration) => {
      if (integration?.id) map.set(integration.id, integration);
    });
    return map;
  }, [integrations]);

  const renderSkeletonColumn = () => (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-[16px] bg-slate-100 animate-pulse" />
      ))}
    </div>
  );

  const renderEmptyColumn = () => (
    <div className="rounded-[12px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
      Nenhum post nesta coluna.
    </div>
  );

  const toggleColumn = (key) => {
    const next = {
      ...collapsed,
      [key]: !collapsed?.[key],
    };
    setInternalCollapsed(next);
    if (onCollapsedChange) onCollapsedChange(next);
  };

  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex w-full gap-4 overflow-x-auto pb-3">
        {WORKFLOW_STATUS_ORDER.map((key) => {
          const config = WORKFLOW_STATUS_CONFIG[key];
          const Icon = config?.icon;
          const accent = config?.accent || "bg-slate-200";
          const accentSoft = config?.accentSoft || "bg-[var(--surface-muted)]";
          const accentBorder = config?.accentBorder || "border-[var(--border)]";
          const accentText = config?.accentText || "text-[var(--text-muted)]";
          const isCollapsed = Boolean(collapsed?.[key]);
          const isDragOver = dragOverKey === key;
          const items = groupedPosts[key] || [];
          const dragHandlers = onStatusChange
            ? {
                onDragOver: (event) => handleDragOver(event, key),
                onDrop: (event) => handleDrop(event, key),
              }
            : {};

          return (
            <section
              key={key}
              className={`flex-shrink-0 transition-[width] duration-200 ease-out ${
                isCollapsed ? "w-[84px]" : "w-[400px]"
              }`}
            >
              <div
                className={`flex h-full flex-col rounded-[18px] border ${accentBorder} bg-white p-4 shadow-[var(--shadow-sm)] transition ${
                  isDragOver ? "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-white" : ""
                }`}
                {...dragHandlers}
              >
                <div className={`h-1.5 w-full rounded-full ${accent}`} aria-hidden="true" />
                <header
                  className={`mt-3 flex items-start justify-between gap-3 rounded-[14px] border ${accentBorder} ${accentSoft} px-3 py-2 ${
                    isCollapsed ? "flex-col items-center text-center" : ""
                  }`}
                >
                  <div
                    className={`flex items-start gap-2 ${isCollapsed ? "flex-col items-center" : ""}`}
                  >
                    {Icon ? (
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-[12px] border ${accentBorder} bg-white/80`}
                      >
                        <Icon
                          className={`h-4 w-4 ${config?.tone || "text-slate-500"}`}
                        />
                      </span>
                    ) : null}
                    {!isCollapsed ? (
                      <div>
                        <p className="text-sm font-semibold text-[var(--text)]">
                          {config?.label}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {config?.description}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div
                    className={`flex items-center gap-2 ${isCollapsed ? "flex-col" : ""}`}
                  >
                    <span
                      className={`rounded-full border ${accentBorder} bg-white px-2.5 py-1 text-xs font-semibold ${accentText}`}
                    >
                      {items.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleColumn(key)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${accentBorder} text-[var(--text-muted)] transition hover:bg-white`}
                      aria-label={isCollapsed ? "Expandir coluna" : "Recolher coluna"}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronLeft className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </header>

                {!isCollapsed ? (
                  <div
                    className="mt-5 flex-1 space-y-3 overflow-y-auto pr-1"
                    style={{ maxHeight: "calc(100vh - 280px)" }}
                  >
                    {isLoading
                      ? renderSkeletonColumn()
                      : items.length === 0
                      ? renderEmptyColumn()
                      : items.map((post) => (
                          <Postcard
                            key={post.id}
                            post={post}
                            client={clientMap.get(post.clientId)}
                            integration={
                              integrationMap.get(
                                post.integrationId ||
                                  post.integration_id ||
                                  post.metadata?.integrationId ||
                                  post.metadata?.integration_id
                              ) || null
                            }
                            onEdit={onEdit}
                            onStatusChange={onStatusChange}
                            draggable={Boolean(onStatusChange)}
                            onDragStart={(event) => handleDragStart(event, post.id, key)}
                            onDragEnd={handleDragEnd}
                            isDragging={dragState?.postId === post.id}
                          />
                        ))}
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
