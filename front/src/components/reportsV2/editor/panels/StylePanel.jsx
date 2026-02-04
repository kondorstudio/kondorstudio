import React from "react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Checkbox } from "@/components/ui/checkbox.jsx";
import { PIE_DEFAULTS } from "@/components/reportsV2/widgets/pieUtils.js";

const LEGEND_WIDGETS = new Set(["timeseries", "bar", "pie", "donut"]);

function normalizeTopN(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return PIE_DEFAULTS.topN;
  return Math.max(3, Math.min(20, Math.round(numeric)));
}

export default function StylePanel({
  widget,
  formatOptions,
  onTitleChange,
  onShowLegendChange,
  onFormatChange,
  onTextContentChange,
  onVariantChange,
  onPieOptionsChange,
}) {
  const [titleDraft, setTitleDraft] = React.useState("");
  const [textDraft, setTextDraft] = React.useState("");
  const [topNDraft, setTopNDraft] = React.useState(String(PIE_DEFAULTS.topN));
  const [othersLabelDraft, setOthersLabelDraft] = React.useState(PIE_DEFAULTS.othersLabel);

  React.useEffect(() => {
    if (!widget) return;
    setTitleDraft(String(widget.title || ""));
    setTextDraft(String(widget?.content?.text || ""));
    setTopNDraft(
      Number.isFinite(Number(widget?.viz?.options?.topN))
        ? String(widget.viz.options.topN)
        : String(PIE_DEFAULTS.topN)
    );
    setOthersLabelDraft(
      String(widget?.viz?.options?.othersLabel || "").trim() || PIE_DEFAULTS.othersLabel
    );
  }, [
    widget?.id,
    widget?.title,
    widget?.content?.text,
    widget?.viz?.options?.topN,
    widget?.viz?.options?.othersLabel,
  ]);

  if (!widget) return null;

  const commitTitle = () => {
    if (titleDraft === String(widget.title || "")) return;
    onTitleChange(titleDraft);
  };

  const commitText = () => {
    if (textDraft === String(widget?.content?.text || "")) return;
    onTextContentChange(textDraft);
  };

  const formatValue = formatOptions.some(
    (option) => option.value === widget?.viz?.format
  )
    ? widget.viz.format
    : "auto";
  const isPieLike = widget.type === "pie" || widget.type === "donut";
  const variantValue =
    widget?.viz?.variant === "donut" || widget.type === "donut" ? "donut" : "pie";
  const showOthers = widget?.viz?.options?.showOthers !== false;

  if (widget.type === "text") {
    return (
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Titulo do bloco
          </label>
          <Input
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitTitle}
            placeholder="Titulo opcional"
          />
        </div>
        <div>
          <label
            htmlFor={`widget-text-content-${widget.id}`}
            className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]"
          >
            Conteudo
          </label>
          <textarea
            id={`widget-text-content-${widget.id}`}
            className="min-h-[140px] w-full rounded-[12px] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            value={textDraft}
            onChange={(event) => setTextDraft(event.target.value)}
            onBlur={commitText}
            placeholder="Digite seu texto..."
          />
        </div>
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-muted)]">
          Blocos de texto usam formato plain neste momento.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Titulo do widget
        </label>
        <Input
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={commitTitle}
          placeholder="Nome do widget"
        />
      </div>

      {LEGEND_WIDGETS.has(widget.type) ? (
        <div className="flex items-center justify-between rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">
              Mostrar legenda
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Disponivel para graficos com series.
            </p>
          </div>
          <Checkbox
            checked={widget.viz?.showLegend !== false}
            onCheckedChange={(checked) => onShowLegendChange(Boolean(checked))}
          />
        </div>
      ) : null}

      {isPieLike ? (
        <>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Variante
            </label>
            <Select value={variantValue} onValueChange={onVariantChange}>
              <SelectTrigger>
                <SelectValue placeholder="Pie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pie">Pie</SelectItem>
                <SelectItem value="donut">Donut</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label
              htmlFor={`widget-topn-${widget.id}`}
              className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]"
            >
              Top N (3-20)
            </label>
            <Input
              id={`widget-topn-${widget.id}`}
              type="number"
              min={3}
              max={20}
              value={topNDraft}
              onChange={(event) => setTopNDraft(event.target.value)}
              onBlur={() =>
                onPieOptionsChange({
                  topN: normalizeTopN(topNDraft),
                })
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">
                Agrupar outros
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Combina categorias fora do Top N.
              </p>
            </div>
            <Checkbox
              checked={showOthers}
              onCheckedChange={(checked) =>
                onPieOptionsChange({
                  showOthers: Boolean(checked),
                })
              }
            />
          </div>

          <div>
            <label
              htmlFor={`widget-others-label-${widget.id}`}
              className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]"
            >
              Rotulo de outros
            </label>
            <Input
              id={`widget-others-label-${widget.id}`}
              value={othersLabelDraft}
              onChange={(event) => setOthersLabelDraft(event.target.value)}
              onBlur={() =>
                onPieOptionsChange({
                  othersLabel:
                    String(othersLabelDraft || "").trim() || PIE_DEFAULTS.othersLabel,
                })
              }
              disabled={!showOthers}
            />
          </div>
        </>
      ) : null}

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Formato
        </label>
        <Select value={formatValue} onValueChange={onFormatChange}>
          <SelectTrigger>
            <SelectValue placeholder="Auto" />
          </SelectTrigger>
          <SelectContent>
            {formatOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-muted)]">
        Usa o tema do dashboard para cores, bordas e radius.
      </div>
    </div>
  );
}
