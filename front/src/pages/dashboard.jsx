import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import { cn } from "@/utils/classnames.js";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckSquare,
  Clock,
  FileText,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getWorkflowStatusConfig,
  resolveWorkflowStatus,
  WORKFLOW_STATUS_ORDER,
} from "@/utils/postStatus.js";

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const TASK_STATUS_LABELS = {
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluidas",
  BLOCKED: "Bloqueadas",
};

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

const STAT_ACCENTS = {
  clients: { solid: "#2563eb", soft: "rgba(37, 99, 235, 0.12)" },
  posts: { solid: "#6d28d9", soft: "rgba(109, 40, 217, 0.12)" },
  tasks: { solid: "#B050F0", soft: "rgba(176, 80, 240, 0.16)" },
  team: { solid: "#0f766e", soft: "rgba(15, 118, 110, 0.16)" },
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function formatCompact(value) {
  try {
    return new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Number(value || 0));
  } catch (err) {
    return formatNumber(value);
  }
}

function formatPercent(value) {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return `${num.toFixed(1)}%`;
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function AnimatedNumber({ value, formatter = formatNumber }) {
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(Number(value || 0));
      return;
    }

    let raf;
    const duration = 900;
    const start = performance.now();
    const from = display;
    const to = Number(value || 0);

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const next = from + (to - from) * progress;
      setDisplay(next);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span>{formatter(display)}</span>;
}

function toDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA");
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildRange(days) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function countByRange(items, dateKey, range) {
  if (!Array.isArray(items)) return 0;
  const { start, end } = range;
  return items.filter((item) => {
    const date = parseDate(item?.[dateKey] || item?.createdAt || item?.created_at);
    if (!date) return false;
    return date >= start && date <= end;
  }).length;
}

