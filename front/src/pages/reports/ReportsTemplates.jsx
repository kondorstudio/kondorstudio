import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import PageShell from "@/components/ui/page-shell.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { base44 } from "@/apiClient/base44Client";

function visibilityLabel(value) {
  if (value === "PUBLIC") return "Publico";
  if (value === "TENANT") return "Tenant";
  return "Privado";
}

export default function ReportsTemplates() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["reporting-templates"],
    queryFn: () => base44.reporting.listTemplates(),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (templateId) => {
      return base44.reporting.duplicateTemplate(templateId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reporting-templates"] });
    },
  });

  const templates = data?.items || [];
  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return templates;
    const query = search.trim().toLowerCase();
    return templates.filter((template) =>
      String(template.name || "").toLowerCase().includes(query)
    );
  }, [templates, search]);

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              Meus templates
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Gerencie seus templates personalizados.
            </p>
          </div>
          <Button variant="success" onClick={() => navigate("/reports/templates/new")}>
            Novo Template
          </Button>
        </div>

        <section className="rounded-[18px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar template"
                className="pl-9"
              />
            </div>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-36 rounded-[16px] border border-[var(--border)] bg-white/70 animate-pulse"
                  />
                ))}
              </div>
            ) : filteredTemplates.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-[16px] border border-[var(--border)] bg-white px-5 py-4 shadow-[var(--shadow-sm)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-[var(--text)]">
                          {template.name}
                        </h3>
                        {template.description ? (
                          <p className="mt-1 text-sm text-[var(--text-muted)]">
                            {template.description}
                          </p>
                        ) : null}
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {visibilityLabel(template.visibility)}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-[var(--text-muted)]">
                      Versao {template.version || 1}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(`/reports/templates/${template.id}/edit`)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => duplicateMutation.mutate(template.id)}
                        disabled={duplicateMutation.isLoading}
                      >
                        Duplicar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FileText}
                title="Voce ainda nao criou nenhum template."
                description="Vamos criar um agora?"
                action={
                  <Button variant="success" onClick={() => navigate("/reports/templates/new")}>
                    Criar template
                  </Button>
                }
              />
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
