import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Zap, Sparkles, Crown, Users, BarChart3, Calendar, MessageSquare, Image as ImageIcon, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const plans = [
  {
    name: "Starter",
    price: 97,
    icon: Sparkles,
    description: "Para freelancers",
    features: [
      "Até 15 clientes",
      "1 usuário interno",
      "Aprovação de posts",
      "1 integração (Meta Ads)",
      "Relatórios básicos",
      "Biblioteca de posts",
      "Dashboard simples",
      "Tema visual do cliente"
    ],
    color: "from-purple-400 to-purple-500"
  },
  {
    name: "Pro",
    price: 147,
    icon: Zap,
    description: "Para social media profissional",
    features: [
      "Até 40 clientes",
      "3 usuários internos",
      "Todas as integrações",
      "Relatórios automáticos semanais",
      "Biblioteca completa",
      "Automações WhatsApp",
      "Kanban avançado",
      "Tarefas e pipeline",
      "Tema visual avançado"
    ],
    popular: true,
    color: "from-purple-500 to-purple-600"
  },
  {
    name: "Agency",
    price: 247,
    icon: Crown,
    description: "Agências profissionais",
    features: [
      "Até 100 clientes",
      "Equipe ilimitada",
      "Relatórios personalizados",
      "Dashboards avançados",
      "Automações completas",
      "Multi-equipe",
      "Subdomínio customizado",
      "Módulo financeiro",
      "Prioridade no suporte"
    ],
    color: "from-purple-600 to-purple-700"
  }
];

const features = [
  {
    icon: Users,
    title: "Gestão de Clientes",
    description: "Centralize todas as informações dos seus clientes em um único lugar. Briefings, contratos e histórico completo."
  },
  {
    icon: Calendar,
    title: "Calendário de Posts",
    description: "Kanban visual para planejar, criar e aprovar posts. Arraste e solte entre as etapas do processo."
  },
  {
    icon: MessageSquare,
    title: "Aprovação por WhatsApp",
    description: "Seus clientes aprovam posts direto pelo WhatsApp, sem precisar logar na plataforma."
  },
  {
    icon: ImageIcon,
    title: "Biblioteca de Criativos",
    description: "Organize todos os seus assets com tags inteligentes e filtros avançados para encontrar qualquer arquivo rapidamente."
  },
  {
    icon: BarChart3,
    title: "Métricas e Relatórios",
    description: "Acompanhe performance de campanhas com dashboards em tempo real e relatórios automáticos."
  },
  {
    icon: DollarSign,
    title: "Controle Financeiro",
    description: "Gerencie receitas e despesas por cliente. Visualize margem de lucro e saúde financeira da agência."
  }
];

const formatCurrency = (value, locale = 'pt-BR', currency = 'BRL') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

