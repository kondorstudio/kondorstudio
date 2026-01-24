import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Button } from "@/components/ui/button.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";

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
    setError("");
  }, [open, defaults.source, defaults.level, defaults.type]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!source) throw new Error("Fonte obrigatoria.");
      if (!level) throw new Error("Nivel obrigatorio.");
      if (!metricKey) throw new Error("Metric key obrigatoria.");
      if (!label) throw new Error("Label obrigatoria.");

      return base44.reporting.createMetricCatalog({
        source,
        level,
        metricKey,
        dimensionKey: dimensionKey || undefined,
        label,
        type,
        supportedCharts: splitCsv(charts),
        supportedBreakdowns: splitCsv(breakdowns),
        isDefault: false,
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
              <SelectNative value={type} onChange={(event) => setType(event.target.value)}>
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectNative>
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
    <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
                className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <p className="text-sm font-semibold text-[var(--text)]">
                  {item.label}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {item.metricKey} {item.dimensionKey ? `• ${item.dimensionKey}` : ""}
                </p>
                {item.isDefault ? (
                  <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Default
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Nenhuma metrica encontrada para essa fonte.
          </p>
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
