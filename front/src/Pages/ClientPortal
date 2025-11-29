import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  CheckCircle,
  XCircle,
  BarChart3,
  FileDown,
  MessageSquare,
  Eye,
} from "lucide-react";
import PostApprovalCard from "../components/portal/PostApprovalCard";

export default function ClientPortal() {
  const [tenant, setTenant] = useState(null);
  const [client, setClient] = useState(null);

  useEffect(() => {
    loadBranding();
  }, []);

  const loadBranding = async () => {
    try {
      const tenants = await base44.entities.Tenant.list();
      if (tenants.length > 0) {
        setTenant(tenants[0]);
      }

      // Simulando cliente logado (primeiro cliente da lista)
      const clients = await base44.entities.Client.list();
      if (clients.length > 0) {
        setClient(clients[0]);
      }
    } catch (error) {
      console.error("Error loading branding:", error);
    }
  };

  // Posts do cliente
  const { data: posts = [] } = useQuery({
    queryKey: ["client-posts", client?.id],
    queryFn: () =>
      client
        ? base44.entities.Post.filter(
            { client_id: client.id },
            "-created_date"
          )
        : [],
    enabled: !!client,
  });

  // Métricas (mantido)
  const { data: metrics = [] } = useQuery({
    queryKey: ["client-metrics", client?.id],
    queryFn: () =>
      client
        ? base44.entities.Metric.filter(
            { client_id: client.id },
            "-date",
            7
          )
        : [],
    enabled: !!client,
  });

  // Relatórios (mantido)
  const { data: reports = [] } = useQuery({
    queryKey: ["client-reports", client?.id],
    queryFn: () =>
      client
        ? base44.entities.Report.filter(
            { client_id: client.id },
            "-created_date"
          )
        : [],
    enabled: !!client,
  });

  // 🔹 NOVO: approvals do tenant (usadas para vincular Approval ↔ Post)
  const { data: approvalsData = [] } = useQuery({
    queryKey: ["client-approvals", client?.id],
    queryFn: async () => {
      if (!client) return [];
      // Backend /approvals suporta ?status e paginação. Aqui trazemos PENDING para o portal.
      const res = await base44.entities.Approval.list({
        status: "PENDING",
      });
      // A rota /approvals retorna { items, total, ... }
      if (Array.isArray(res)) return res;
      return res?.items || [];
    },
    enabled: !!client,
  });

  // Mapeia approval "ativa" por postId (preferindo PENDING e/ou a mais recente)
  const approvalsByPostId = useMemo(() => {
    const byPost = new Map();
    (approvalsData || []).forEach((approval) => {
      if (!approval.postId) return;
      const existing = byPost.get(approval.postId);

      if (!existing) {
        byPost.set(approval.postId, approval);
        return;
      }

      // Preferir PENDING
      if (existing.status !== "PENDING" && approval.status === "PENDING") {
        byPost.set(approval.postId, approval);
        return;
      }

      const existingDate = existing.createdAt
        ? new Date(existing.createdAt).getTime()
        : 0;
      const newDate = approval.createdAt
        ? new Date(approval.createdAt).getTime()
        : 0;

      if (newDate > existingDate) {
        byPost.set(approval.postId, approval);
      }
    });
    return byPost;
  }, [approvalsData]);

  const pendingPosts = posts.filter(
    (p) => p.status === "pending_approval"
  );
  const approvedPosts = posts.filter(
    (p) =>
      p.status === "approved" ||
      p.status === "scheduled" ||
      p.status === "published"
  );

  // Calcular métricas totais
  const totalMetrics = metrics.reduce(
    (acc, m) => ({
      impressions: acc.impressions + (m.impressions || 0),
      clicks: acc.clicks + (m.clicks || 0),
      conversions: acc.conversions + (m.conversions || 0),
      spend: acc.spend + (m.spend || 0),
    }),
    { impressions: 0, clicks: 0, conversions: 0, spend: 0 }
  );

  const primaryColor = tenant?.primary_color || "#A78BFA";
  const accentColor = tenant?.accent_color || "#39FF14";

  return (
    <div className="min-h-screen bg-gray-50">
      <style>{`
        :root {
          --brand-primary: ${primaryColor};
          --brand-accent: ${accentColor};
        }
        .brand-bg {
          background-color: var(--brand-primary);
        }
        .brand-text {
          color: var(--brand-primary);
        }
        .brand-border {
          border-color: var(--brand-primary);
        }
      `}</style>

      {/* Header com branding customizado */}
      <header className="brand-bg text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {tenant?.logo_url ? (
                <img
                  src={tenant.logo_url}
                  alt={tenant.agency_name}
                  className="h-12 w-12 bg-white rounded-lg p-2"
                />
              ) : (
                <div className="h-12 w-12 bg-white rounded-lg flex items-center justify-center">
                  <span
                    className="text-2xl font-bold"
                    style={{ color: primaryColor }}
                  >
                    {tenant?.agency_name?.[0] || "A"}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold">
                  {tenant?.agency_name || "Sua Agência"}
                </h1>
                <p className="text-white/80 text-sm">Portal do Cliente</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold">{client?.name || "Cliente"}</p>
              <p className="text-white/80 text-sm">{client?.sector || ""}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats rápidos */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-t-4" style={{ borderTopColor: primaryColor }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600">
                Posts Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold brand-text">
                {pendingPosts.length}
              </p>
            </CardContent>
          </Card>

          <Card className="border-t-4" style={{ borderTopColor: primaryColor }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600">
                Impressões (7d)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold brand-text">
                {totalMetrics.impressions.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card className="border-t-4" style={{ borderTopColor: primaryColor }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600">
                Cliques (7d)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold brand-text">
                {totalMetrics.clicks.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card className="border-t-4" style={{ borderTopColor: primaryColor }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600">
                Relatórios
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold brand-text">
                {reports.length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="approval" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="approval">
              <FileText className="w-4 h-4 mr-2" />
              Aprovações
            </TabsTrigger>
            <TabsTrigger value="library">
              <Eye className="w-4 h-4 mr-2" />
              Biblioteca
            </TabsTrigger>
            <TabsTrigger value="reports">
              <FileDown className="w-4 h-4 mr-2" />
              Relatórios
            </TabsTrigger>
          </TabsList>

          {/* Aprovações */}
          <TabsContent value="approval" className="space-y-6">
            {pendingPosts.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Tudo aprovado!
                  </h3>
                  <p className="text-gray-600">
                    Não há posts aguardando sua aprovação no momento
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingPosts.map((post) => {
                  const approval = approvalsByPostId.get(post.id) || null;

                  return (
                    <PostApprovalCard
                      key={post.id}
                      post={post}
                      approval={approval}
                      primaryColor={primaryColor}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Biblioteca */}
          <TabsContent value="library">
            <Card>
              <CardHeader>
                <CardTitle>Posts Aprovados e Publicados</CardTitle>
              </CardHeader>
              <CardContent>
                {approvedPosts.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    Nenhum post na biblioteca ainda
                  </p>
                ) : (
                  <div className="grid md:grid-cols-3 gap-4">
                    {approvedPosts.map((post) => (
                      <Card key={post.id} className="overflow-hidden">
                        {post.media_url && (
                          <img
                            src={post.media_url}
                            alt={post.title}
                            className="w-full h-48 object-cover"
                          />
                        )}
                        <CardContent className="pt-4">
                          <h4 className="font-semibold mb-2">{post.title}</h4>
                          <Badge
                            className={
                              post.status === "published"
                                ? "bg-green-100 text-green-700"
                                : "bg-blue-100 text-blue-700"
                            }
                          >
                            {post.status === "published"
                              ? "Publicado"
                              : "Agendado"}
                          </Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Relatórios */}
          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>Relatórios de Performance</CardTitle>
              </CardHeader>
              <CardContent>
                {reports.length === 0 ? (
                  <div className="text-center py-16">
                    <FileDown className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">
                      Nenhum relatório disponível ainda
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reports.map((report) => (
                      <div
                        key={report.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                      >
                        <div>
                          <h4 className="font-semibold">{report.title}</h4>
                          <p className="text-sm text-gray-500">
                            {new Date(
                              report.period_start
                            ).toLocaleDateString()}{" "}
                            -{" "}
                            {new Date(
                              report.period_end
                            ).toLocaleDateString()}
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          <FileDown className="w-4 h-4 mr-2" />
                          Baixar PDF
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
