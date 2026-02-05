import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import PageShell from "@/components/ui/page-shell.jsx";
import { Label } from "@/components/ui/label.jsx";
import EmptyState from "@/components/ui/empty-state.jsx";
import { Button } from "@/components/ui/button.jsx";
import { SelectNative } from "@/components/ui/select-native.jsx";
import { DateField } from "@/components/ui/date-field.jsx";
import { useActiveClient } from "@/hooks/useActiveClient.js";
import {
  BarChart3,
  CalendarDays,
  PieChart,
  TrendingUp,
  Users,
} from "lucide-react";

const NETWORKS = [
  { key: "instagram", label: "Instagram", gradient: "from-pink-500 to-purple-500" },
  { key: "facebook", label: "Facebook", gradient: "from-blue-600 to-indigo-600" },
  { key: "linkedin", label: "LinkedIn", gradient: "from-sky-600 to-blue-700" },
  { key: "tiktok", label: "TikTok", gradient: "from-slate-700 to-slate-900" },
  { key: "youtube", label: "YouTube", gradient: "from-red-600 to-rose-600" },
  { key: "x", label: "X", gradient: "from-slate-500 to-slate-700" },
];

const NETWORK_PROVIDER = {
  instagram: "META",
  facebook: "META",
  linkedin: "LINKEDIN",
  tiktok: "TIKTOK",
  youtube: "GOOGLE",
  x: "X",
};

const SECTIONS = [
  { key: "overview", label: "Resumo geral" },
  { key: "followers", label: "Seguidores" },
  { key: "demographic", label: "Demográfico" },
  { key: "stories", label: "Stories" },
  { key: "reels", label: "Reels" },
  { key: "posts", label: "Posts" },
  { key: "competitors", label: "Concorrentes" },
];

const PERIOD_PRESETS = [
  { value: "7d", label: "Últimos 7 dias", days: 7 },
  { value: "30d", label: "Últimos 30 dias", days: 30 },
  { value: "90d", label: "Últimos 90 dias", days: 90 },
  { value: "custom", label: "Personalizado", days: null },
];

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatDateInput(date) {
  if (!date) return "";
  if (typeof date === "string") return date;
  return new Date(date).toISOString().slice(0, 10);
}