function buildDailySeries({ items, dateKey, days }) {
  const range = buildRange(days);
  const map = new Map();
  if (Array.isArray(items)) {
    items.forEach((item) => {
      const key = toDateKey(item?.[dateKey] || item?.createdAt || item?.created_at);
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
  }

  const series = [];
  for (let idx = 0; idx < days; idx += 1) {
    const date = new Date(range.start);
    date.setDate(range.start.getDate() + idx);
    const key = toDateKey(date);
    series.push({
      day: date.toLocaleDateString("pt-BR", { weekday: "short" }),
      dateKey: key,
      value: map.get(key) || 0,
    });
  }
  return series;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  accent,
  trend,
  sparkline,
  isLoading,
  size = "md",
  className = "",
}) {
  const trendPositive = trend !== null && trend !== undefined ? trend >= 0 : null;
  const TrendIcon = trendPositive ? ArrowUpRight : ArrowDownRight;
  const isLarge = size === "lg";
  const isCompact = size === "sm";
  const valueClasses = cn(
    "tracking-tight leading-none",
    isLarge ? "text-4xl md:text-5xl" : isCompact ? "text-2xl" : "text-3xl"
  );
  const iconBoxClasses = isLarge ? "h-11 w-11" : "h-9 w-9";
  const iconClasses = isLarge ? "h-5 w-5" : "h-4 w-4";
  const contentPadding = isLarge ? "pt-6" : isCompact ? "pt-4" : "pt-5";
  const sparklineHeight = isLarge ? "h-20" : "h-16";

  return (
    <Card
      className={cn(
        "group relative overflow-hidden border border-[var(--border)] bg-white transition hover:-translate-y-0.5 hover:shadow-lg",
        isLarge ? "min-h-[220px]" : "min-h-[190px]",
        className
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent?.solid }} />
      <CardContent className={cn("space-y-3", contentPadding)}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            {title}
          </p>
          <div
            className={cn("flex items-center justify-center rounded-[12px]", iconBoxClasses)}
            style={{ backgroundColor: accent?.soft, color: accent?.solid }}
          >
            {Icon ? <Icon className={cn("kondor-float", iconClasses)} /> : null}
          </div>
        </div>
        <div className={cn("font-semibold text-[var(--text)]", valueClasses)}>
          {isLoading ? <span className="inline-block h-7 w-20 rounded-full kondor-shimmer" /> : (
            <AnimatedNumber value={value} formatter={formatCompact} />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          <span>{description}</span>
          {trend !== null && trend !== undefined ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                trendPositive ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"
              }`}
            >
              <TrendIcon className="h-3 w-3" />
              {formatPercent(Math.abs(trend))}
            </span>
          ) : null}
        </div>
        {sparkline && !isCompact ? (
          <div className={sparklineHeight}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkline}>
                <defs>
                  <linearGradient id={`spark-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent?.solid} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accent?.solid} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={accent?.solid}
                  fill={`url(#spark-${title})`}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CommandKpi({
  title,
  value,
  description,
  icon: Icon,
  accent,
  trend,
  isLoading,
}) {
  const trendPositive = trend !== null && trend !== undefined ? trend >= 0 : null;
  const TrendIcon = trendPositive ? ArrowUpRight : ArrowDownRight;
  const gradient = accent?.solid
    ? `linear-gradient(135deg, ${accent.solid}, #0f172a)`
    : "linear-gradient(135deg, #0f172a, #0f172a)";

  return (
    <div className="group relative overflow-hidden rounded-[18px] border border-[var(--border)] bg-white/90 p-5 shadow-[var(--shadow-sm)]">
      <div
        className="absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-60"
        style={{ backgroundColor: accent?.soft }}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">
            {title}
          </p>
          <div
            className="mt-3 text-4xl font-semibold leading-none tracking-tight text-transparent bg-clip-text md:text-5xl"
            style={{ backgroundImage: gradient }}
          >
            {isLoading ? (
              <span className="inline-block h-9 w-28 rounded-full kondor-shimmer" />
            ) : (
              <AnimatedNumber value={value} formatter={formatNumber} />
            )}
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">{description}</p>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/60"
          style={{ backgroundColor: accent?.soft, color: accent?.solid }}
        >
          {Icon ? <Icon className="h-5 w-5" /> : null}
        </div>
      </div>
      {trend !== null && trend !== undefined ? (
        <div
          className={`mt-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            trendPositive ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"
          }`}
        >
          <TrendIcon className="h-3 w-3" />
          {formatPercent(Math.abs(trend))}
          <span className="text-[10px] font-medium text-[var(--text-muted)]">
            vs periodo anterior
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ActionTile({ title, description, icon: Icon, accent, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-4 rounded-[16px] border border-[var(--border)] bg-white px-4 py-3 text-left shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[12px]"
          style={{ backgroundColor: accent?.soft, color: accent?.solid }}
        >
          {Icon ? <Icon className="h-4 w-4" /> : null}
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
          <p className="text-xs text-[var(--text-muted)]">{description}</p>
        </div>
      </div>
      <ArrowUpRight className="h-4 w-4 text-[var(--text-muted)] transition group-hover:text-[var(--text)]" />
    </button>
  );
}

export default function Dashboard() {
  const [rangeDays, setRangeDays] = useState(30);
  const navigate = useNavigate();
  const {
    data: clients = [],
    isLoading: loadingClients,
    refetch: refetchClients,
  } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const {
    data: posts = [],
    isLoading: loadingPosts,
    refetch: refetchPosts,
  } = useQuery({
    queryKey: ["posts"],
    queryFn: () => base44.entities.Post.list(),
  });

  const {
    data: tasks = [],
    isLoading: loadingTasks,
    refetch: refetchTasks,
  } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });

  const {
    data: team = [],
    isLoading: loadingTeam,
    refetch: refetchTeam,
  } = useQuery({
    queryKey: ["team"],
    queryFn: () => base44.entities.TeamMember.list("-created_date"),
  });

  const isLoading = loadingClients || loadingPosts || loadingTasks || loadingTeam;

  const totalClients = clients.length;
  const totalPosts = posts.length;
  const totalTasks = tasks.length;
  const totalTeam = team.length;

  const range = useMemo(() => buildRange(rangeDays), [rangeDays]);

  const postsSeries = useMemo(
    () => buildDailySeries({ items: posts, dateKey: "createdAt", days: Math.min(rangeDays, 14) }),
    [posts, rangeDays]
  );

  const tasksSeries = useMemo(
    () => buildDailySeries({ items: tasks, dateKey: "createdAt", days: Math.min(rangeDays, 14) }),
    [tasks, rangeDays]
  );

  const activitySeries = useMemo(
    () =>
      postsSeries.map((entry, index) => ({
        day: entry.day,
        posts: entry.value,
        tasks: tasksSeries[index]?.value || 0,
      })),
    [postsSeries, tasksSeries]
  );

  const postsByStatus = useMemo(() => {
    const counts = new Map();
    posts.forEach((post) => {
      const key = resolveWorkflowStatus(post);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return WORKFLOW_STATUS_ORDER.map((statusKey) => {
      const config = getWorkflowStatusConfig(statusKey);
      return {
        key: statusKey,
        label: config.label,
        value: counts.get(statusKey) || 0,
      };
    });
  }, [posts]);

  const tasksByStatus = useMemo(() => {
    const counts = new Map();
    tasks.forEach((task) => {
      const status = task.status || "TODO";
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([status, value]) => ({
      key: status,
      label: TASK_STATUS_LABELS[status] || status,
      value,
    }));
  }, [tasks]);

  const postsInRange = countByRange(posts, "createdAt", range);
  const tasksInRange = countByRange(tasks, "createdAt", range);
  const clientsInRange = countByRange(clients, "createdAt", range);
  const teamInRange = countByRange(team, "createdAt", range);

  const previousRange = useMemo(() => {
    const end = new Date(range.start);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(end.getDate() - (rangeDays - 1));
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }, [range, rangeDays]);

  const buildTrend = (current, items, dateKey) => {
    const previous = countByRange(items, dateKey, previousRange);
    if (!previous) return null;
    return ((current - previous) / previous) * 100;
  };

  const clientsTrend = buildTrend(clientsInRange, clients, "createdAt");
  const postsTrend = buildTrend(postsInRange, posts, "createdAt");
  const tasksTrend = buildTrend(tasksInRange, tasks, "createdAt");
  const teamTrend = buildTrend(teamInRange, team, "createdAt");

  const handleGlobalRefresh = () => {
    refetchClients();
    refetchPosts();
    refetchTasks();
    refetchTeam();
  };

  return (
    <PageShell>
      <PageHeader
        title="Centro de comando"
        subtitle="Entenda o status da agencia em segundos."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-[12px] border border-[var(--border)] bg-white p-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setRangeDays(option.days)}
                  className={`px-3 py-1 text-xs font-semibold rounded-[8px] transition ${
                    rangeDays === option.days
                      ? "bg-[var(--primary-light)] text-[var(--primary)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {isLoading ? (
              <Badge
                variant="outline"
                className="flex items-center gap-2 text-xs"
              >
                <Clock className="w-3 h-3" />
                Atualizando dados...
              </Badge>
            ) : null}
            <Button
              size="lg"
              leftIcon={RefreshCw}
              onClick={handleGlobalRefresh}
            >
              Atualizar
            </Button>
          </div>
        }
      />

      <div className="mt-8 space-y-12">
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">
                Visao geral
              </p>
              <h2 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">
                Centro de comando da agencia
              </h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                KPIs criticos, tendencias e proximas acoes para guiar o dia.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--text-muted)] shadow-[var(--shadow-sm)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
              {`Ultimos ${rangeDays} dias`}
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--border)] bg-[radial-gradient(900px_420px_at_10%_-20%,rgba(37,99,235,0.12),transparent_60%),radial-gradient(800px_420px_at_90%_-20%,rgba(109,40,217,0.15),transparent_60%),var(--surface)] p-6 shadow-[var(--shadow-md)]">
            <div className="grid gap-6 lg:grid-cols-[2.2fr_1fr]">
              <div className="grid gap-4 md:grid-cols-2">
                <CommandKpi
                  title="Clientes ativos"
                  value={totalClients}
                  description={`${clientsInRange} novos no periodo`}
                  icon={Users}
                  accent={STAT_ACCENTS.clients}
                  trend={clientsTrend}
                  isLoading={isLoading}
                />
                <CommandKpi
                  title="Posts em fluxo"
                  value={totalPosts}
                  description={`${postsInRange} criados no periodo`}
                  icon={FileText}
                  accent={STAT_ACCENTS.posts}
                  trend={postsTrend}
                  isLoading={isLoading}
                />
                <CommandKpi
                  title="Tarefas em aberto"
                  value={totalTasks}
                  description={`${tasksInRange} criadas no periodo`}
                  icon={CheckSquare}
                  accent={STAT_ACCENTS.tasks}
                  trend={tasksTrend}
                  isLoading={isLoading}
                />
                <CommandKpi
                  title="Time ativo"
                  value={totalTeam}
                  description={`${teamInRange} novas entradas no periodo`}
                  icon={Activity}
                  accent={STAT_ACCENTS.team}
                  trend={teamTrend}
                  isLoading={isLoading}
                />
              </div>

              <div className="rounded-[22px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(109,40,217,0.08))] p-5 shadow-[var(--shadow-md)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Acoes rapidas
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    CTA
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Comandos diretos para destravar o dia da agencia.
                </p>
                <div className="mt-4 space-y-3">
                  <Button
                    size="lg"
                    leftIcon={Plus}
                    className="w-full"
                    onClick={() => navigate("/posts/new")}
                  >
                    Criar post
                  </Button>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ActionTile
                      title="Posts"
                      description="Kanban e calendario"
                      icon={FileText}
                      accent={STAT_ACCENTS.posts}
                      onClick={() => navigate("/posts")}
                    />
                    <ActionTile
                      title="Tarefas"
                      description="Operacao do time"
                      icon={CheckSquare}
                      accent={STAT_ACCENTS.tasks}
                      onClick={() => navigate("/tasks")}
                    />
                    <ActionTile
                      title="Clientes"
                      description="Relacionamentos ativos"
                      icon={Users}
                      accent={STAT_ACCENTS.clients}
                      onClick={() => navigate("/clients")}
                    />
                    <ActionTile
                      title="Métricas"
                      description="Resultados e insights"
                      icon={BarChart3}
                      accent={STAT_ACCENTS.team}
                      onClick={() => navigate("/metrics")}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">
              Operacao
            </p>
            <h3 className="text-xl font-semibold text-[var(--text)] md:text-2xl">
              Ritmo diario e entregas
            </h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Cadencia de producao, gargalos e proximos posts da agencia.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
            <Card className="lg:row-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-[var(--text)]">
                  Cadencia de producao
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-[var(--chart-1)]" />
                    Posts
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-[var(--chart-3)]" />
                    Tarefas
                  </span>
                </div>
              </CardHeader>
              <CardContent className="h-[320px]">
                {activitySeries.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activitySeries}>
                      <defs>
                        <linearGradient id="postsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="tasksFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-muted)" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          borderColor: "var(--border)",
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="posts"
                        stroke="var(--chart-1)"
                        fill="url(#postsFill)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="tasks"
                        stroke="var(--chart-3)"
                        fill="url(#tasksFill)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-[var(--text-muted)]">
                    <p>Sem atividade registrada neste periodo.</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate("/posts/new")}
                    >
                      Criar post
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium text-[var(--text)]">
                    Distribuicao de tarefas
                  </CardTitle>
                  <BarChart3 className="h-4 w-4 text-[var(--text-muted)] kondor-float" />
                </CardHeader>
                <CardContent className="h-[230px]">
                  {tasksByStatus.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={tasksByStatus}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={50}
                          outerRadius={85}
                          paddingAngle={4}
                        >
                          {tasksByStatus.map((entry, index) => (
                            <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            borderColor: "var(--border)",
                            fontSize: 12,
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-[var(--text-muted)]">
                      <p>Nenhuma tarefa encontrada neste recorte.</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate("/tasks")}
                      >
                        Ver tarefas
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-[var(--text)]">
                    Agenda dos proximos posts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {posts
                    .filter((post) => post.scheduledDate || post.scheduled_at)
                    .sort((a, b) => {
                      const first = parseDate(a.scheduledDate || a.scheduled_at) || new Date(0);
                      const second = parseDate(b.scheduledDate || b.scheduled_at) || new Date(0);
                      return first - second;
                    })
                    .slice(0, 4)
                    .map((post) => {
                      const status = resolveWorkflowStatus(post);
                      const config = getWorkflowStatusConfig(status);
                      return (
                        <div
                          key={post.id}
                          className="flex items-start justify-between gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[var(--text)]">
                              {post.title || "Post sem titulo"}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {parseDate(post.scheduledDate || post.scheduled_at)?.toLocaleDateString("pt-BR") ||
                                "Sem data"}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${config.badge}`}>
                            {config.label}
                          </span>
                        </div>
                      );
                    })}
                  {!posts.length ? (
                    <div className="rounded-[12px] border border-dashed border-[var(--border)] px-4 py-4 text-center text-sm text-[var(--text-muted)]">
                      <p>Sem posts agendados por enquanto.</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        onClick={() => navigate("/posts/new")}
                      >
                        Agendar um post
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">
              Performance
            </p>
            <h3 className="text-xl font-semibold text-[var(--text)] md:text-2xl">
              Saude do pipeline e produtividade
            </h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Evolucao do time, eficiencia e distribuicao de conteudo.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-6 md:grid-cols-2">
              <StatCard
                size="lg"
                title="Posts"
                value={totalPosts}
                description={`${postsInRange} criados no periodo`}
                icon={FileText}
                accent={STAT_ACCENTS.posts}
                trend={postsTrend}
                sparkline={postsSeries.slice(-7)}
                isLoading={isLoading}
              />
              <StatCard
                size="lg"
                title="Tarefas"
                value={totalTasks}
                description={`${tasksInRange} criadas no periodo`}
                icon={CheckSquare}
                accent={STAT_ACCENTS.tasks}
                trend={tasksTrend}
                sparkline={tasksSeries.slice(-7)}
                isLoading={isLoading}
              />
              <StatCard
                size="sm"
                title="Clientes"
                value={totalClients}
                description={`${clientsInRange} novos no periodo`}
                icon={Users}
                accent={STAT_ACCENTS.clients}
                trend={clientsTrend}
                isLoading={isLoading}
              />
              <StatCard
                size="sm"
                title="Equipe"
                value={totalTeam}
                description={`${teamInRange} novos membros no periodo`}
                icon={Activity}
                accent={STAT_ACCENTS.team}
                trend={teamTrend}
                isLoading={isLoading}
              />
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-[var(--text)]">
                  Posts por status
                </CardTitle>
                <span className="text-xs text-[var(--text-muted)]">
                  Total {formatNumber(totalPosts)}
                </span>
              </CardHeader>
              <CardContent className="h-[320px]">
                {postsByStatus.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={postsByStatus}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-muted)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          borderColor: "var(--border)",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {postsByStatus.map((entry, index) => (
                          <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-[var(--text-muted)]">
                    <p>Nenhum post entrou no pipeline ainda.</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate("/posts/new")}
                    >
                      Criar primeiro post
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
