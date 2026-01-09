import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  const { width, containerRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 960,
  });

  const [layout, setLayout] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  const { data: report, isLoading } = useQuery({
    queryKey: ["reporting-report", reportId],
    queryFn: () => base44.reporting.getReport(reportId),
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

  const widgets = useMemo(() => report?.widgets || [], [report]);

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
            <Button variant="secondary" disabled>
              Atualizar dados
            </Button>
            <Button variant="secondary" disabled>
              Exportar PDF
            </Button>
          </div>
        </div>

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
                  <p className="text-xs text-[var(--text-muted)]">
                    {widget.widgetType}
                  </p>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {widget.title || "Widget"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {widget.source} {widget.level ? `• ${widget.level}` : ""}
                  </p>
                  <div className="mt-3 rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
                    Sem dados carregados
                  </div>
                </div>
              ))}
            </GridLayout>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
