import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/apiClient/base44Client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import PageShell from "@/components/ui/page-shell.jsx";
import PageHeader from "@/components/ui/page-header.jsx";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckSquare,
  Clock,
  FileText,
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
  tasks: { solid: "#f59e0b", soft: "rgba(245, 158, 11, 0.16)" },
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

function StatCard({ title, value, description, icon: Icon, accent, trend, sparkline, isLoading }) {
  const trendPositive = trend !== null && trend !== undefined ? trend >= 0 : null;
  const TrendIcon = trendPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="group relative overflow-hidden border border-[var(--border)] bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent?.solid }} />
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            {title}
          </p>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[12px]"
            style={{ backgroundColor: accent?.soft, color: accent?.solid }}
          >
            {Icon ? <Icon className="h-4 w-4 kondor-float" /> : null}
          </div>
        </div>
        <div className="text-3xl font-semibold text-[var(--text)]">
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
        {sparkline ? (
          <div className="h-16">
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

export default function Dashboard() {
  const [rangeDays, setRangeDays] = useState(30);
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
        title="Visão geral"
        subtitle="Acompanhe rapidamente o desempenho da sua agência."
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
              variant="secondary"
              leftIcon={RefreshCw}
              onClick={handleGlobalRefresh}
            >
              Atualizar
            </Button>
          </div>
        }
      />

      <div className="mt-6 space-y-8">
        <div className="rounded-[20px] border border-[var(--border)] bg-gradient-to-r from-[var(--primary)] via-[#7c3aed] to-[var(--accent-sky)] p-6 text-white shadow-[var(--shadow-md)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/70">
                Dashboard
              </p>
              <h2 className="text-2xl font-semibold">Visao consolidada</h2>
              <p className="mt-2 text-sm text-white/80">
                Tendencias, cadencia de conteudos e produtividade em um so lugar.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-semibold text-white/90">
              <Sparkles className="h-4 w-4 kondor-pulse" />
              {`Ultimos ${rangeDays} dias`}
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              { label: "Clientes", value: totalClients },
              { label: "Posts ativos", value: totalPosts },
              { label: "Tarefas em aberto", value: totalTasks },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[14px] border border-white/15 bg-white/10 px-4 py-3"
              >
                <p className="text-xs text-white/70">{item.label}</p>
                <p className="mt-1 text-xl font-semibold">
                  {isLoading ? "—" : formatNumber(item.value)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Clientes"
            value={totalClients}
            description={`${clientsInRange} novos no periodo`}
            icon={Users}
            accent={STAT_ACCENTS.clients}
            trend={clientsTrend}
            sparkline={buildDailySeries({
              items: clients,
              dateKey: "createdAt",
              days: 7,
            })}
            isLoading={isLoading}
          />
          <StatCard
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
            title="Equipe"
            value={totalTeam}
            description={`${teamInRange} novos membros no periodo`}
            icon={Activity}
            accent={STAT_ACCENTS.team}
            trend={teamTrend}
            isLoading={isLoading}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
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
            <CardContent className="h-[260px]">
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
                <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                  Nenhuma atividade registrada neste periodo.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-[var(--text)]">
                Distribuicao de tarefas
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-[var(--text-muted)] kondor-float" />
            </CardHeader>
            <CardContent className="h-[260px]">
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
                <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                  Nenhuma tarefa encontrada.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-[var(--text)]">
                Posts por status
              </CardTitle>
              <span className="text-xs text-[var(--text-muted)]">
                Total {formatNumber(totalPosts)}
              </span>
            </CardHeader>
            <CardContent className="h-[280px]">
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
                <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                  Nenhum post encontrado.
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
                <div className="rounded-[12px] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--text-muted)]">
                  Crie posts para visualizar o calendario aqui.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
