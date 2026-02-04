import React from "react";
import { AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.jsx";
import DataPanel from "@/components/reportsV2/editor/panels/DataPanel.jsx";
import StylePanel from "@/components/reportsV2/editor/panels/StylePanel.jsx";

export default function SidePanel({
  selectedWidget,
  activeTab,
  onTabChange,
  validationSummary,
  widgetTypes,
  metricOptions,
  dimensionOptions,
  formatOptions,
  onWidgetTypeChange,
  onToggleMetric,
  onDimensionChange,
  onFiltersChange,
  onSortChange,
  onLimitChange,
  onTitleChange,
  onShowLegendChange,
  onFormatChange,
}) {
  return (
    <div className="sticky top-24 rounded-[20px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">Configurações</p>
          <p className="text-xs text-[var(--text-muted)]">
            Ajuste dados e estilo do widget.
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--surface-muted)] text-[var(--primary)]">
          <AlertTriangle className="h-5 w-5" />
        </div>
      </div>

      {validationSummary.length ? (
        <div className="mb-4 rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em]">
            Erros do layout
          </p>
          <ul className="space-y-1">
            {validationSummary.map((issue) => (
              <li key={issue.key}>
                <span className="font-semibold">{issue.widgetTitle}</span>:{" "}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selectedWidget ? (
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className="w-full justify-between">
            <TabsTrigger value="data">Dados</TabsTrigger>
            <TabsTrigger value="style">Estilo</TabsTrigger>
          </TabsList>

          <TabsContent value="data" className="mt-4">
            <DataPanel
              widget={selectedWidget}
              widgetTypes={widgetTypes}
              metricOptions={metricOptions}
              dimensionOptions={dimensionOptions}
              onWidgetTypeChange={onWidgetTypeChange}
              onToggleMetric={onToggleMetric}
              onDimensionChange={onDimensionChange}
              onFiltersChange={onFiltersChange}
              onSortChange={onSortChange}
              onLimitChange={onLimitChange}
            />
          </TabsContent>

          <TabsContent value="style" className="mt-4">
            <StylePanel
              widget={selectedWidget}
              formatOptions={formatOptions}
              onTitleChange={onTitleChange}
              onShowLegendChange={onShowLegendChange}
              onFormatChange={onFormatChange}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="rounded-[12px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          Selecione um widget para editar.
        </div>
      )}
    </div>
  );
}
