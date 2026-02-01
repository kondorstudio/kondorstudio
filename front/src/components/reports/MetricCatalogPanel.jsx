import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Button } from "@/components/ui/button.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import Checkbox from "@/components/ui/checkbox.jsx";

const SOURCE_OPTIONS = [
  { value: "META_ADS", label: "Meta Ads" },
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "TIKTOK_ADS", label: "TikTok Ads" },
  { value: "LINKEDIN_ADS", label: "LinkedIn Ads" },
  { value: "GA4", label: "Google Analytics 4" },
  { value: "GBP", label: "Google Meu Negocio" },
  { value: "META_SOCIAL", label: "Facebook/Instagram" },
];

const TYPE_OPTIONS = [
  { value: "METRIC", label: "Metricas" },
  { value: "DIMENSION", label: "Dimensoes" },
];

function splitCsv(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function MetricCatalogDialog({ open, onOpenChange, defaults }) {
  const queryClient = useQueryClient();
  const [source, setSource] = useState(defaults.source);
  const [level, setLevel] = useState(defaults.level);
  const [type, setType] = useState(defaults.type);
  const [metricKey, setMetricKey] = useState("");
  const [dimensionKey, setDimensionKey] = useState("");
  const [label, setLabel] = useState("");
  const [charts, setCharts] = useState("");
  const [breakdowns, setBreakdowns] = useState("");
  const [isCalculated, setIsCalculated] = useState(false);
  const [formula, setFormula] = useState("");
  const [format, setFormat] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSource(defaults.source);
    setLevel(defaults.level);
    setType(defaults.type);
    setMetricKey("");
    setDimensionKey("");
    setLabel("");
    setCharts("");
    setBreakdowns("");
    setIsCalculated(false);
    setFormula("");
    setFormat("");
    setDescription("");
    setError("");
  }, [open, defaults.source, defaults.level, defaults.type]);

  useEffect(() => {
    if (isCalculated && type !== "METRIC") {
      setType("METRIC");
    }
  }, [isCalculated, type]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!source) throw new Error("Fonte obrigatoria.");
      if (!level) throw new Error("Nivel obrigatorio.");
      if (!metricKey) throw new Error("Metric key obrigatoria.");
      if (!label) throw new Error("Label obrigatoria.");
      if (isCalculated && !formula.trim()) {
        throw new Error("Formula obrigatoria para metrica calculada.");
      }

      return base44.reporting.createMetricCatalog({
        source,
        level,
        metricKey,
        dimensionKey: dimensionKey || undefined,
        label,
        type: isCalculated ? "METRIC" : type,
        supportedCharts: splitCsv(charts),
        supportedBreakdowns: splitCsv(breakdowns),
        isDefault: false,
        isCalculated,
        formula: isCalculated ? formula.trim() : undefined,
        format: format.trim() || undefined,
        description: description.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["reporting-metric-catalog", defaults.source, defaults.level, defaults.type],
      });
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err?.message || "Erro ao salvar metrica.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar metrica custom</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Fonte de dados</Label>
              <SelectNative value={source} onChange={(event) => setSource(event.target.value)}>
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectNative>
            </div>
            <div>
              <Label>Tipo</Label>
              <SelectNative
                value={type}
                onChange={(event) => setType(event.target.value)}
                disabled={isCalculated}
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectNative>
              {isCalculated ? (
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  Calculadas sao sempre metricas.
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Nivel</Label>
              <Input value={level} onChange={(event) => setLevel(event.target.value)} />
            </div>
            <div>
              <Label>Metric key</Label>
              <Input value={metricKey} onChange={(event) => setMetricKey(event.target.value)} />
            </div>
          </div>

          {type === "DIMENSION" ? (
            <div>
              <Label>Dimension key (opcional)</Label>
              <Input
                value={dimensionKey}
                onChange={(event) => setDimensionKey(event.target.value)}
              />
            </div>
          ) : null}

          <div>
            <Label>Label</Label>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} />
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              checked={isCalculated}
              onCheckedChange={(value) => setIsCalculated(Boolean(value))}
            />
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Metrica calculada</p>
              <p className="text-xs text-[var(--text-muted)]">
                Use chaves com {"{metric_key}"} para referenciar outras metricas. Ex:
                {" {clicks} / {impressions} * 100"}.
              </p>
            </div>
          </div>

          {isCalculated ? (
            <div className="space-y-3">
              <div>
                <Label>Formula</Label>
                <Input
                  value={formula}
                  onChange={(event) => setFormula(event.target.value)}
                  placeholder="{clicks} / {impressions} * 100"
                />
              </div>
              <div>
                <Label>Formato (opcional)</Label>
                <Input
                  value={format}
                  onChange={(event) => setFormat(event.target.value)}
                  placeholder="percent, currency, number"
                />
              </div>
              <div>
                <Label>Descricao (opcional)</Label>
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Taxa de clique"
                />
              </div>
            </div>
          ) : null}

          <div>
            <Label>Supported charts (csv)</Label>
            <Input
              value={charts}
              onChange={(event) => setCharts(event.target.value)}
              placeholder="KPI,LINE,BAR"
            />
          </div>

          <div>
            <Label>Supported breakdowns (csv)</Label>
            <Input
              value={breakdowns}
              onChange={(event) => setBreakdowns(event.target.value)}
              placeholder="date,campaign.id"
            />
          </div>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isLoading}>
              {createMutation.isLoading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MetricCatalogPanel() {
  const [source, setSource] = useState("META_ADS");
  const [level, setLevel] = useState("CAMPAIGN");
  const [type, setType] = useState("METRIC");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["reporting-metric-catalog", source, level, type],
    queryFn: async () => {
      if (!source) return { items: [] };
      const params = { source, level, type };
      return base44.reporting.listMetricCatalog(params);
    },
  });

  const items = useMemo(() => data?.items || [], [data]);

  return (
    <section className="looker-panel px-6 py-6">
      <div className="looker-toolbar">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">
            Catalogo de metricas
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Centralize metricas e dimensoes por fonte e nivel.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          Adicionar metrica
        </Button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <Label>Fonte de dados</Label>
          <SelectNative value={source} onChange={(event) => setSource(event.target.value)}>
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectNative>
        </div>
        <div>
          <Label>Nivel</Label>
          <Input value={level} onChange={(event) => setLevel(event.target.value)} />
        </div>
        <div>
          <Label>Tipo</Label>
          <SelectNative value={type} onChange={(event) => setType(event.target.value)}>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectNative>
        </div>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Carregando...</p>
        ) : items.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="looker-card px-4 py-3"
              >
                <p className="text-sm font-semibold text-[var(--text)]">
                  {item.label}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {item.metricKey} {item.dimensionKey ? `• ${item.dimensionKey}` : ""}
                </p>
                {item.isDefault ? (
                  <span className="looker-pill looker-pill--accent mt-1">
                    Default
                  </span>
                ) : null}
                {item.isCalculated ? (
                  <span className="looker-pill ml-2 mt-1">
                    Calculada
                  </span>
                ) : null}
                {item.formula ? (
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                    {item.formula}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="looker-card border-dashed px-4 py-3 text-sm text-[var(--text-muted)]">
            Nenhuma metrica encontrada para essa fonte/nivel. Cadastre uma metrica
            para habilitar a selecao nos widgets.
          </div>
        )}
      </div>

      <MetricCatalogDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaults={{ source, level, type }}
      />
    </section>
  );
}