export default function Pricing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-purple-50 to-white">
      {/* Header */}
      <nav
        className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-50"
        role="navigation"
        aria-label="Navegação principal"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center" aria-hidden="true">
              <Zap className="w-6 h-6 text-white" fill="currentColor" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-gray-900">KONDOR</h1>
              <p className="text-xs text-purple-400 font-medium">STUDIO</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl("Dashboard"))}
            className="border-purple-400 text-purple-600 hover:bg-purple-50"
            aria-label="Fazer login na plataforma"
          >
            Entrar
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20 text-center" aria-labelledby="hero-title">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-100 to-purple-200 rounded-full mb-6">
          <Sparkles className="w-4 h-4 text-purple-600" aria-hidden="true" />
          <span className="text-sm font-medium text-purple-900">A plataforma que sua agência precisa</span>
        </div>

        <h2 id="hero-title" className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
          Gerencie sua agência
          <span className="block mt-2 bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
            com eficiência e elegância
          </span>
        </h2>

        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
          KONDOR STUDIO é a plataforma completa para agências e freelancers gerenciarem clientes, posts, aprovações, criativos e finanças em um único lugar.
        </p>

        <div className="flex gap-4 justify-center mb-16">
          <Button
            size="lg"
            onClick={() => navigate(createPageUrl("Dashboard"))}
            className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
            aria-label="Iniciar teste gratuito de 3 dias"
          >
            Começar teste grátis
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}
            aria-label="Ver planos e preços"
          >
            Ver planos
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto" role="list" aria-label="Estatísticas da plataforma">
          <div role="listitem">
            <p className="text-4xl font-bold text-purple-600 mb-2">3 dias</p>
            <p className="text-gray-600">Teste gratuito</p>
          </div>
          <div role="listitem">
            <p className="text-4xl font-bold text-purple-600 mb-2">100+</p>
            <p className="text-gray-600">Agências ativas</p>
          </div>
          <div role="listitem">
            <p className="text-4xl font-bold text-purple-600 mb-2">6</p>
            <p className="text-gray-600">Módulos integrados</p>
          </div>
          <div role="listitem">
            <p className="text-4xl font-bold text-purple-600 mb-2">24/7</p>
            <p className="text-gray-600">Suporte dedicado</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-6 py-20 bg-white/50" aria-labelledby="features-title">
        <div className="text-center mb-16">
          <h2 id="features-title" className="text-4xl font-bold text-gray-900 mb-4">
            Tudo que você precisa em um só lugar
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Funcionalidades desenvolvidas especialmente para o dia a dia de agências de social media
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8" role="list">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card key={index} className="border-2 border-gray-100 hover:border-purple-200 hover:shadow-lg transition-all" role="listitem">
                <CardContent className="pt-8">
                  <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-purple-200 rounded-2xl flex items-center justify-center mb-4" aria-hidden="true">
                    <Icon className="w-7 h-7 text-purple-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="max-w-7xl mx-auto px-6 py-20" aria-labelledby="benefits-title">
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-3xl p-12 text-white">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 id="benefits-title" className="text-4xl font-bold mb-6">
                Por que escolher o KONDOR STUDIO?
              </h2>
              <ul className="space-y-4" role="list">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center flex-shrink-0 mt-1" aria-hidden="true">
                    <Check className="w-4 h-4 text-gray-900" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Economia de tempo</h4>
                    <p className="text-purple-100">Reduza em até 70% o tempo gasto com gestão operacional</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center flex-shrink-0 mt-1" aria-hidden="true">
                    <Check className="w-4 h-4 text-gray-900" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Aprovações mais rápidas</h4>
                    <p className="text-purple-100">Clientes aprovam posts pelo WhatsApp em minutos</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center flex-shrink-0 mt-1" aria-hidden="true">
                    <Check className="w-4 h-4 text-gray-900" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Organização profissional</h4>
                    <p className="text-purple-100">Impressione seus clientes com portais personalizados</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center flex-shrink-0 mt-1" aria-hidden="true">
                    <Check className="w-4 h-4 text-gray-900" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Controle financeiro</h4>
                    <p className="text-purple-100">Saiba exatamente quanto cada cliente rende para sua agência</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8">
              <div className="space-y-6" role="list">
                <div className="flex items-center gap-4" role="listitem">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center" aria-hidden="true">
                    <Zap className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">Automação inteligente</p>
                    <p className="text-purple-100">IA para gerar legendas</p>
                  </div>
                </div>
                <div className="flex items-center gap-4" role="listitem">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center" aria-hidden="true">
                    <Users className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">Multi-equipe</p>
                    <p className="text-purple-100">Colaboração em tempo real</p>
                  </div>
                </div>
                <div className="flex items-center gap-4" role="listitem">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center" aria-hidden="true">
                    <BarChart3 className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">Analytics avançado</p>
                    <p className="text-purple-100">Dashboards personalizados</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Plans Section */}
      <section id="plans" className="max-w-7xl mx-auto px-6 pb-20" aria-labelledby="plans-title">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-100 to-purple-200 rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-purple-600" aria-hidden="true" />
            <span className="text-sm font-medium text-purple-900">3 dias grátis • Sem cartão</span>
          </div>

          <h2 id="plans-title" className="text-4xl font-bold text-gray-900 mb-4">
            Escolha o plano ideal para sua agência
          </h2>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Todos os planos incluem teste gratuito de 3 dias. Cancele quando quiser.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8" role="list" aria-label="Planos disponíveis">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <Card
                key={plan.name}
                className={`relative overflow-hidden ${plan.popular ? 'pricing-card-popular border-2 border-accent' : 'border-gray-200'}`}
                role="listitem"
                aria-label={`Plano ${plan.name} - ${formatCurrency(plan.price)} por mês`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-accent to-green-400 text-gray-900 px-4 py-1 text-xs font-bold rounded-bl-lg">
                    POPULAR
                  </div>
                )}

                <CardHeader className="pb-8 pt-8">
                  <div className={`w-16 h-16 bg-gradient-to-br ${plan.color} rounded-2xl flex items-center justify-center mb-4`} aria-hidden="true">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-3xl font-bold text-gray-900">
                    {plan.name}
                  </CardTitle>
                  <p className="text-gray-500">{plan.description}</p>
                  <div className="mt-6">
                    <span className="text-5xl font-bold text-gray-900">{formatCurrency(plan.price)}</span>
                    <span className="text-gray-500">/mês</span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <ul role="list" aria-label={`Recursos do plano ${plan.name}`}>
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3 mb-4">
                        <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5" aria-hidden="true">
                          <Check className="w-3 h-3 text-purple-600" />
                        </div>
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full mt-8 ${
                      plan.popular
                        ? 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700'
                        : 'bg-purple-400 hover:bg-purple-500'
                    }`}
                    size="lg"
                    onClick={() => navigate(createPageUrl("Dashboard"))}
                    aria-label={`Iniciar teste grátis do plano ${plan.name}`}
                  >
                    Começar teste grátis
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Trial Info */}
        <div className="mt-16 text-center">
          <div className="inline-block bg-gradient-to-r from-purple-100 to-purple-200 rounded-2xl px-8 py-6">
            <p className="text-purple-900 font-medium text-lg mb-2">
              ✨ Todos os planos incluem 3 dias de teste gratuito
            </p>
            <p className="text-purple-700">
              Teste TODAS as funcionalidades sem compromisso • Não precisa de cartão
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}