import React from "react";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

export default function DashboardCanvas({
  layout,
  items,
  renderItem,
  width,
  containerRef,
  onLayoutChange,
  isEditable = false,
  rowHeight = 32,
  margin = [16, 16],
  onDragStart,
  onDrag,
  onDragStop,
  onResizeStart,
  onResize,
  onResizeStop,
}) {
  const safeLayout = Array.isArray(layout) ? layout : [];
  const safeItems = Array.isArray(items) ? items : [];
  const safeWidth = Number.isFinite(width) ? width : 0;

  if (!safeWidth) {
    return (
      <div
        ref={containerRef}
        className="flex min-h-[180px] items-center justify-center text-xs text-[var(--text-muted)]"
      >
        Carregando area de widgets...
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <GridLayout
        layout={safeLayout}
        cols={12}
        rowHeight={rowHeight}
        margin={margin}
        width={safeWidth}
        isDraggable={isEditable}
        isResizable={isEditable}
        onLayoutChange={onLayoutChange}
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragStop={onDragStop}
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeStop={onResizeStop}
      >
        {safeItems.map((item, index) => {
          const key = item?.id || item?.i || `item-${index + 1}`;
          return (
            <div key={key} className="h-full">
              {renderItem(item)}
            </div>
          );
        })}
      </GridLayout>
    </div>
  );
}
