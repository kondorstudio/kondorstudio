import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown, DollarSign, MousePointerClick, Eye, Target } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Metrics() {
  const [selectedClient, setSelectedClient] = useState("all");
  const [selectedPlatform, setSelectedPlatform] = useState("all");

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list()
  });

  const { data: metrics = [] } = useQuery({
    queryKey: ['metrics', selectedClient, selectedPlatform],
    queryFn: () => {
      let query = {};
      if (selectedClient !== 'all') query.client_id = selectedClient;
      if (selectedPlatform !== 'all') query.platform = selectedPlatform;
      return base44.entities.Metric.filter(query, '-date', 30);
    }
  });

  // Calcular totais
  const totals = metrics.reduce((acc, m) => ({
    impressions: acc.impressions + (m.impressions || 0),
    clicks: acc.clicks + (m.clicks || 0),
    conversions: acc.conversions + (m.conversions || 0),
    spend: acc.spend + (m.spend || 0),
    revenue: acc.revenue + (m.revenue || 0)
  }), { impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0 });

  const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions * 100).toFixed(2) : 0;
  const avgCpc = totals.clicks > 0 ? (totals.spend / totals.clicks).toFixed(2) : 0;
  const roas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(2) : 0;

  // Dados para gráfico
  const chartData = metrics.slice(0, 14).reverse().map(m => ({
    date: new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    impressions: m.impressions || 0,
    clicks: m.clicks || 0,
    conversions: m.conversions || 0,
    spend: m.spend || 0
  }));

  const stats = [
    {
      title: "Total Gasto",
      value: `R$ ${totals.spend.toFixed(2)}`,
      icon: DollarSign,
      color: "from-purple-400 to-purple-500",
      trend: "+12%"
    },
    {
      title: "Impressões",
      value: totals.impressions.toLocaleString(),
      icon: Eye,
      color: "from-blue-400 to-blue-500"
    },
    {
      title: "Cliques",
      value: totals.clicks.toLocaleString(),
      icon: MousePointerClick,
      color: "from-green-400 to-green-500"
    },
    {
      title: "Conversões",
      value: totals.conversions.toLocaleString(),
      icon: Target,
      color: "from-orange-400 to-orange-500"
    }
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Métricas</h1>
          <p className="text-gray-600">Acompanhe o desempenho das campanhas</p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-4 mb-8">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map(client => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Todas as plataformas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as plataformas</SelectItem>
              <SelectItem value="meta_ads">Meta Ads</SelectItem>
              <SelectItem value="google_ads">Google Ads</SelectItem>
              <SelectItem value="tiktok_ads">TikTok Ads</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="pb-3">
                  <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center mb-3`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-sm text-gray-600 font-medium">
                    {stat.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                  {stat.trend && (
                    <div className="flex items-center gap-1 mt-2">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-500 font-medium">{stat.trend}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* KPIs */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader>
              <CardTitle className="text-purple-900">CTR Médio</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-purple-900">{avgCtr}%</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader>
              <CardTitle className="text-blue-900">CPC Médio</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-blue-900">R$ {avgCpc}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader>
              <CardTitle className="text-green-900">ROAS</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-green-900">{roas}x</p>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        {metrics.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Impressões e Cliques</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="impressions" stroke="#A78BFA" strokeWidth={2} />
                    <Line type="monotone" dataKey="clicks" stroke="#39FF14" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Investimento e Conversões</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="spend" fill="#A78BFA" />
                    <Bar dataKey="conversions" fill="#39FF14" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="py-16 text-center">
              <TrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Nenhuma métrica ainda
              </h3>
              <p className="text-gray-600">
                As métricas aparecerão aqui quando as integrações estiverem ativas
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}