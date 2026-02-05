import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  NavLink,
  Outlet,
  Link,
  useNavigate,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import BackButton from "@/components/ui/back-button.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.jsx";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  LayoutGrid,
  MessageCircle,
  ThumbsUp,
  XCircle,
  Video,
} from "lucide-react";

import { base44 } from "@/apiClient/base44Client";
import logoHeader from "@/assets/logoheader.png";
import { isVideoMedia, resolveMediaUrl } from "@/lib/media.js";
import { applyTenantTheme, resolveTenantBranding } from "@/utils/theme.js";

const ClientPortalContext = createContext(null);

function useClientPortal() {
  const ctx = useContext(ClientPortalContext);
  if (!ctx) {
    throw new Error("useClientPortal deve ser usado dentro do ClientPortalLayout");
  }
  return ctx;
}

async function fetchClient(path, options = {}) {
  const fetchOptions = {
    method: options.method || "GET",
    headers: {
      ...(options.headers || {}),
    },
    credentials: "include",
  };

  if (options.body !== undefined) {
    fetchOptions.body =
      typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    const isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData;
    if (!isFormData) {
      fetchOptions.headers["Content-Type"] =
        options.headers?.["Content-Type"] || "application/json";
    }
  }

  const res = await base44.rawFetch(path, fetchOptions);

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    const msg =
      data?.error ||
      (res.status === 401
        ? "Sessão expirada. Faça login novamente."
        : "Erro ao carregar dados do portal.");
    const error = new Error(msg);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export default function ClientPortalLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState(null);

  const {
    data: meData,
    isLoading: loadingMe,
    error: meError,
  } = useQuery({
    queryKey: ["client-portal", "me"],
    queryFn: () => fetchClient("/client-portal/me"),
    retry: false,
  });

  const tenant = meData?.tenant || null;

  useEffect(() => {
    if (!tenant) return;
    applyTenantTheme(tenant);
  }, [tenant]);

  useEffect(() => {
    if (!meError) return;
    if (meError.status === 401) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("kondor_client_auth");
        window.localStorage.removeItem("kondor_client_token");
      }
      navigate("/clientlogin");
      return;
    }
    setAuthError(meError.message || "Erro ao carregar dados do cliente");
  }, [meError, navigate]);

  const client = meData?.client || null;
  const queriesEnabled = !!client;

  const {
    data: postsData,
    isLoading: loadingPosts,
  } = useQuery({
    queryKey: ["client-portal", "posts"],
    enabled: queriesEnabled,
    queryFn: () => fetchClient("/client-portal/posts"),
  });
  const posts = postsData?.items || [];

  const {
    data: metricsData,
    isLoading: loadingMetrics,
  } = useQuery({
    queryKey: ["client-portal", "metrics"],
    enabled: queriesEnabled,
    queryFn: () => fetchClient("/client-portal/metrics"),
  });
  const metrics = metricsData?.items || [];

  const {
    data: approvalsData,
    isLoading: loadingApprovals,
  } = useQuery({
    queryKey: ["client-portal", "approvals", "PENDING"],
    enabled: queriesEnabled,
    queryFn: () => fetchClient("/client-portal/approvals?status=PENDING"),
  });
  const approvals = approvalsData?.items || [];

  const requestPostChanges = useCallback(
    (postId, note) =>
      fetchClient(`/client-portal/posts/${postId}/request-changes`, {
        method: "POST",
        body: { note },
      }),
    [],
  );

  const approvalsByPostId = useMemo(() => {
    const map = new Map();
    approvals.forEach((approval) => {
      const postId = approval.postId || approval.post?.id;
      if (!postId) return;
      const existing = map.get(postId);
      if (!existing) {
        map.set(postId, approval);
        return;
      }
      const d1 = existing.createdAt ? new Date(existing.createdAt) : null;
      const d2 = approval.createdAt ? new Date(approval.createdAt) : null;
      if (!d1 || (d2 && d2 > d1)) map.set(postId, approval);
    });
    return map;
  }, [approvals]);

  const pendingPosts = useMemo(
    () => posts.filter((p) => approvalsByPostId.has(p.id)),
    [posts, approvalsByPostId],
  );

  const awaitingCorrection = useMemo(
    () =>
      posts.filter(
        (p) => p.status === "DRAFT" && Boolean((p.clientFeedback || p.client_feedback || "").trim()),
      ),
    [posts],
  );

  const approvedPosts = useMemo(
    () => posts.filter((p) => ["APPROVED", "SCHEDULED", "PUBLISHED"].includes(p.status)),
    [posts],
  );

  const refusedPosts = useMemo(
    () => posts.filter((p) => p.status === "REJECTED" || p.status === "CANCELLED"),
    [posts],
  );

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  const showToast = useCallback((message) => {
    if (!message) return;
    setToast({ id: Date.now(), message });
  }, []);

  const queryClientInvalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["client-portal", "posts"] });
    queryClient.invalidateQueries({ queryKey: ["client-portal", "approvals", "PENDING"] });
    queryClient.invalidateQueries({ queryKey: ["client-portal", "metrics"] });
  }, [queryClient]);

  const approveClientApproval = useCallback(
    async (approvalId) => {
      if (!approvalId) return;
      await fetchClient(`/client-portal/approvals/${approvalId}/approve`, {
        method: "POST",
        body: {},
      });
      queryClientInvalidate();
    },
    [queryClientInvalidate],
  );

  const rejectClientApproval = useCallback(
    async (approvalId, payload = {}) => {
      if (!approvalId) return;
      await fetchClient(`/client-portal/approvals/${approvalId}/reject`, {
        method: "POST",
        body: payload,
      });
      queryClientInvalidate();
    },
    [queryClientInvalidate],
  );

  const handleApproveAction = useCallback(
    async (approvalId) => {
      await approveClientApproval(approvalId);
    },
    [approveClientApproval],
  );

  const handleRejectAction = useCallback(
    async (approvalId, defaultMessage = "Post recusado pelo cliente") => {
      if (!approvalId) return;
      const reason =
        typeof window !== "undefined"
          ? window.prompt("Conte brevemente o motivo:", defaultMessage) || defaultMessage
          : defaultMessage;
      await rejectClientApproval(approvalId, { notes: reason });
    },
    [rejectClientApproval],
  );

  const handleRequestChanges = useCallback(
    async (postId, approvalId, note) => {
      const trimmed = (note || "").trim();
      if (!postId || trimmed.length < 3) {
        throw new Error("Descreva o ajuste com pelo menos 3 caracteres");
      }

      const updatedPost = await requestPostChanges(postId, trimmed);

      queryClient.setQueryData(["client-portal", "posts"], (old) => {
        if (!old || !Array.isArray(old.items)) return old;
        return {
          ...old,
          items: old.items.map((item) => {
            if (item.id !== postId) return item;
            const nextFeedback =
              updatedPost?.clientFeedback ??
              updatedPost?.client_feedback ??
              trimmed;
            const nextStatus = updatedPost?.status || "DRAFT";
            return {
              ...item,
              status: nextStatus,
              clientFeedback: nextFeedback,
              client_feedback: nextFeedback,
            };
          }),
        };
      });

      if (approvalId) {
        queryClient.setQueryData(["client-portal", "approvals", "PENDING"], (old) => {
          if (!old || !Array.isArray(old.items)) return old;
          return {
            ...old,
            items: old.items.filter((approval) => approval.id !== approvalId),
          };
        });
      }

      queryClientInvalidate();
      showToast("Solicitação enviada com sucesso!");
    },
    [queryClient, queryClientInvalidate, requestPostChanges, showToast],
  );

  const handleLogout = useCallback(async () => {
    try {
      await base44.rawFetch("/auth/client-logout", { method: "POST" });
    } catch (err) {}
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("kondor_client_auth");
      window.localStorage.removeItem("kondor_client_token");
    }
    navigate("/clientlogin");
  }, [navigate]);

  const totalMetrics = useMemo(() => {
    return metrics.reduce(
      (acc, m) => {
        const name = (m.name || "").toLowerCase();
        const value = typeof m.value === "number" ? m.value : 0;
        if (name.includes("impression")) acc.impressions += value;
        if (name.includes("click")) acc.clicks += value;
        if (name.includes("spend") || name.includes("cost")) acc.spend += value;
        if (name.includes("reach")) acc.reach += value;
        return acc;
      },
      { impressions: 0, clicks: 0, spend: 0, reach: 0 },
    );
  }, [metrics]);

  const postsThisMonth = useMemo(() => {
    const now = new Date();
    return posts.filter((post) => {
      if (!post.createdAt) return false;
      const created = new Date(post.createdAt);
      return (
        created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()
      );
    }).length;
  }, [posts]);

  const isLoadingAny = loadingMe || loadingPosts || loadingMetrics || loadingApprovals;

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md bg-white shadow rounded-lg p-6 text-center space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Erro de autenticação</h2>
          <p className="text-sm text-gray-600">{authError}</p>
          <Button onClick={() => navigate("/clientlogin")}>Voltar para login</Button>
        </div>
      </div>
    );
  }

  if (isLoadingAny && !client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md bg-white shadow rounded-lg p-6 text-center space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Carregando portal...</h2>
          <p className="text-sm text-gray-600">Buscando suas informações e posts.</p>
        </div>
      </div>
    );
  }

  const contextValue = {
    client,
    tenant,
    posts,
    metrics,
    approvals,
    approvalsByPostId,
    pendingPosts,
    awaitingCorrection,
    approvedPosts,
    refusedPosts,
    totalMetrics,
    postsThisMonth,
    isLoadingAny,
    actions: {
      approve: handleApproveAction,
      requestChanges: handleRequestChanges,
      reject: handleRejectAction,
      logout: handleLogout,
    },
  };

  return (
    <ClientPortalContext.Provider value={contextValue}>
      <ClientPortalScaffold />
      <PortalToast toast={toast} />
    </ClientPortalContext.Provider>
  );
}

