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
        <div key={i} className="h-20 rounded-[12px] bg-slate-100 animate-pulse" />
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
          const isCollapsed = Boolean(collapsed?.[key]);
          const items = groupedPosts[key] || [];

          return (
            <section
              key={key}
              className={`flex-shrink-0 transition-[width] duration-200 ease-out ${
                isCollapsed ? "w-[72px]" : "w-[340px]"
              }`}
            >
              <div className="flex h-full flex-col rounded-[16px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
                <header
                  className={`flex items-start justify-between gap-2 ${
                    isCollapsed ? "flex-col" : ""
                  }`}
                >
                  <div
                    className={`flex items-start gap-2 ${isCollapsed ? "flex-col" : ""}`}
                  >
                    {Icon ? (
                      <Icon
                        className={`h-5 w-5 ${config?.tone || "text-slate-500"}`}
                      />
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
                    <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--text)]">
                      {items.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleColumn(key)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
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
                    className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1"
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
