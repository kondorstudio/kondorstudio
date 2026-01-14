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
}) {
  return (
    <div ref={containerRef}>
      <GridLayout
        layout={layout}
        cols={12}
        rowHeight={rowHeight}
        margin={margin}
        width={width}
        isDraggable={isEditable}
        isResizable={isEditable}
        onLayoutChange={onLayoutChange}
      >
        {items.map((item) => (
          <div key={item.id} className="h-full">
            {renderItem(item)}
          </div>
        ))}
      </GridLayout>
    </div>
  );
}
