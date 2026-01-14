import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import PageShell from "@/components/ui/page-shell.jsx";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Input } from "@/components/ui/input.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import { base44 } from "@/apiClient/base44Client";

const STEPS = [
  "Escopo",
  "Marca ou Grupo",
  "Template",
  "Periodo",
  "Revisao",
];

const COMPARE_OPTIONS = [
  { value: "NONE", label: "Sem comparacao" },
  { value: "PREVIOUS_PERIOD", label: "Periodo anterior" },
  { value: "PREVIOUS_YEAR", label: "Ano anterior" },
  { value: "CUSTOM", label: "Personalizado" },
];

export default function ReportsWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState("BRAND");
  const [brandId, setBrandId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compareMode, setCompareMode] = useState("NONE");
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [customName, setCustomName] = useState("");
  const [error, setError] = useState("");
  const [brandQuery, setBrandQuery] = useState("");
  const [groupQuery, setGroupQuery] = useState("");

  useEffect(() => {
    setBrandId("");
    setGroupId("");
    setBrandQuery("");
    setGroupQuery("");
  }, [scope]);

  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["reporting-brand-groups"],
    queryFn: () => base44.reporting.listBrandGroups(),
  });

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["reporting-templates"],
    queryFn: () => base44.reporting.listTemplates(),
  });

  const clients = clientsData || [];
  const groups = groupsData?.items || [];
  const templates = templatesData?.items || [];

  const filteredClients = useMemo(() => {
    if (!brandQuery.trim()) return clients;
    const query = brandQuery.trim().toLowerCase();
    return clients.filter((client) =>
      String(client.name || "").toLowerCase().includes(query)
    );
  }, [clients, brandQuery]);

  const filteredGroups = useMemo(() => {
    if (!groupQuery.trim()) return groups;
    const query = groupQuery.trim().toLowerCase();
    return groups.filter((group) =>
      String(group.name || "").toLowerCase().includes(query)
    );
  }, [groups, groupQuery]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) || null,
    [templates, templateId]
  );

  const canProceed = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) return scope === "BRAND" ? !!brandId : !!groupId;
    if (step === 2) return !!templateId;
    if (step === 3) {
      if (!dateFrom || !dateTo) return false;
      if (compareMode === "CUSTOM") {
        return Boolean(compareFrom && compareTo);
      }
      return true;
    }
    return true;
  }, [step, scope, brandId, groupId, templateId, dateFrom, dateTo, compareMode, compareFrom, compareTo]);

  const createMutation = useMutation({
    mutationFn: async () => {
      setError("");
      if (!templateId) throw new Error("Selecione um template.");
      if (!dateFrom || !dateTo) throw new Error("Informe o periodo.");
      if (scope === "BRAND" && !brandId) throw new Error("Selecione uma marca.");
      if (scope === "GROUP" && !groupId) throw new Error("Selecione um grupo.");

      return base44.reporting.createReport({
        name: customName || undefined,
        scope,
        brandId: scope === "BRAND" ? brandId : undefined,
        groupId: scope === "GROUP" ? groupId : undefined,
        templateId,
        dateFrom,
        dateTo,
        compareMode,
        compareDateFrom: compareMode === "CUSTOM" ? compareFrom : undefined,
        compareDateTo: compareMode === "CUSTOM" ? compareTo : undefined,
      });
    },
    onSuccess: (data) => {
      if (data?.id) {
        navigate(`/reports/${data.id}`);
      }
    },
    onError: (err) => {
      setError(err?.message || "Erro ao criar relatorio.");
    },
  });

  const nextStep = () => {
    if (!canProceed) return;
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const prevStep = () => setStep((prev) => Math.max(prev - 1, 0));

  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Novo relatorio
          </p>
          <h1 className="text-2xl font-semibold text-[var(--text)]">
            Wizard de criacao
          </h1>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={`rounded-full px-3 py-1 ${
                index === step
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface-muted)] text-[var(--text-muted)]"
              }`}
            >
              {index + 1}. {label}
            </span>
          ))}
        </div>

        {step === 0 ? (
          <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Escolha o escopo
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Relatorios podem ser por marca ou por grupo.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setScope("BRAND")}
                className={`rounded-[16px] border px-4 py-4 text-left transition ${
                  scope === "BRAND"
                    ? "border-[var(--primary)] bg-blue-50"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                <p className="text-sm font-semibold text-[var(--text)]">Marca</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Analise uma unica marca.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setScope("GROUP")}
                className={`rounded-[16px] border px-4 py-4 text-left transition ${
                  scope === "GROUP"
                    ? "border-[var(--primary)] bg-blue-50"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                <p className="text-sm font-semibold text-[var(--text)]">Grupo</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Combine marcas em um grupo.
                </p>
              </button>
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Selecione {scope === "BRAND" ? "a marca" : "o grupo"}
            </h2>
            <div className="mt-4 rounded-[16px] border border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  value={scope === "BRAND" ? brandQuery : groupQuery}
                  onChange={(event) =>
                    scope === "BRAND"
                      ? setBrandQuery(event.target.value)
                      : setGroupQuery(event.target.value)
                  }
                  placeholder={`Buscar ${scope === "BRAND" ? "marca" : "grupo"}`}
                  className="border-0 bg-transparent px-0 shadow-none focus:ring-0"
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {(scope === "BRAND" ? filteredClients : filteredGroups).map((item) => {
                  const selected =
                    scope === "BRAND" ? brandId === item.id : groupId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        scope === "BRAND"
                          ? setBrandId(item.id)
                          : setGroupId(item.id)
                      }
                      className={`flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left text-sm transition ${
                        selected
                          ? "bg-orange-50 text-[var(--text)]"
                          : "text-[var(--text-muted)] hover:bg-white"
                      }`}
                    >
                      <span
                        className={`h-4 w-4 rounded-full border ${
                          selected
                            ? "border-[var(--accent)] bg-[var(--accent)]"
                            : "border-[var(--border)]"
                        }`}
                      />
                      <span className="text-[var(--text)]">{item.name}</span>
                    </button>
                  );
                })}
                {scope === "BRAND" && !filteredClients.length ? (
                  <p className="px-4 py-4 text-sm text-[var(--text-muted)]">
                    Nenhuma marca encontrada.
                  </p>
                ) : null}
                {scope === "GROUP" && !filteredGroups.length ? (
                  <p className="px-4 py-4 text-sm text-[var(--text-muted)]">
                    Nenhum grupo encontrado.
                  </p>
                ) : null}
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-xs text-[var(--text-muted)]">
                <span>
                  Total de registros:{" "}
                  {scope === "BRAND" ? filteredClients.length : filteredGroups.length}
                </span>
                <span>Linhas por pagina 20</span>
              </div>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Escolha o template
            </h2>
            {templatesLoading ? (
              <p className="mt-3 text-sm text-[var(--text-muted)]">Carregando...</p>
            ) : templates.length ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    className={`rounded-[16px] border px-4 py-4 text-left transition ${
                      templateId === template.id
                        ? "border-[var(--primary)] bg-blue-50"
                        : "border-[var(--border)] bg-[var(--surface)]"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {template.name}
                    </p>
                    {template.description ? (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {template.description}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Nenhum template disponivel.
              </p>
            )}
          </section>
        ) : null}

        {step === 3 ? (
          <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
            <h2 className="text-lg font-semibold text-[var(--text)]">Periodo</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>Data inicial</Label>
                <DateField value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </div>
              <div>
                <Label>Data final</Label>
                <DateField value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </div>
            </div>

            <div className="mt-4 max-w-md">
              <Label>Comparacao</Label>
              <SelectNative
                value={compareMode}
                onChange={(event) => setCompareMode(event.target.value)}
              >
                {COMPARE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectNative>
            </div>

            {compareMode === "CUSTOM" ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Comparar de</Label>
                  <DateField
                    value={compareFrom}
                    onChange={(event) => setCompareFrom(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Comparar ate</Label>
                  <DateField
                    value={compareTo}
                    onChange={(event) => setCompareTo(event.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 4 ? (
          <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
            <h2 className="text-lg font-semibold text-[var(--text)]">Revisao</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>Nome (opcional)</Label>
                <Input
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  placeholder={selectedTemplate?.name || "Relatorio"}
                />
              </div>
              <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
                <p className="text-xs text-[var(--text-muted)]">Resumo</p>
                <p className="mt-1 text-[var(--text)]">
                  {scope === "BRAND"
                    ? `Marca: ${clients.find((client) => client.id === brandId)?.name || "-"}`
                    : `Grupo: ${groups.find((group) => group.id === groupId)?.name || "-"}`}
                </p>
                <p className="text-[var(--text)]">
                  Template: {selectedTemplate?.name || "-"}
                </p>
                <p className="text-[var(--text)]">
                  Periodo: {dateFrom || "-"} a {dateTo || "-"}
                </p>
                <p className="text-[var(--text)]">
                  Comparacao: {COMPARE_OPTIONS.find((opt) => opt.value === compareMode)?.label}
                </p>
              </div>
            </div>

            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          </section>
        ) : null}

        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => navigate("/reports")}>
            Cancelar
          </Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button variant="ghost" onClick={prevStep}>
                Voltar
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button onClick={nextStep} disabled={!canProceed}>
                Continuar
              </Button>
            ) : (
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isLoading}
              >
                {createMutation.isLoading ? "Criando..." : "Criar relatorio"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
