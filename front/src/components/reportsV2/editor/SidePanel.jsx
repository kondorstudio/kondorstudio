import React from "react";
import { Settings2 } from "lucide-react";
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
  onShowTitleChange,
  onShowLegendChange,
  onGridlinesChange,
  onFormatChange,
  onTextContentChange,
  onVariantChange,
  onPieOptionsChange,
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Configurações</p>
          <p className="text-xs text-slate-500">
            Ajuste dados e estilo do widget.
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[var(--primary)]">
          <Settings2 className="h-4 w-4" />
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
              onShowTitleChange={onShowTitleChange}
              onShowLegendChange={onShowLegendChange}
              onGridlinesChange={onGridlinesChange}
              onFormatChange={onFormatChange}
              onTextContentChange={onTextContentChange}
              onVariantChange={onVariantChange}
              onPieOptionsChange={onPieOptionsChange}
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