function MetricCard({ label, value, size = "sm", className = "" }) {
  const isLarge = size === "lg";
  return (
    <div
      className={`rounded-[14px] border border-[var(--border)] bg-white ${
        isLarge ? "px-6 py-5" : "px-4 py-4"
      } ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className={`mt-2 font-semibold text-[var(--text)] ${
          isLarge ? "text-3xl md:text-4xl" : "text-2xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, action }) {
  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--surface-muted)]">
              <Icon className="h-4 w-4 text-[var(--text-muted)]" />
            </span>
          ) : null}
          <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
        </div>
        {action || null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function Metrics() {
  const [activeClientId, setActiveClientId] = useActiveClient();
  const [activeNetwork, setActiveNetwork] = useState("instagram");
  const [activeSection, setActiveSection] = useState("overview");
  const [periodPreset, setPeriodPreset] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const navigate = useNavigate();

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const activeClient = useMemo(
    () => clients.find((client) => client.id === activeClientId) || null,
    [clients, activeClientId]
  );

  useEffect(() => {
    if (periodPreset !== "custom") return;
    if (!customFrom || !customTo) {
      const preset = PERIOD_PRESETS.find((p) => p.value === "30d");
      const to = new Date();
      const from = new Date(
        to.getTime() - (preset?.days || 30) * 24 * 60 * 60 * 1000
      );
      setCustomFrom(formatDateInput(from));
      setCustomTo(formatDateInput(to));
    }
  }, [periodPreset, customFrom, customTo]);

  const rangeConfig = useMemo(() => {
    if (periodPreset === "custom") {
      const startDate = customFrom ? new Date(customFrom) : null;
      const endDate = customTo ? new Date(customTo) : null;
      return {
        startDate: startDate ? startDate.toISOString() : undefined,
        endDate: endDate ? endDate.toISOString() : undefined,
      };
    }

    const preset =
      PERIOD_PRESETS.find((p) => p.value === periodPreset) || PERIOD_PRESETS[1];
    const to = new Date();
    const from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);

    return {
      startDate: from.toISOString(),
      endDate: to.toISOString(),
    };
  }, [periodPreset, customFrom, customTo]);

  const provider = NETWORK_PROVIDER[activeNetwork];

  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ["metrics", activeClientId, activeNetwork, rangeConfig.startDate, rangeConfig.endDate],
    queryFn: () =>
      base44.entities.Metric.filter(
        {
          clientId: activeClientId || undefined,
          provider: provider || undefined,
          startDate: rangeConfig.startDate,
          endDate: rangeConfig.endDate,
        },
        "desc",
        200
      ),
  });

  const totals = useMemo(() => {
    const acc = {};
    (metrics || []).forEach((metric) => {
      const key = metric?.name || metric?.key;
      if (!key) return;
      acc[key] = (acc[key] || 0) + Number(metric.value || 0);
    });
    return acc;
  }, [metrics]);

  const reach = totals.reach || 0;
  const engagement = totals.engagement || 0;
  const impressions = totals.impressions || 0;
  const engagementsRate = reach > 0 ? (engagement / reach) * 100 : 0;
  const frequency = reach > 0 ? impressions / reach : 0;

  const headerConfig = NETWORKS.find((item) => item.key === activeNetwork) || NETWORKS[0];

  const overviewCards = [
    { label: "Alcance", value: formatNumber(reach) },
    { label: "Engajamento", value: formatNumber(engagement) },
    { label: "Taxa de engajamento", value: formatPercent(engagementsRate) },
    { label: "Frequência", value: frequency.toFixed(2) },
  ];

  const interactionCards = [
    { label: "Visualizações", value: formatNumber(totals.views || totals.visualizations) },
    { label: "Interações", value: formatNumber(totals.interactions || totals.engagement) },
    { label: "Curtidas", value: formatNumber(totals.likes) },
    { label: "Comentarios", value: formatNumber(totals.comments) },
    { label: "Compartilhamentos", value: formatNumber(totals.shares) },
    { label: "Salvos", value: formatNumber(totals.saved) },
  ];

  const renderSectionContent = () => {
    if (activeSection === "overview") {
      return (
        <div className="space-y-6">
          <SectionCard title="Resumo geral do perfil" icon={TrendingUp}>
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  KPIs principais
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {overviewCards.slice(0, 2).map((card) => (
                    <MetricCard
                      key={card.label}
                      label={card.label}
                      value={card.value}
                      size="lg"
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  KPIs secundarios
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {overviewCards.slice(2).map((card) => (
                    <MetricCard key={card.label} label={card.label} value={card.value} />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Engajamento e interacoes
              </p>
              <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {interactionCards.map((card) => (
                  <MetricCard key={card.label} label={card.label} value={card.value} />
                ))}
              </div>
            </div>
          </SectionCard>

          {metrics.length === 0 && !isLoading ? (
            <SectionCard title="Sem dados" icon={BarChart3}>
              <EmptyState
                title="Ainda não há métricas para este período"
                description="Verifique o período, conecte a integração ou aguarde novas coletas."
                action={
                  <Button variant="secondary" onClick={() => navigate("/integrations")}>
                    Conectar integração
                  </Button>
                }
              />
            </SectionCard>
          ) : null}
        </div>
      );
    }

    const sectionLabel = SECTIONS.find((section) => section.key === activeSection)?.label;
    const iconMap = {
      followers: Users,
      demographic: PieChart,
      stories: BarChart3,
      reels: BarChart3,
      posts: BarChart3,
      competitors: Users,
    };
    const Icon = iconMap[activeSection] || BarChart3;

    return (
      <SectionCard title={sectionLabel || "Métricas"} icon={Icon}>
        <EmptyState
          title="Sem dados suficientes para este painel"
          description="Aguardamos novas coletas. Você pode revisar a integração agora."
          action={
            <Button variant="secondary" onClick={() => navigate("/integrations")}>
              Revisar integração
            </Button>
          }
        />
      </SectionCard>
    );
  };

  return (
    <PageShell>
      <div className="rounded-[24px] overflow-hidden border border-[var(--border)] bg-white">
        <div className={`bg-gradient-to-r ${headerConfig.gradient} px-6 py-7 text-white md:px-8 md:py-8`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/70">Perfil</p>
              <h2 className="text-2xl font-semibold md:text-3xl">
                {activeClient?.name || "Selecione um perfil"}
              </h2>
              <p className="text-xs text-white/70 mt-1">
                {activeClient?.socialHandle || activeClient?.email || ""}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-[0.3em] text-white/70">
                  Cliente
                </Label>
                <SelectNative
                  selectClassName="h-9 border border-white/30 bg-white/90 text-slate-900 shadow-none"
                  value={activeClientId || ""}
                  onChange={(event) => setActiveClientId(event.target.value || "")}
                >
                  <option value="">Todos os clientes</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-[0.3em] text-white/70">
                  Período
                </Label>
                <SelectNative
                  selectClassName="h-9 border border-white/30 bg-white/90 text-slate-900 shadow-none"
                  value={periodPreset}
                  onChange={(event) => setPeriodPreset(event.target.value)}
                >
                  {PERIOD_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </SelectNative>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/20 pt-4">
            {NETWORKS.map((network) => (
              <button
                key={network.key}
                type="button"
                onClick={() => setActiveNetwork(network.key)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  activeNetwork === network.key
                    ? "border-white/80 bg-white text-slate-900"
                    : "border-white/30 text-white/80 hover:border-white/60"
                }`}
              >
                {network.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--border)] bg-white px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {SECTIONS.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`rounded-[10px] px-3 py-2 text-xs font-semibold transition ${
                  activeSection === section.key
                    ? "bg-[var(--primary-light)] text-[var(--primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                }`}
              >
                {section.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <CalendarDays className="h-4 w-4" />
              {periodPreset === "custom" && customFrom && customTo
                ? `${customFrom} ate ${customTo}`
                : PERIOD_PRESETS.find((preset) => preset.value === periodPreset)?.label}
            </div>
          </div>
        </div>
      </div>

      {periodPreset === "custom" ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Data inicial</Label>
            <DateField
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Data final</Label>
            <DateField
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-8 space-y-8">{renderSectionContent()}</div>
    </PageShell>
  );
}
