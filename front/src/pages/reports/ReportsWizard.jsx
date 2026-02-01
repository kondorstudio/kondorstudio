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

const DATE_RANGE_OPTIONS = [
  { value: "LAST_7_DAYS", label: "Ultimos 7 dias" },
  { value: "LAST_30_DAYS", label: "Ultimos 30 dias" },
  { value: "LAST_90_DAYS", label: "Ultimos 90 dias" },
  { value: "THIS_MONTH", label: "Este mes" },
  { value: "LAST_MONTH", label: "Mes passado" },
  { value: "CUSTOM", label: "Personalizado" },
];

const COMPARE_OPTIONS = [
  { value: "NONE", label: "Sem comparacao" },
  { value: "PREVIOUS_PERIOD", label: "Periodo anterior (padrao)" },
  { value: "PREVIOUS_YEAR", label: "Ano anterior" },
  { value: "CUSTOM", label: "Personalizado" },
];

function toDateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function resolveDatePreset(preset) {
  const today = new Date();
  let from = new Date(today);
  let to = new Date(today);

  switch (preset) {
    case "LAST_7_DAYS":
      from.setDate(today.getDate() - 7);
      break;
    case "LAST_30_DAYS":
      from.setDate(today.getDate() - 30);
      break;
    case "LAST_90_DAYS":
      from.setDate(today.getDate() - 90);
      break;
    case "THIS_MONTH":
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "LAST_MONTH":
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    default:
      break;
  }

  return { dateFrom: toDateKey(from), dateTo: toDateKey(to) };
}

function parseDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildCompareRange({ dateFrom, dateTo, compareMode }) {
  if (!compareMode || compareMode === "NONE") return null;
  const from = parseDateKey(dateFrom);
  const to = parseDateKey(dateTo);
  if (!from || !to) return null;

  if (compareMode === "PREVIOUS_YEAR") {
    const prevFrom = new Date(from);
    prevFrom.setFullYear(from.getFullYear() - 1);
    const prevTo = new Date(to);
    prevTo.setFullYear(to.getFullYear() - 1);
    return { dateFrom: toDateKey(prevFrom), dateTo: toDateKey(prevTo) };
  }

  if (compareMode === "PREVIOUS_PERIOD") {
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((to.getTime() - from.getTime()) / dayMs) + 1;
    const prevTo = new Date(from.getTime() - dayMs);
    const prevFrom = new Date(prevTo.getTime() - (diffDays - 1) * dayMs);
    return { dateFrom: toDateKey(prevFrom), dateTo: toDateKey(prevTo) };
  }

  return null;
}

