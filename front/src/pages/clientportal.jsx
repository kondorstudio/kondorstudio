import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { CheckCircle } from "lucide-react";

import Postapprovalcard from "../components/portal/postapprovalcard.jsx";
import { base44 } from "@/apiClient/base44Client";
import logoHeader from "@/assets/logoheader.png";

async function fetchClient(path, token, options = {}) {
  const res = await base44.rawFetch(path, {
    method: options.method || "GET",
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

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
    throw new Error(msg);
  }

  return data;
}

export default function ClientPortal() {
  const navigate = useNavigate();
  const [clientToken, setClientToken] = useState(null);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const raw =
      (typeof window !== "undefined" &&
        (window.localStorage.getItem("kondor_client_auth") ||
          window.localStorage.getItem("kondor_client_token"))) ||
      null;

    if (!raw) return navigate("/clientlogin");

    let token = null;
    try {
      if (raw.trim().startsWith("{")) {
        const parsed = JSON.parse(raw);
        token =
          parsed.accessToken ||
          parsed.token ||
          parsed.clientToken ||
          parsed.jwt ||
          null;
      } else {
        token = raw;
      }
    } catch (err) {
      console.error("Erro ao ler token do cliente:", err);
      return navigate("/clientlogin");
    }

    if (!token) return navigate("/clientlogin");
    setClientToken(token);
  }, [navigate]);

  const queriesEnabled = !!clientToken;

  const {
    data: meData,
    isLoading: loadingMe,
    error: meError,
  } = useQuery({
    queryKey: ["client-portal", "me"],
    enabled: queriesEnabled,
    queryFn: () => fetchClient("/client-portal/me", clientToken),
  });

  useEffect(() => {
    if (meError) {
      setAuthError(meError.message || "Erro ao carregar dados do cliente");
    }
  }, [meError]);

  const client = meData?.client || null;

  const primaryColor =
    client?.metadata?.primary_color ||
    client?.metadata?.agency_primary_color ||
    "#A78BFA";
  const accentColor =
    client?.metadata?.accent_color ||
    client?.metadata?.agency_accent_color ||
    "#39FF14";

  useEffect(() => {
    if (client) {
      document.documentElement.style.setProperty(
        "--primary",
        primaryColor || "#A78BFA"
      );
      document.documentElement.style.setProperty(
        "--accent",
        accentColor || "#39FF14"
      );
    }
  }, [client, primaryColor, accentColor]);

  const {
    data: postsData,
    isLoading: loadingPosts,
    error: postsError,
  } = useQuery({
    queryKey: ["client-portal", "posts"],
    enabled: queriesEnabled,
    queryFn: () => fetchClient("/client-portal/posts", clientToken),
  });

  const posts = postsData?.items || [];

  const {
    data: metricsData,
    isLoading: loadingMetrics,
    error: metricsError,
  } = useQuery({
    queryKey: ["client-portal", "metrics"],
    enabled: queriesEnabled,
    queryFn: () => fetchClient("/client-portal/metrics", clientToken),
  });

  const metrics = metricsData?.items || [];

  const {
    data: approvalsData,
    isLoading: loadingApprovals,
  } = useQuery({
    queryKey: ["client-portal", "approvals", "PENDING"],
    enabled: queriesEnabled,
    queryFn: () =>
      fetchClient("/client-portal/approvals?status=PENDING", clientToken),
  });

  const approvals = approvalsData?.items || [];

  const approvalsByPostId = useMemo(() => {
    const map = new Map();
    approvals.forEach((approval) => {
      const postId = approval.postId || approval.post?.id;
      if (!postId) return;
      const existing = map.get(postId);
      if (!existing) return map.set(postId, approval);

      const d1 = existing.createdAt ? new Date(existing.createdAt) : null;
      const d2 = approval.createdAt ? new Date(approval.createdAt) : null;
      if (!d1 || (d2 && d2 > d1)) map.set(postId, approval);
    });
    return map;
  }, [approvals]);

  const pendingPosts = posts.filter((p) => approvalsByPostId.has(p.id));
  const approvedPosts = posts.filter((p) =>
    ["APPROVED", "SCHEDULED", "PUBLISHED"].includes(p.status)
  );

  const totalMetrics = metrics.reduce(
    (acc, m) => {
      const name = (m.name || "").toLowerCase();
      const val = typeof m.value === "number" ? m.value : 0;

      if (name.includes("impression")) acc.impressions += val;
      if (name.includes("click")) acc.clicks += val;
      if (name.includes("spend") || name.includes("cost")) acc.spend += val;
      return acc;
    },
    { impressions: 0, clicks: 0, spend: 0 }
  );

  const isLoadingAny =
    loadingMe || loadingPosts || loadingMetrics || loadingApprovals;

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md bg-white shadow rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Erro de autenticação
          </h2>
          <p className="text-sm text-gray-600 mb-4">{authError}</p>
          <Button onClick={() => navigate("/clientlogin")}>
            Voltar para login
          </Button>
        </div>
      </div>
    );
  }

  if (isLoadingAny && !client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md bg-white shadow rounded-lg p-6 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Carregando portal...
          </h2>
          <p className="text-sm text-gray-600">
            Buscando suas informações e posts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <img
                src={logoHeader}
                alt="Kondor Studio"
                className="h-16 w-auto"
              />
              <div className="flex items-center gap-3">
                {client?.metadata?.agency_logo ? (
                  <img
                    src={client.metadata.agency_logo}
                    alt={client.metadata.agency_name || "Agência"}
                    className="w-12 h-12 rounded-xl object-cover border"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center font-semibold text-white"
                    style={{ background: primaryColor }}
                  >
                    {(client?.metadata?.agency_name || "KS")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase text-gray-500">
                    Portal do cliente
                  </p>
                  <h1 className="text-lg font-semibold text-gray-900">
                    {client?.metadata?.agency_name || "Kondor Studio"}
                  </h1>
                  {client?.name && (
                    <p className="text-xs text-gray-500">Conta: {client.name}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.localStorage.removeItem("kondor_client_auth");
                window.localStorage.removeItem("kondor_client_token");
              }
              navigate("/clientlogin");
            }}
          >
            Sair
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Posts pendentes
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-3xl font-bold text-gray-900">
                {pendingPosts.length}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Posts aprovados
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-3xl font-bold text-gray-900">
                {approvedPosts.length}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Métricas recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-sm text-gray-700 space-y-1">
                <p>Impressões: {totalMetrics.impressions}</p>
                <p>Cliques: {totalMetrics.clicks}</p>
                <p>Investimento: R$ {totalMetrics.spend.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Aprovações pendentes
            </h2>
            <span className="text-sm text-gray-500">
              {pendingPosts.length} posts aguardando sua revisão
            </span>
          </div>
          {pendingPosts.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Tudo aprovado!
                </h3>
                <p className="text-gray-600">
                  Não há posts aguardando sua aprovação no momento.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingPosts.map((post) => {
                const approval = approvalsByPostId.get(post.id) || null;
                return (
                  <Postapprovalcard
                    key={post.id}
                    post={post}
                    approval={approval}
                    primaryColor={primaryColor}
                    accentColor={accentColor}
                    token={clientToken}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Conteúdos aprovados
            </h2>
            <span className="text-sm text-gray-500">
              Histórico recente de posts liberados
            </span>
          </div>
          <Card>
            <CardContent>
              {approvedPosts.length === 0 ? (
                <p className="text-sm text-gray-600">
                  Assim que posts forem aprovados eles aparecerão aqui.
                </p>
              ) : (
                <div className="space-y-3">
                  {approvedPosts.map((post) => (
                    <div
                      key={post.id}
                      className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {post.title || post.caption || "Post sem título"}
                        </p>
                        <p className="text-xs text-gray-500">
                          Status:{" "}
                          <span className="font-semibold">
                            {post.status}
                          </span>
                        </p>
                      </div>
                      {post.mediaUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(post.mediaUrl, "_blank")}
                        >
                          Ver mídia
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Métricas por plataforma
            </h2>
            <span className="text-sm text-gray-500">
              Atualizado em tempo quase real
            </span>
          </div>
          <MetricsPanel metrics={metrics} />
        </section>
      </main>
    </div>
  );
}

function MetricsPanel({ metrics }) {
  const grouped = useMemo(() => {
    const map = new Map();
    (metrics || []).forEach((metric) => {
      const key =
        metric.source ||
        metric.platform ||
        metric.campaignName ||
        "Campanhas";
      const bucket =
        map.get(key) || {
          impressions: 0,
          clicks: 0,
          conversions: 0,
          spend: 0,
        };

      const name = (metric.name || "").toLowerCase();
      const value = typeof metric.value === "number" ? metric.value : 0;

      if (name.includes("impression")) bucket.impressions += value;
      else if (name.includes("click")) bucket.clicks += value;
      else if (name.includes("conversion")) bucket.conversions += value;
      else if (name.includes("spend") || name.includes("cost")) bucket.spend += value;

      map.set(key, bucket);
    });
    return Array.from(map.entries()).map(([source, stats]) => ({
      source,
      ...stats,
    }));
  }, [metrics]);

  if (!metrics || metrics.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-gray-600">
          Nenhuma métrica disponível ainda para esse cliente.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {grouped.map((group) => (
        <Card key={group.source}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-800">
              {group.source}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-600">
            <p>
              Impressões:{" "}
              <span className="font-semibold text-gray-900">
                {group.impressions.toLocaleString("pt-BR")}
              </span>
            </p>
            <p>
              Cliques:{" "}
              <span className="font-semibold text-gray-900">
                {group.clicks.toLocaleString("pt-BR")}
              </span>
            </p>
            <p>
              Conversões:{" "}
              <span className="font-semibold text-gray-900">
                {group.conversions.toLocaleString("pt-BR")}
              </span>
            </p>
            <p>
              Investimento:{" "}
              <span className="font-semibold text-gray-900">
                R$ {group.spend.toFixed(2)}
              </span>
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
