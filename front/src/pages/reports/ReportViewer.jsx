import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import GridLayout, { useContainerWidth } from "react-grid-layout";
import PageShell from "@/components/ui/page-shell.jsx";
import { Button } from "@/components/ui/button.jsx";
import { base44 } from "@/apiClient/base44Client";

function getNextY(layout) {
  if (!layout.length) return 0;
  return layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
}

function createLayoutItem(id, layout) {
  const nextY = getNextY(layout);
  const nextX = (layout.length * 4) % 12;
  return {
    i: id,
    x: nextX,
    y: nextY,
    w: 4,
    h: 4,
  };
}

function buildLayout(widgets) {
  const layout = [];
  widgets.forEach((widget) => {
    if (widget.layout && widget.layout.x !== undefined) {
      layout.push({
        i: widget.id,
        x: widget.layout.x,
        y: widget.layout.y,
        w: widget.layout.w,
        h: widget.layout.h,
      });
    } else {
      layout.push(createLayoutItem(widget.id, layout));
    }
  });
  return layout;
}

export default function ReportViewer() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { width, containerRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 960,
  });

  const [layout, setLayout] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exportUrl, setExportUrl] = useState("");

  const reportQueryKey = ["reporting-report", reportId];
  const { data: report, isLoading } = useQuery({
    queryKey: reportQueryKey,
    queryFn: () => base44.reporting.getReport(reportId),
    refetchInterval: (data) =>
      data?.status === "GENERATING" ? 5000 : false,
  });

  const { data: snapshotsData, isFetching: snapshotsLoading } = useQuery({
    queryKey: ["reporting-report-snapshots", reportId],
    queryFn: () => base44.reporting.getReportSnapshots(reportId),
    enabled: Boolean(reportId),
    refetchInterval: report?.status === "GENERATING" ? 5000 : false,
  });

  useEffect(() => {
    if (!report) return;
    const widgets = report.widgets || [];
    setLayout(buildLayout(widgets));
  }, [report]);

  const saveLayoutMutation = useMutation({
    mutationFn: async () => {
      if (!layout.length) return null;
      return base44.reporting.updateReportLayout(reportId, {
        widgets: layout.map((item) => ({
          id: item.i,
          layout: {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
          },
        })),
      });
    },
    onSuccess: () => {
      setIsEditing(false);
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      setRefreshError("");
      return base44.reporting.refreshReport(reportId);
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.setQueryData(reportQueryKey, data);
      }
      queryClient.invalidateQueries({
        queryKey: ["reporting-report-snapshots", reportId],
      });
    },
    onError: (err) => {
      setRefreshError(err?.message || "Erro ao atualizar dados.");
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      setExportError("");
      return base44.reporting.createReportExport(reportId);
    },
    onSuccess: (data) => {
      const url = data?.url || data?.file?.url || data?.export?.file?.url || "";
      if (url) {
        setExportUrl(url);
        window.open(url, "_blank", "noopener");
      }
    },
    onError: (err) => {
      setExportError(err?.message || "Erro ao gerar PDF.");
    },
  });

  const widgets = useMemo(() => report?.widgets || [], [report]);
  const snapshotsByWidget = useMemo(() => {
    const items = snapshotsData?.items || [];
    return items.reduce((acc, item) => {
      if (item && item.widgetId) acc[item.widgetId] = item;
      return acc;
    }, {});
  }, [snapshotsData]);

  const reportingErrors = useMemo(() => {
    const errors = report?.params?.reporting?.errors;
    return Array.isArray(errors) ? errors : [];
  }, [report]);

  if (isLoading) {
    return (
      <PageShell>
        <div className="h-48 rounded-[18px] border border-[var(--border)] bg-white/70 animate-pulse" />
      </PageShell>
    );
  }

  if (!report) {
    return (
      <PageShell>
        <div className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 text-center">
          Relatorio nao encontrado.
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Relatorio
            </p>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              {report.name}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Status: {report.status || "DRAFT"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => navigate("/reports")}>
              Voltar
            </Button>
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLayout(buildLayout(widgets));
                    setIsEditing(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => saveLayoutMutation.mutate()}
                  disabled={saveLayoutMutation.isLoading}
                >
                  {saveLayoutMutation.isLoading ? "Salvando..." : "Salvar layout"}
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)}>Editar layout</Button>
            )}
            <Button
              variant="secondary"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isLoading || isEditing}
            >
              {refreshMutation.isLoading ? "Atualizando..." : "Atualizar dados"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isLoading || isEditing}
            >
              {exportMutation.isLoading ? "Gerando PDF..." : "Exportar PDF"}
            </Button>
          </div>
        </div>
        {report?.generatedAt ? (
          <p className="text-xs text-[var(--text-muted)]">
            Atualizado em {new Date(report.generatedAt).toLocaleString("pt-BR")}
          </p>
        ) : null}
        {exportUrl ? (
          <a
            href={exportUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--primary)] underline"
          >
            Abrir ultimo PDF gerado
          </a>
        ) : null}
        {refreshError ? (
          <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {refreshError}
          </div>
        ) : null}
        {exportError ? (
          <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {exportError}
          </div>
        ) : null}
        {report?.status === "ERROR" && reportingErrors.length ? (
          <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {reportingErrors.length} widget(s) com erro. Exemplo:{" "}
            {reportingErrors[0]?.message || "Falha ao consultar dados."}
          </div>
        ) : null}

        <section className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
          <div ref={containerRef}>
            <GridLayout
              layout={layout}
              cols={12}
              rowHeight={32}
              margin={[16, 16]}
              width={width}
              isDraggable={isEditing}
              isResizable={isEditing}
              onLayoutChange={(nextLayout) => setLayout(nextLayout)}
            >
              {widgets.map((widget) => (
                <div
                  key={widget.id}
                  className="rounded-[12px] border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-sm)]"
                >
                  {snapshotsLoading ? (
                    <div className="mb-3 h-6 w-24 rounded-full bg-[var(--surface-muted)] animate-pulse" />
                  ) : null}
                  <p className="text-xs text-[var(--text-muted)]">
                    {widget.widgetType}
                  </p>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {widget.title || "Widget"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {widget.source} {widget.level ? `• ${widget.level}` : ""}
                  </p>
                  {(() => {
                    const snapshot = snapshotsByWidget[widget.id];
                    const data = snapshot?.data || null;
                    const totals =
                      data && typeof data.totals === "object" ? data.totals : {};
                    const metrics = Array.isArray(widget.metrics)
                      ? widget.metrics
                      : [];
                    const primaryMetric = metrics[0] || null;
                    const primaryValue =
                      primaryMetric && totals
                        ? totals[primaryMetric]
                        : null;

                    if (!data) {
                      return (
                        <div className="mt-3 rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
                          Sem dados carregados
                        </div>
                      );
                    }

                    if (widget.widgetType === "KPI" && primaryMetric) {
                      return (
                        <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                          <p className="text-xs text-[var(--text-muted)]">
                            {primaryMetric}
                          </p>
                          <p className="text-lg font-semibold text-[var(--text)]">
                            {typeof primaryValue === "number"
                              ? primaryValue.toLocaleString("pt-BR")
                              : "-"}
                          </p>
                        </div>
                      );
                    }

                    const seriesCount = Array.isArray(data.series)
                      ? data.series.length
                      : 0;
                    const totalsCount = Object.keys(totals || {}).length;

                    return (
                      <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
                        {seriesCount
                          ? `${seriesCount} serie(s) carregadas`
                          : "Dados carregados"}
                        {totalsCount ? ` • ${totalsCount} metricas` : ""}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </GridLayout>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
