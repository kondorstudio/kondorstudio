import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./Layout.jsx";

function Page({ title, description }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {description && (
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
          {description}
        </p>
      )}
    </div>
  );
}

function DashboardPage() {
  return (
    <Page
      title="Dashboard"
      description="Visão geral do desempenho dos clientes, posts e métricas do KONDOR STUDIO."
    />
  );
}

function ClientesPage() {
  return (
    <Page
      title="Clientes"
      description="Gerencie os clientes, contratos e status dos projetos da sua agência."
    />
  );
}

function PostsPage() {
  return (
    <Page
      title="Posts"
      description="Planeje, organize e acompanhe os conteúdos aprovados e agendados."
    />
  );
}

function TarefasPage() {
  return (
    <Page
      title="Tarefas"
      description="Acompanhe as tarefas da equipe relacionadas aos clientes e campanhas."
    />
  );
}

function BibliotecaPage() {
  return (
    <Page
      title="Biblioteca"
      description="Guarde criativos, referências e materiais de apoio em um único lugar."
    />
  );
}

function FinanceiroPage() {
  return (
    <Page
      title="Financeiro"
      description="Controle planos, cobranças, faturas e pagamentos dos seus clientes."
    />
  );
}

function EquipePage() {
  return (
    <Page
      title="Equipe"
      description="Gerencie usuários, permissões e times que atuam dentro do KONDOR STUDIO."
    />
  );
}

function MetricasPage() {
  return (
    <Page
      title="Métricas"
      description="Conecte contas de anúncios e visualize os principais indicadores."
    />
  );
}

function IntegracoesPage() {
  return (
    <Page
      title="Integrações"
      description="Configure integrações com Meta, Google, WhatsApp e outras plataformas."
    />
  );
}

function ConfiguracoesPage() {
  return (
    <Page
      title="Configurações"
      description="Ajuste preferências da conta, tenant, branding e opções avançadas."
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        {/* rota padrão = dashboard */}
        <Route index element={<DashboardPage />} />

        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="tarefas" element={<TarefasPage />} />
        <Route path="biblioteca" element={<BibliotecaPage />} />
        <Route path="financeiro" element={<FinanceiroPage />} />
        <Route path="equipe" element={<EquipePage />} />
        <Route path="metricas" element={<MetricasPage />} />
        <Route path="integracoes" element={<IntegracoesPage />} />
        <Route path="configuracoes" element={<ConfiguracoesPage />} />

        {/* qualquer rota desconhecida volta pro dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