export default function ReportsWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState("BRAND");
  const [brandId, setBrandId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [datePreset, setDatePreset] = useState("LAST_30_DAYS");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compareMode, setCompareMode] = useState("NONE");
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [customName, setCustomName] = useState("");
  const [error, setError] = useState("");
  const [brandQuery, setBrandQuery] = useState("");
  const [groupQuery, setGroupQuery] = useState("");

  const { data: meData } = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const allowedBrandIds = useMemo(() => {
    const ids = meData?.reportingScope?.allowedBrandIds;
    return Array.isArray(ids) ? ids.map(String) : null;
  }, [meData]);

  const isClientScoped = Array.isArray(allowedBrandIds);
  const allowedBrandSet = useMemo(
    () => (isClientScoped ? new Set(allowedBrandIds) : null),
    [isClientScoped, allowedBrandIds]
  );

  const stepLabels = useMemo(() => {
    if (isClientScoped) {
      return ["Escopo", "Marca", "Template", "Periodo", "Revisao"];
    }
    return STEPS;
  }, [isClientScoped]);

  useEffect(() => {
    setBrandId("");
    setGroupId("");
    setBrandQuery("");
    setGroupQuery("");
  }, [scope]);

  useEffect(() => {
    if (!isClientScoped) return;
    if (scope !== "BRAND") setScope("BRAND");
  }, [isClientScoped, scope]);

  useEffect(() => {
    if (datePreset === "CUSTOM") return;
    const range = resolveDatePreset(datePreset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  }, [datePreset]);

  useEffect(() => {
    if (compareMode !== "CUSTOM") return;
    if (compareFrom || compareTo) return;
    const range = buildCompareRange({
      dateFrom,
      dateTo,
      compareMode: "PREVIOUS_PERIOD",
    });
    if (!range) return;
    setCompareFrom(range.dateFrom);
    setCompareTo(range.dateTo);
  }, [compareMode, compareFrom, compareTo, dateFrom, dateTo]);

  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["reporting-brand-groups"],
    queryFn: () => base44.reporting.listBrandGroups(),
    enabled: !isClientScoped,
  });

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["reporting-templates"],
    queryFn: () => base44.reporting.listTemplates(),
  });

  const clients = clientsData || [];
  const groups = groupsData?.items || [];
  const templates = templatesData?.items || [];

  const scopedClients = useMemo(() => {
    if (!isClientScoped) return clients;
    if (!allowedBrandSet || !allowedBrandSet.size) return [];
    return clients.filter((client) => allowedBrandSet.has(String(client.id)));
  }, [clients, isClientScoped, allowedBrandSet]);

  const filteredClients = useMemo(() => {
    if (!brandQuery.trim()) return scopedClients;
    const query = brandQuery.trim().toLowerCase();
    return scopedClients.filter((client) =>
      String(client.name || "").toLowerCase().includes(query)
    );
  }, [scopedClients, brandQuery]);

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

  const compareRange = useMemo(() => {
    if (compareMode === "CUSTOM") {
      return { dateFrom: compareFrom, dateTo: compareTo };
    }
    return buildCompareRange({ dateFrom, dateTo, compareMode }) || {
      dateFrom: "",
      dateTo: "",
    };
  }, [compareMode, compareFrom, compareTo, dateFrom, dateTo]);

  useEffect(() => {
    if (!isClientScoped) return;
    if (!scopedClients.length) {
      if (brandId) setBrandId("");
      return;
    }
    if (!brandId || !allowedBrandSet?.has(String(brandId))) {
      setBrandId(scopedClients[0].id);
    }
  }, [isClientScoped, scopedClients, brandId, allowedBrandSet]);

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
    <PageShell className="reporting-surface">
      <div className="space-y-6">
        <div>
          <p className="looker-section-title">Novo relatorio</p>
          <h1 className="text-2xl font-semibold text-[var(--text)]">
            Wizard de criacao
          </h1>
        </div>

        <div className="flex flex-wrap gap-4 text-xs">
          {stepLabels.map((label, index) => (
            <span
              key={label}
              className={`pb-1 uppercase tracking-[0.18em] ${
                index === step
                  ? "border-b-2 border-[var(--primary)] text-[var(--text)]"
                  : "border-b-2 border-transparent text-[var(--text-muted)]"
              }`}
            >
              {index + 1}. {label}
            </span>
          ))}
        </div>

        {step === 0 ? (
          <section className="looker-panel px-6 py-6">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Escolha o escopo
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {isClientScoped
                ? "Relatorios sao gerados por marca."
                : "Relatorios podem ser por marca ou por grupo."}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setScope("BRAND")}
                className={`rounded-[12px] border px-4 py-4 text-left transition ${
                  scope === "BRAND"
                    ? "border-[var(--primary)] bg-white"
                    : "border-[var(--border)] bg-white"
                }`}
              >
                <p className="text-sm font-semibold text-[var(--text)]">Marca</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Analise uma unica marca.
                </p>
              </button>
              {!isClientScoped ? (
                <button
                  type="button"
                  onClick={() => setScope("GROUP")}
                  className={`rounded-[12px] border px-4 py-4 text-left transition ${
                    scope === "GROUP"
                      ? "border-[var(--primary)] bg-white"
                      : "border-[var(--border)] bg-white"
                  }`}
                >
                  <p className="text-sm font-semibold text-[var(--text)]">Grupo</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Combine marcas em um grupo.
                  </p>
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="looker-panel px-6 py-6">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Selecione {scope === "BRAND" ? "a marca" : "o grupo"}
            </h2>
            <div className="mt-4 rounded-[12px] border border-[var(--border)] bg-white">
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
          <section className="looker-panel px-6 py-6">
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
                    className={`looker-card px-4 py-4 text-left transition ${
                      templateId === template.id
                        ? "border-[var(--primary)] bg-slate-50"
                        : "border-[var(--border)] bg-white"
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
          <section className="looker-panel px-6 py-6">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Periodo para analise
            </h2>
            <div className="mt-4 max-w-md">
              <Label>Periodo de tempo da analise</Label>
              <SelectNative
                value={datePreset}
                onChange={(event) => setDatePreset(event.target.value)}
              >
                {DATE_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectNative>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>Periodo inicial</Label>
                <DateField
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  disabled={datePreset !== "CUSTOM"}
                />
              </div>
              <div>
                <Label>Periodo final</Label>
                <DateField
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  disabled={datePreset !== "CUSTOM"}
                />
              </div>
            </div>

            <div className="mt-4 max-w-md">
              <Label>Comparar com</Label>
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

            {compareMode !== "NONE" ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Comparar de</Label>
                  <DateField
                    value={compareRange.dateFrom}
                    onChange={(event) => setCompareFrom(event.target.value)}
                    disabled={compareMode !== "CUSTOM"}
                  />
                </div>
                <div>
                  <Label>Comparar ate</Label>
                  <DateField
                    value={compareRange.dateTo}
                    onChange={(event) => setCompareTo(event.target.value)}
                    disabled={compareMode !== "CUSTOM"}
                  />
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 4 ? (
          <section className="looker-panel px-6 py-6">
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
              <div className="looker-card px-4 py-3 text-sm">
                <p className="text-xs text-[var(--text-muted)]">Resumo</p>
                <p className="mt-1 text-[var(--text)]">
                  {scope === "BRAND"
                    ? `Marca: ${scopedClients.find((client) => client.id === brandId)?.name || "-"}`
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
