import React from "react";
import { useContainerWidth } from "react-grid-layout";
import WidgetRenderer from "./WidgetRenderer.jsx";
import WidgetEmptyState from "@/components/reports/widgets/WidgetEmptyState.jsx";
import DashboardCanvas from "@/components/reportsV2/editor/DashboardCanvas.jsx";
import { normalizeLayoutFront, getActivePage } from "./utils.js";

const CANVAS_ROW_HEIGHT = 28;
const CANVAS_MARGIN = [16, 16];

function normalizeLayoutItem(widget) {
  const layout = widget?.layout || {};
  const w = Math.max(1, Number(layout?.w || 3));
  const h = Math.max(1, Number(layout?.h || 3));
  const x = Math.max(0, Number(layout?.x || 0));
  const y = Math.max(0, Number(layout?.y || 0));
  return {
    i: widget?.id || `${x}-${y}`,
    x,
    y,
    w,
    h,
    minW: Math.max(1, Number(layout?.minW || 2)),
    minH: Math.max(1, Number(layout?.minH || 2)),
  };
}

export default function DashboardRenderer({
  layout,
  dashboardId,
  brandId,
  publicToken,
  activePageId,
  globalFilters,
  healthIssuesByWidgetId,
  fetchReason,
  onWidgetStatusesChange,
  onWidgetMetaChange,
}) {
  const { width, containerRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 960,
  });
  const normalized = normalizeLayoutFront(layout);
  const activePage = getActivePage(normalized, activePageId);
  const widgets = Array.isArray(activePage?.widgets) ? activePage.widgets : [];
  const rglLayout = React.useMemo(
    () => widgets.map((widget) => normalizeLayoutItem(widget)),
    [widgets]
  );
  const [widgetStatuses, setWidgetStatuses] = React.useState({});
  const widgetIdsKey = React.useMemo(
    () => widgets.map((widget) => widget?.id).filter(Boolean).join("|"),
    [widgets]
  );
  const widgetIds = React.useMemo(
    () => (widgetIdsKey ? widgetIdsKey.split("|").filter(Boolean) : []),
    [widgetIdsKey]
  );

  React.useEffect(() => {
    setWidgetStatuses((prev) => {
      const next = {};
      widgetIds.forEach((widgetId) => {
        next[widgetId] = prev?.[widgetId] || { status: "loading", reason: null };
      });
      const prevKeys = Object.keys(prev || {});
      if (
        prevKeys.length === widgetIds.length &&
        widgetIds.every((widgetId) => {
          const previous = prev?.[widgetId] || { status: "loading", reason: null };
          const current = next[widgetId];
          return (
            previous.status === current.status && previous.reason === current.reason
          );
        })
      ) {
        return prev;
      }
      return next;
    });
  }, [widgetIds, widgetIdsKey]);

  const resolvedStatuses = React.useMemo(() => {
    const next = {};
    widgets.forEach((widget) => {
      if (!widget?.id) return;
      next[widget.id] = widgetStatuses?.[widget.id] || {
        status: "loading",
        reason: null,
      };
    });
    return next;
  }, [widgetStatuses, widgets]);

  React.useEffect(() => {
    if (!onWidgetStatusesChange) return;
    onWidgetStatusesChange({
      pageId: activePage?.id || null,
      statuses: resolvedStatuses,
    });
  }, [activePage?.id, onWidgetStatusesChange, resolvedStatuses]);

  const handleWidgetStatusChange = React.useCallback((widgetId, payload) => {
    if (!widgetId) return;
    setWidgetStatuses((prev) => {
      const current = prev?.[widgetId];
      const nextPayload = {
        status: payload?.status || "loading",
        reason: payload?.reason || null,
      };
      if (
        current &&
        current.status === nextPayload.status &&
        current.reason === nextPayload.reason
      ) {
        return prev;
      }
      return {
        ...(prev || {}),
        [widgetId]: nextPayload,
      };
    });
  }, []);

  if (!widgets.length) {
    return (
      <WidgetEmptyState
        title="Nenhum widget configurado"
        description="Este dashboard ainda não possui widgets."
        variant="no-data"
      />
    );
  }

  return (
    <DashboardCanvas
      layout={rglLayout}
      items={widgets}
      width={width}
      containerRef={containerRef}
      rowHeight={CANVAS_ROW_HEIGHT}
      margin={CANVAS_MARGIN}
      renderItem={(widget) => {
        const hasTitle = Boolean(String(widget?.title || "").trim());
        const showTitle = widget?.viz?.options?.showTitle !== false;
        const showHeader = showTitle && (widget?.type !== "text" || hasTitle);
        return (
          <div className="h-full overflow-hidden rounded-[12px] border border-[#dbe3ed] bg-[var(--card)] p-3 shadow-none">
            {showHeader ? (
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-bold text-[var(--text)]">
                    {widget.title || "Widget"}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {String(widget.type || "").toUpperCase()}
                  </p>
                </div>
              </div>
            ) : null}
            <div
              className={
                showHeader
                  ? "h-[calc(100%-48px)] min-h-0 overflow-auto"
                  : "h-full min-h-0 overflow-auto"
              }
            >
              <WidgetRenderer
                widget={widget}
                dashboardId={dashboardId}
                brandId={brandId}
                publicToken={publicToken}
                pageId={activePage?.id}
                globalFilters={globalFilters}
                healthIssue={healthIssuesByWidgetId?.[widget.id] || null}
                fetchReason={fetchReason}
                onStatusChange={handleWidgetStatusChange}
                onMetaChange={onWidgetMetaChange}
              />
            </div>
          </div>
        );
      }}
    />
  );
}