function ClientPortalScaffold() {
  const { client, actions } = useClientPortal();
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <ClientTopbar clientName={client?.name || "Conta"} onLogout={actions.logout} />
      <PageContainer>
        <Outlet />
      </PageContainer>
    </div>
  );
}

function ClientTopbar({ clientName, onLogout }) {
  return (
    <header className="bg-[var(--surface)] border-b border-[var(--border)]">
      <div className="max-w-6xl mx-auto flex flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-6">
          <BackButton
            fallback="/client"
            size="sm"
            variant="outline"
            labelClassName="hidden md:inline"
          />
          <BrandLogo />
          <ClientNav />
        </div>
        <ClientAccountMenu clientName={clientName} onLogout={onLogout} />
      </div>
    </header>
  );
}

function BrandLogo() {
  const { tenant } = useClientPortal();
  const branding = resolveTenantBranding(tenant || {});
  const logoSrc = branding.logoUrl || logoHeader;
  return (
    <div className="flex items-center gap-3">
      <img src={logoSrc} alt={branding.name || "Kondor"} className="h-10 w-auto" />
    </div>
  );
}

function ClientNav() {
  const links = [
    { to: "/client", label: "Início" },
    { to: "/client/posts", label: "Posts" },
    { to: "/client/metrics", label: "Métricas" },
  ];

  return (
    <nav className="flex items-center gap-1 rounded-full bg-[var(--primary-light)] p-1 text-sm">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === "/client"}
          className={({ isActive }) =>
            [
              "px-4 py-2 rounded-full font-medium transition-colors",
              isActive
                ? "bg-[var(--primary)] text-white shadow"
                : "text-[var(--text-muted)] hover:text-[var(--primary)]",
            ].join(" ")
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

function ClientAccountMenu({ clientName, onLogout }) {
  return (
    <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
      <span className="font-medium text-[var(--text)]">{clientName}</span>
      <Button type="button" onClick={onLogout} className="px-4 py-2">
        Sair
      </Button>
    </div>
  );
}

function PageContainer({ children }) {
  return <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">{children}</main>;
}

export function ClientHomePage() {
  const {
    pendingPosts,
    awaitingCorrection,
    approvedPosts,
    posts,
    totalMetrics,
    postsThisMonth,
    approvalsByPostId,
    actions,
  } = useClientPortal();

  const recentPosts = useMemo(() => {
    const sorted = [...posts].sort((a, b) => {
      const d1 = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const d2 = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return d2 - d1;
    });
    return sorted.slice(0, 4);
  }, [posts]);

  return (
    <div className="space-y-8">
      <StatsRow
        pending={pendingPosts.length}
        awaiting={awaitingCorrection.length}
        approved={approvedPosts.length}
        total={postsThisMonth || posts.length}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <QuickAlertsCard
          pending={pendingPosts.length}
          awaiting={awaitingCorrection.length}
          refused={posts.filter((p) => p.status === "REJECTED" || p.status === "CANCELLED").length}
        />
        <MiniMetricsCard totalMetrics={totalMetrics} />
      </div>
      <RecentPostsCard
        posts={recentPosts}
        approvalsByPostId={approvalsByPostId}
        onApprove={actions.approve}
        onRequestChanges={actions.requestChanges}
        onReject={actions.reject}
      />
    </div>
  );
}

export function ClientPostsPage() {
  const {
    posts,
    approvalsByPostId,
    actions,
  } = useClientPortal();
  const [previewPost, setPreviewPost] = useState(null);

  const grouped = useMemo(() => {
    const withFeedback = (post) =>
      post.status === "DRAFT" &&
      Boolean((post.clientFeedback || post.client_feedback || "").trim());

    return {
      pending: posts.filter((p) => p.status === "PENDING_APPROVAL"),
      revision: posts.filter(withFeedback),
      approved: posts.filter((p) => ["APPROVED", "SCHEDULED", "PUBLISHED"].includes(p.status)),
      archived: posts.filter((p) => p.status === "ARCHIVED"),
      rejected: posts.filter((p) => p.status === "REJECTED" || p.status === "CANCELLED"),
    };
  }, [posts]);

  const columns = [
    { key: "pending", title: "Aguardando aprovação" },
    { key: "revision", title: "Aguardando correção" },
    { key: "approved", title: "Aprovado / Postado" },
    { key: "archived", title: "Arquivado" },
    { key: "rejected", title: "Recusado" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Posts</h1>
        <p className="text-sm text-slate-500">
          Visualize e aprove o conteúdo enviado pela sua agência.
        </p>
      </div>
      <ClientKanbanBoard
        columns={columns}
        grouped={grouped}
        approvalsByPostId={approvalsByPostId}
        onApprove={actions.approve}
        onReject={actions.reject}
        onRequestChanges={actions.requestChanges}
        onPreview={setPreviewPost}
      />
      <PostPreviewModal
        post={previewPost}
        approval={previewPost ? approvalsByPostId.get(previewPost.id) : null}
        onClose={() => setPreviewPost(null)}
        onApprove={actions.approve}
        onReject={actions.reject}
        onRequestChanges={actions.requestChanges}
      />
    </div>
  );
}

export function ClientMetricsPage() {
  const { metrics, totalMetrics } = useClientPortal();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Métricas</h1>
        <p className="text-sm text-slate-500">
          Acompanhe o desempenho das principais plataformas conectadas.
        </p>
      </div>
      <MetricsSummary totalMetrics={totalMetrics} />
      <Card className="border border-slate-100 shadow-sm bg-white/90">
        <CardContent className="pt-6">
          <PlatformTabs metrics={metrics} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatsRow({ pending, awaiting, approved, total }) {
  const cards = [
    {
      icon: <AlertTriangle className="h-5 w-5 text-purple-500" />,
      label: "Posts aguardando aprovação",
      value: pending,
    },
    {
      icon: <Clock className="h-5 w-5 text-purple-500" />,
      label: "Aguardando correção",
      value: awaiting,
    },
    {
      icon: <CheckCircle className="h-5 w-5 text-emerald-500" />,
      label: "Aprovado / Postado",
      value: approved,
    },
    {
      icon: <LayoutGrid className="h-5 w-5 text-slate-500" />,
      label: "Total no mês",
      value: total,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card
          key={card.label}
          className="border border-slate-100 shadow-sm bg-white/90 backdrop-blur"
        >
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-center gap-2 text-slate-500">{card.icon}</div>
            <p className="text-xs uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="text-3xl font-semibold text-slate-900">{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function QuickAlertsCard({ pending, awaiting, refused }) {
  const alerts = [
    {
      label: "Posts aguardando sua aprovação",
      value: `${pending} itens`,
      to: "/client/posts",
    },
    {
      label: "Correções pendentes",
      value: `${awaiting} itens`,
      to: "/client/posts",
    },
    {
      label: "Recusados recentemente",
      value: `${refused} itens`,
      to: "/client/posts",
    },
  ];

  return (
    <Card className="shadow-sm border border-slate-100 bg-white/90 backdrop-blur lg:col-span-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-600">Alertas rápidos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => (
          <Link
            key={alert.label}
            to={alert.to}
            className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm text-slate-700 hover:border-slate-200 hover:bg-slate-50"
          >
            <span>{alert.label}</span>
            <span className="rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white">
              {alert.value}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function MiniMetricsCard({ totalMetrics }) {
  const cards = [
    { label: "Impressões", value: totalMetrics.impressions.toLocaleString("pt-BR") },
    { label: "Cliques", value: totalMetrics.clicks.toLocaleString("pt-BR") },
    { label: "Investimento", value: `R$ ${totalMetrics.spend.toFixed(2)}` },
  ];

  return (
    <Card className="shadow-sm border border-slate-100 bg-white/90 backdrop-blur lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-600">Mini dashboard de métricas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm"
            >
              <p className="text-xs uppercase tracking-wide text-slate-400">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Dados consolidados das plataformas conectadas.
        </p>
      </CardContent>
    </Card>
  );
}

function RecentPostsCard({ posts, approvalsByPostId, onApprove, onRequestChanges, onReject }) {
  const [adjustmentState, setAdjustmentState] = useState({ postId: null, notes: "", loading: false });

  const startAdjustment = (postId) =>
    setAdjustmentState({
      postId,
      notes: "",
      loading: false,
    });
  const cancelAdjustment = () => setAdjustmentState({ postId: null, notes: "", loading: false });

  const handleSubmitAdjustment = async (postId, approvalId) => {
    if (!postId || !adjustmentState.notes.trim()) return;
    setAdjustmentState((prev) => ({ ...prev, loading: true }));
    try {
      await onRequestChanges(postId, approvalId, adjustmentState.notes);
      cancelAdjustment();
    } catch (error) {
      console.error("requestChanges failed:", error);
      if (typeof window !== "undefined") {
        window.alert(error?.message || "Não foi possível enviar o ajuste.");
      }
    } finally {
      setAdjustmentState((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <Card className="shadow-sm border border-slate-100 bg-white/90 backdrop-blur">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl text-slate-900">Últimos posts</CardTitle>
            <p className="text-sm text-slate-500">
              Atalhos rápidos para revisar e aprovar conteúdo.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {posts.length === 0 ? (
          <EmptyState message="Ainda nao ha posts para revisar. Assim que sua agencia enviar, eles aparecem aqui." />
        ) : (
          posts.map((post) => {
            const approval = approvalsByPostId.get(post.id);
            const mediaUrl = resolveMediaUrl(post.media_url || post.mediaUrl || "");
            const isVideo = isVideoMedia({
              url: mediaUrl,
              mediaType: post.mediaType || post.media_type,
              mimeType: post.mimeType || post.mime_type,
            });
            const platform = post.platform || post.channel || post.socialNetwork || "Social";
            return (
              <article
                key={post.id}
                className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-white/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-4">
                  {mediaUrl ? (
                    isVideo ? (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                        <Video className="h-6 w-6" />
                      </div>
                    ) : (
                      <img
                        src={mediaUrl}
                        alt={post.title || "Prévia do post"}
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                    )
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                      {platform.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {post.title || post.caption || "Post sem título"}
                    </p>
                    <p className="text-xs uppercase tracking-wide text-slate-400">{platform}</p>
                    <p className="text-xs text-slate-500">
                      Status atual: <span className="font-medium text-slate-800">{post.status}</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
                    onClick={() => mediaUrl && window.open(mediaUrl, "_blank")}
                  >
                    Ver mídia
                  </button>
                  <Button
                    size="sm"
                    disabled={!approval}
                    onClick={() => approval && onApprove(approval.id)}
                  >
                    Aprovar
                  </Button>
                  {approval && adjustmentState.postId !== post.id && (
                    <Button type="button" onClick={() => startAdjustment(post.id)}>
                      Solicitar ajuste
                    </Button>
                  )}
                  <Button
                    type="button"
                    disabled={!approval}
                    onClick={() => approval && onReject(approval.id)}
                  >
                    Recusar
                  </Button>
                </div>
                {approval && adjustmentState.postId === post.id && (
                  <div className="mt-4 w-full rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <textarea
                      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                      rows={3}
                      placeholder="Descreva o ajuste desejado"
                      value={adjustmentState.notes}
                      onChange={(e) =>
                        setAdjustmentState((prev) => ({
                          ...prev,
                          notes: e.target.value,
                        }))
                      }
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={!adjustmentState.notes.trim() || adjustmentState.loading}
                        onClick={() => handleSubmitAdjustment(post.id, approval.id)}
                      >
                        Enviar ajuste
                      </Button>
                      <button
                        type="button"
                        disabled={adjustmentState.loading}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                        onClick={cancelAdjustment}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function ClientKanbanBoard({ columns, grouped, approvalsByPostId, onApprove, onReject, onRequestChanges, onPreview }) {
  const empty = Object.values(grouped).every((list) => list.length === 0);

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-4 min-w-full">
        {columns.map((column) => (
          <KanbanColumn
            key={column.key}
            title={column.title}
            posts={grouped[column.key] || []}
            approvalsByPostId={approvalsByPostId}
            onApprove={onApprove}
            onReject={onReject}
            onRequestChanges={onRequestChanges}
            onPreview={onPreview}
          />
        ))}
      </div>
      {empty && (
        <div className="mt-6">
          <EmptyState message="Este pipeline esta vazio. Aguarde novos conteudos ou atualize para conferir." />
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ title, posts, approvalsByPostId, onApprove, onRequestChanges, onReject, onPreview }) {
  return (
    <div className="min-w-[260px] flex-1 rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <span className="text-xs text-slate-400">{posts.length}</span>
      </div>
      <div className="space-y-3">
        {posts.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">
            <p>Nenhum post nesta etapa ainda.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              Atualizar lista
            </button>
          </div>
        ) : (
          posts.map((post) => (
            <KanbanCard
              key={post.id}
              post={post}
              approval={approvalsByPostId.get(post.id)}
              onApprove={onApprove}
              onRequestChanges={onRequestChanges}
              onReject={onReject}
              onPreview={onPreview}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({ post, approval, onApprove, onRequestChanges, onReject, onPreview }) {
  const mediaUrl = resolveMediaUrl(post.media_url || post.mediaUrl || "");
  const isVideo = isVideoMedia({
    url: mediaUrl,
    mediaType: post.mediaType || post.media_type,
    mimeType: post.mimeType || post.mime_type,
  });
  const platform = post.platform || post.channel || post.socialNetwork || "Social";
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closeAdjustment = () => {
    setIsAdjusting(false);
    setNotes("");
  };

  const submitAdjustment = async () => {
    if (!post.id || !notes.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onRequestChanges(post.id, approval?.id || null, notes);
      closeAdjustment();
    } catch (error) {
      console.error("submitAdjustment failed:", error);
      if (typeof window !== "undefined") {
        window.alert(error?.message || "Não foi possível enviar o ajuste.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onPreview(post)}
      >
        <div className="flex items-center gap-3">
          {mediaUrl ? (
            isVideo ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <Video className="h-5 w-5" />
              </div>
            ) : (
              <img
                src={mediaUrl}
                alt={post.title || "Prévia"}
                className="h-12 w-12 rounded-lg object-cover"
              />
            )
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
              {platform.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {post.title || post.caption || "Post sem título"}
            </p>
            <p className="text-xs uppercase tracking-wide text-slate-400">{platform}</p>
          </div>
        </div>
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="xs"
          disabled={!approval}
          onClick={() => approval && onApprove(approval.id)}
        >
          <ThumbsUp className="mr-1 h-3 w-3" /> Aprovar
        </Button>
        {approval && !isAdjusting && (
          <Button size="xs" type="button" onClick={() => setIsAdjusting(true)}>
            <MessageCircle className="mr-1 h-3 w-3" /> Solicitar ajuste
          </Button>
        )}
        <Button
          size="xs"
          type="button"
          disabled={!approval}
          onClick={() => approval && onReject(approval.id)}
        >
          <XCircle className="mr-1 h-3 w-3" /> Recusar
        </Button>
      </div>
      {approval && isAdjusting && (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <textarea
            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-700 outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
            rows={3}
            placeholder="Descreva o ajuste desejado"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="xs"
              type="button"
              disabled={!notes.trim() || isSubmitting}
              onClick={submitAdjustment}
            >
              Enviar ajuste
            </Button>
            <button
              type="button"
              disabled={isSubmitting}
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              onClick={closeAdjustment}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function PostPreviewModal({ post, approval, onClose, onApprove, onReject, onRequestChanges }) {
  if (!post) return null;
  const mediaUrl = resolveMediaUrl(post.media_url || post.mediaUrl || "");
  const isVideo = isVideoMedia({
    url: mediaUrl,
    mediaType: post.mediaType || post.media_type,
    mimeType: post.mimeType || post.mime_type,
  });
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closeAdjustment = () => {
    setIsAdjusting(false);
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!post.id || !notes.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onRequestChanges(post.id, approval?.id || null, notes);
      closeAdjustment();
      onClose();
    } catch (error) {
      console.error("handleSubmit failed:", error);
      if (typeof window !== "undefined") {
        window.alert(error?.message || "Não foi possível enviar o ajuste.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-lg font-semibold text-slate-900">
              {post.title || post.caption || "Prévia do post"}
            </p>
            <p className="text-sm text-slate-500">Status atual: {post.status}</p>
          </div>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-900"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
        <div className="grid gap-6 px-6 py-6 md:grid-cols-2">
          <div>
            {mediaUrl ? (
              isVideo ? (
                <video
                  src={mediaUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-xl bg-black"
                />
              ) : (
                <img
                  src={mediaUrl}
                  alt="Prévia"
                  className="w-full rounded-xl object-cover"
                />
              )
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-400">
                Midia ainda nao enviada. Use "Solicitar ajustes" se precisar do arquivo.
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Legenda / Descrição</p>
              <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                {post.caption || post.content || "Sem descrição."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!approval}
                onClick={() => {
                  approval && onApprove(approval.id);
                  onClose();
                }}
              >
                Aprovar
              </Button>
              {approval && !isAdjusting && (
                <Button type="button" onClick={() => setIsAdjusting(true)}>
                  Solicitar ajuste
                </Button>
              )}
              <Button
                type="button"
                disabled={!approval}
                onClick={() => {
                  approval && onReject(approval.id);
                  onClose();
                }}
              >
                Recusar
              </Button>
            </div>
            {approval && isAdjusting && (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <textarea
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                  rows={3}
                  placeholder="Descreva o ajuste desejado"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={!notes.trim() || isSubmitting}
                    onClick={handleSubmit}
                  >
                    Enviar ajuste
                  </Button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                    onClick={closeAdjustment}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformTabs({ metrics }) {
  const tabs = [
    { key: "instagram", label: "Instagram" },
    { key: "facebook", label: "Facebook" },
    { key: "google", label: "Google" },
    { key: "tiktok", label: "TikTok" },
  ];

  const getStatsForPlatform = useCallback(
    (platformKey) => {
      const normalized = platformKey.toLowerCase();
      const filtered = (metrics || []).filter((metric) => {
        const source =
          metric.platform ||
          metric.source ||
          metric.channel ||
          metric.campaignName ||
          "";
        return source.toLowerCase().includes(normalized);
      });
      if (filtered.length === 0) return null;

      return filtered.reduce(
        (acc, metric) => {
          const name = (metric.name || "").toLowerCase();
          const value = typeof metric.value === "number" ? metric.value : 0;
          if (name.includes("impression")) acc.impressions += value;
          else if (name.includes("reach")) acc.reach += value;
          else if (name.includes("click")) acc.clicks += value;
          else if (name.includes("conversion")) acc.conversions += value;
          else if (name.includes("spend") || name.includes("cost")) acc.spend += value;
          else if (name.includes("engagement")) acc.engagement += value;
          return acc;
        },
        { impressions: 0, reach: 0, clicks: 0, conversions: 0, spend: 0, engagement: 0 },
      );
    },
    [metrics],
  );

  return (
    <Tabs defaultValue="instagram" className="space-y-4">
      <TabsList className="bg-slate-100/80">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => {
        const stats = getStatsForPlatform(tab.key);
        return (
          <TabsContent key={tab.key} value={tab.key}>
            {stats ? (
              <MetricsDashboard stats={stats} />
            ) : (
              <EmptyState message="Este canal ainda nao retornou metricas. Aguarde a proxima coleta." />
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function MetricsDashboard({ stats }) {
  const cards = [
    { label: "Impressões", value: stats.impressions.toLocaleString("pt-BR") },
    { label: "Alcance", value: stats.reach.toLocaleString("pt-BR") },
    { label: "Engajamento", value: stats.engagement.toLocaleString("pt-BR") },
    { label: "Cliques", value: stats.clicks.toLocaleString("pt-BR") },
    { label: "Conversões", value: stats.conversions.toLocaleString("pt-BR") },
    { label: "Investimento", value: `R$ ${stats.spend.toFixed(2)}` },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm"
        >
          <p className="text-xs uppercase tracking-wide text-slate-400">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function MetricsSummary({ totalMetrics }) {
  const summaryCards = [
    { label: "Impressões acumuladas", value: totalMetrics.impressions.toLocaleString("pt-BR") },
    { label: "Cliques acumulados", value: totalMetrics.clicks.toLocaleString("pt-BR") },
    { label: "Investimento total", value: `R$ ${totalMetrics.spend.toFixed(2)}` },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {summaryCards.map((card) => (
        <Card key={card.label} className="border border-slate-100 shadow-sm bg-white/90">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ message, actionLabel = "Atualizar painel", onAction }) {
  const handleAction = onAction || (() => window.location.reload());
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-10 text-center text-sm text-slate-400">
      <BarChart3 className="mb-3 h-8 w-8 text-slate-300" />
      <p>{message}</p>
      <button
        type="button"
        onClick={handleAction}
        className="mt-3 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function PortalToast({ toast }) {
  if (!toast || !toast.message) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex transition duration-200">
      <div className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-emerald-900/20">
        {toast.message}
      </div>
    </div>
  );
}
