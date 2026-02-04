import React from "react";
import WidgetRenderer from "./WidgetRenderer.jsx";
import WidgetEmptyState from "@/components/reports/widgets/WidgetEmptyState.jsx";
import { normalizeLayoutFront, getActivePage } from "./utils.js";

function buildGridStyle(layout) {
  const x = Number(layout?.x || 0);
  const y = Number(layout?.y || 0);
  const w = Number(layout?.w || 12);
  const h = Number(layout?.h || 4);
  return {
    gridColumnStart: x + 1,
    gridColumnEnd: x + w + 1,
    gridRowStart: y + 1,
    gridRowEnd: y + h + 1,
    minHeight: "100%",
  };
}

export default function DashboardRenderer({
  layout,
  dashboardId,
  brandId,
  publicToken,
  activePageId,
  globalFilters,
}) {
  const normalized = normalizeLayoutFront(layout);
  const activePage = getActivePage(normalized, activePageId);
  const widgets = Array.isArray(activePage?.widgets) ? activePage.widgets : [];

  if (!widgets.length) {
    return (
      <WidgetEmptyState
        title="Nenhum widget configurado"
        description="Este dashboard ainda nao possui widgets."
        variant="no-data"
      />
    );
  }

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
        gridAutoRows: "28px",
      }}
    >
      {widgets.map((widget) => {
        const hasTitle = Boolean(String(widget?.title || "").trim());
        const showHeader = widget?.type !== "text" || hasTitle;
        return (
          <div
            key={widget.id}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-sm)]"
            style={buildGridStyle(widget.layout)}
          >
            {showHeader ? (
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {widget.title || "Widget"}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {String(widget.type || "").toUpperCase()}
                  </p>
                </div>
              </div>
            ) : null}
            <div
              className={
                showHeader
                  ? "h-[calc(100%-48px)] min-h-[120px]"
                  : "h-full min-h-[120px]"
              }
            >
              <WidgetRenderer
                widget={widget}
                dashboardId={dashboardId}
                brandId={brandId}
                publicToken={publicToken}
                pageId={activePage?.id}
                globalFilters={globalFilters}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
