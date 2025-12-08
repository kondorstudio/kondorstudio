import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.jsx";
import {
  ArrowRight,
  CheckCircle2,
  Menu,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import { modulesData } from "@/data/modules.js";

const navLinks = [
  { label: "Home", to: "/" },
  { label: "Módulos", to: "/modules" },
  { label: "Demo", to: "/demo" },
  { label: "Planos", to: "/pricing" },
];

const quickBenefits = [
  "Até 40% menos tempo coordenando entregas e aprovações",
  "Clientes, conteúdo e equipe organizados em um só lugar",
  "Alertas inteligentes evitam atrasos e retrabalho",
  "Economia de horas e orçamento com fluxos automatizados",
];

const functionalityBlocks = [
  {
    title: "Relatórios Inteligentes",
    description: "Analise KPIs de conteúdo, mídia paga e operação em tempo real.",
  },
  {
    title: "Gestão Integrada",
    description: "Centralize clientes, jobs, calendário editorial e financeiro em um só fluxo.",
  },
  {
    title: "Alertas Automatizados",
    description: "Antecipe atrasos, demandas e aprovações com monitoramento ativo.",
  },
  {
    title: "Integração com ERP/CRM",
    description: "Conecte mídia paga, CRM, faturamento e ferramentas criativas sem retrabalho.",
  },
];

const testimonials = [
  {
    quote:
      "Reduzimos 60% dos erros manuais em apenas três meses com a Kondor.",
    author: "Laura Mendes",
    role: "CFO • Luma Group",
  },
  {
    quote:
      "Os alertas automáticos salvaram nosso fechamento mensal diversas vezes.",
    author: "Eduardo Pinheiro",
    role: "Head de Operações • Vortex Digital",
  },
];

const capabilityCards = [
  {
    title: "Gestão de Clientes",
    description:
      "Briefings, contratos, contatos e acessos organizados em um só lugar.",
  },
  {
    title: "Calendário de posts",
    description:
      "Planeje e acompanhe campanhas em um kanban visual para todo o time.",
  },
  {
    title: "Aprovação por WhatsApp",
    description:
      "Clientes aprovam peças sem login, com auditoria e prazos definidos.",
  },
  {
    title: "Biblioteca de Criativos",
    description:
      "Tagueie imagens, vídeos e documentos para reutilizar assets em segundos.",
  },
  {
    title: "Métricas e Relatórios",
    description:
      "Dashboards em tempo real conectados às plataformas de mídia.",
  },
  {
    title: "Controle Financeiro",
    description:
      "Receitas e despesas por cliente com alertas de renovação e margem.",
  },
];

const differentiators = [
  {
    title: "Por que escolher a Kondor?",
    bullets: [
      "Onboarding rápido guiado pelo nosso time",
      "Automação de tarefas repetitivas e alertas proativos",
      "Visão única de clientes, jobs e finanças",
      "Suporte humano para te ajudar a evoluir",
    ],
  },
  {
    title: "Mais resultados",
    bullets: [
      "Automação inteligente",
      "Multi-equipe e multi-clientes",
      "Analytics avançado",
      "Segurança e governança",
    ],
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-semibold">
              K
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">KONDOR</p>
              <p className="text-[10px] text-purple-500 uppercase tracking-[0.4em]">
                Platform
              </p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-slate-600 hover:text-slate-900 transition"
              >
                {link.label}
              </Link>
            ))}
            <Button
              variant="ghost"
              className="text-sm text-slate-600 hover:text-slate-900"
              onClick={() => navigate("/login")}
            >
              Entrar
            </Button>
            <Button
              className="bg-gradient-to-r from-purple-500 to-purple-700 text-white text-sm"
              onClick={() => navigate("/register")}
            >
              Comece Agora
            </Button>
          </nav>

          <button
            className="md:hidden text-slate-700"
            onClick={() => setMobileMenu(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {mobileMenu && (
          <div className="md:hidden fixed inset-0 z-50 bg-black/50">
            <div className="ml-auto w-72 h-full bg-white shadow-xl p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between mb-4">
                <p className="font-semibold text-slate-800">Menu</p>
                <button onClick={() => setMobileMenu(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileMenu(false)}
                  className="text-slate-600 hover:text-slate-900"
                >
                  {link.label}
                </Link>
              ))}
              <Button
                variant="outline"
                onClick={() => navigate("/login")}
                className="w-full"
              >
                Entrar
              </Button>
              <Button
                onClick={() => navigate("/register")}
                className="bg-gradient-to-r from-purple-500 to-purple-700 w-full"
              >
                Comece Agora
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section
        id="hero"
        className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-purple-900 text-white"
      >
        <div className="absolute inset-0 opacity-20">
          <div className="w-[120%] h-[120%] bg-[radial-gradient(circle_at_top,_#9966ff,_transparent_60%)]" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-20 lg:py-28 grid gap-14 lg:grid-cols-2 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              Plataforma tudo-em-um para agências modernas
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-6">
              Organize e automatize o fluxo da sua agência com inteligência
            </h1>
            <p className="text-lg text-white/80 mb-8">
              Planejamento, criação, aprovações, relacionamento e finanças no
              mesmo lugar. Ganhe controle, reduza retrabalho e entregue mais
              valor em menos tempo.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                className="bg-white !text-slate-900 font-semibold hover:bg-white/90"
                onClick={() => navigate("/register")}
              >
                Ver Demonstração
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/60 text-white"
                onClick={() =>
                  document.getElementById("modules")?.scrollIntoView({
                    behavior: "smooth",
                  })
                }
              >
                Explorar Funcionalidades
              </Button>
            </div>
          </div>
          <div className="bg-white/5 rounded-3xl border border-white/10 p-6 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-white/70">
                  Operação
                </p>
                <h3 className="text-xl font-semibold">
                  Fluxo de trabalho em tempo real
                </h3>
              </div>
              <Shield className="w-6 h-6 text-white/60" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 text-slate-900">
              <div className="bg-white rounded-2xl p-4 text-slate-900">
                <p className="text-xs uppercase text-slate-500">
                  Projetos ativos
                </p>
                <p className="text-2xl font-bold text-slate-900">128</p>
                <p className="text-sm text-emerald-600 mt-1">
                  +22% concluídos antes do prazo
                </p>
              </div>
              <div className="bg-slate-900/70 rounded-2xl p-4">
                <p className="text-xs uppercase text-white/60">
                  Aprovações pendentes
                </p>
                <p className="text-2xl font-bold">12</p>
                <p className="text-sm text-white/70 mt-1">
                  8 posts e 4 peças de mídia
                </p>
              </div>
              <div className="bg-white rounded-2xl p-4 text-slate-900">
                <p className="text-xs uppercase text-slate-500">
                  Posts programados
                </p>
                <p className="text-2xl font-bold text-slate-900">86</p>
                <p className="text-sm text-slate-500 mt-1">
                  Atualizado às 10h15
                </p>
              </div>
              <div className="bg-slate-900/70 rounded-2xl p-4">
                <p className="text-xs uppercase text-white/60">Equipe online</p>
                <p className="text-2xl font-bold">18</p>
                <p className="text-sm text-emerald-400 mt-1">
                  Designers, redatores e mídia
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick benefits */}
      <section className="max-w-6xl mx-auto px-6 mt-0">
        <div className="grid md:grid-cols-4 gap-4">
          {quickBenefits.map((benefit) => (
            <div
              key={benefit}
              className="rounded-2xl bg-white border border-slate-100 p-5 text-sm font-semibold text-slate-700 shadow-sm"
            >
              {benefit}
            </div>
          ))}
        </div>
      </section>

      {/* Functionality highlights */}
      <section className="max-w-6xl mx-auto px-6 py-16 grid gap-6 md:grid-cols-2">
        {functionalityBlocks.map((block) => (
          <div
            key={block.title}
            className="rounded-3xl bg-white border border-slate-100 p-6 shadow-sm"
          >
            <h3 className="text-xl font-semibold mb-2">{block.title}</h3>
            <p className="text-sm text-slate-600">{block.description}</p>
            <Button
              variant="link"
              className="px-0 mt-3 text-purple-600"
              onClick={() =>
                document.getElementById("modules")?.scrollIntoView({
                  behavior: "smooth",
                })
              }
            >
              Ver detalhes no módulo →
            </Button>
          </div>
        ))}
      </section>

      {/* Testimonials */}
      <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-6">
        {testimonials.map((item) => (
          <div
            key={item.author}
            className="rounded-3xl bg-white border border-slate-100 p-6 shadow-sm"
          >
            <p className="text-lg text-slate-800 font-medium mb-4">
              “{item.quote}”
            </p>
            <p className="text-sm text-slate-500">
              {item.author} — {item.role}
            </p>
          </div>
        ))}
      </section>

      <section className="max-w-6xl mx-auto px-6 py-10 rounded-3xl bg-gradient-to-r from-purple-600 to-purple-700 text-white text-center">
        <p className="text-sm uppercase tracking-[0.4em] text-white/70 mb-3">
          Transforme sua operação
        </p>
        <h2 className="text-3xl font-bold mb-4">
          Veja como podemos transformar sua operação
        </h2>
        <Button
          size="lg"
          className="bg-white !text-purple-700 font-semibold hover:bg-white/90"
          onClick={() => navigate("/register")}
        >
          Assista à Demo Completa
        </Button>
      </section>

      {/* Modules detail */}
      <section id="modules" className="max-w-6xl mx-auto px-6 py-20 space-y-10">
        <div>
          <p className="text-sm text-purple-600 font-semibold">
            Módulos estratégicos
          </p>
          <h2 className="text-3xl font-bold mt-2">
            Tudo que a agência precisa em um ecossistema
          </h2>
          <p className="text-slate-600 mt-2 max-w-3xl">
            Conheça rapidamente alguns módulos e aprofunde os detalhes na página
            dedicada.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {modulesData.slice(0, 4).map((module) => (
            <div
              key={module.title}
              className="rounded-3xl bg-white border border-slate-100 p-6 shadow-sm"
            >
              <h3 className="text-2xl font-semibold">{module.title}</h3>
              <p className="text-sm text-slate-600 mt-2">{module.description}</p>
              <Button
                variant="link"
                className="px-0 text-purple-600 mt-4"
                onClick={() => navigate("/modules")}
              >
                Ver detalhes do módulo →
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities overview */}
      <section className="max-w-6xl mx-auto px-6 py-16 space-y-10">
        <div className="space-y-2 text-center">
          <p className="text-sm text-purple-600 font-semibold">
            Tudo o que você precisa em um só lugar
          </p>
          <h2 className="text-3xl font-bold">Funcionalidades que economizam tempo</h2>
          <p className="text-slate-600">
            Organize operações complexas de criação, mídia e relacionamento sem depender
            de planilhas ou dezenas de ferramentas.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {capabilityCards.map((card) => (
            <div
              key={card.title}
              className="rounded-3xl bg-white border border-slate-100 p-5 shadow-sm text-left"
            >
              <p className="font-semibold text-lg text-slate-900">
                {card.title}
              </p>
              <p className="text-sm text-slate-600 mt-2">{card.description}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {differentiators.map((column) => (
            <div
              key={column.title}
              className="rounded-3xl bg-gradient-to-br from-purple-600 to-purple-700 text-white p-6 space-y-3"
            >
              <h3 className="text-xl font-semibold">{column.title}</h3>
              <ul className="space-y-2 text-sm text-white/90">
                {column.bullets.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-white" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

*** End Patch

      <section className="bg-slate-900 text-white text-center py-16 px-6">
        <p className="text-sm uppercase tracking-[0.4em] text-white/60 mb-3">
          Pronto para avançar?
        </p>
        <h2 className="text-3xl font-bold mb-4">
          Ganhe controle total da operação em tempo real
        </h2>
        <div className="flex flex-wrap justify-center gap-4">
          <Button
            size="lg"
            onClick={() => navigate("/register")}
            className="bg-white !text-slate-900 font-semibold hover:bg-white/90"
          >
            Criar minha conta
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-white text-white"
            onClick={() => navigate("/login")}
          >
            Já sou cliente
          </Button>
        </div>
      </section>

      <footer className="bg-slate-950 text-slate-400">
        <div className="max-w-6xl mx-auto px-6 py-8 text-sm flex flex-col md:flex-row justify-between items-center gap-3">
          <span>© {new Date().getFullYear()} Kondor Platform</span>
          <div className="flex flex-wrap gap-4">
            <Link to="/login" className="hover:text-white transition">
              Entrar
            </Link>
            <Link to="/register" className="hover:text-white transition">
              Começar
            </Link>
            <Link to="/pricing" className="hover:text-white transition">
              Planos
            </Link>
            <Link to="/checkout" className="hover:text-white transition">
              Checkout
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
