import React from "react";
import WidgetRenderer from "./WidgetRenderer.jsx";
import WidgetEmptyState from "@/components/reports/widgets/WidgetEmptyState.jsx";

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
  globalFilters,
}) {
  const widgets = Array.isArray(layout?.widgets) ? layout.widgets : [];

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
      {widgets.map((widget) => (
        <div
          key={widget.id}
          className="rounded-[16px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]"
          style={buildGridStyle(widget.layout)}
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">
                {widget.title}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {String(widget.type || "").toUpperCase()}
              </p>
            </div>
          </div>
          <div className="h-[calc(100%-48px)] min-h-[120px]">
            <WidgetRenderer
              widget={widget}
              dashboardId={dashboardId}
              brandId={brandId}
              globalFilters={globalFilters}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
