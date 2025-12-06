// front/src/app.jsx
import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Layout from "./layout.jsx";
import PrivateRoute from "./components/privateRoute.jsx";

const Dashboard = lazy(() => import("./pages/dashboard.jsx"));
const Clients = lazy(() => import("./pages/clients.jsx"));
const Posts = lazy(() => import("./pages/posts.jsx"));
const Tasks = lazy(() => import("./pages/tasks.jsx"));
const Financeiro = lazy(() => import("./pages/financeiro.jsx"));
const Team = lazy(() => import("./pages/team.jsx"));
const Biblioteca = lazy(() => import("./pages/biblioteca.jsx"));
const Metrics = lazy(() => import("./pages/metrics.jsx"));
const Integrations = lazy(() => import("./pages/integrations.jsx"));
const Settings = lazy(() => import("./pages/settings.jsx"));

const Login = lazy(() => import("./pages/login.jsx"));
const Register = lazy(() => import("./pages/register.jsx"));
const Onboarding = lazy(() => import("./pages/onboarding.jsx"));

const ClientLogin = lazy(() => import("./pages/clientlogin.jsx"));
const ClientPortal = lazy(() => import("./pages/clientportal.jsx"));

const Pricing = lazy(() => import("./pages/pricing.jsx"));

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-600">
          Carregando...
        </div>
      }
    >
      <Routes>
        {/* Rotas públicas */}
        <Route path="/login" element={<Login />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/register" element={<Register />} />

        {/* Login / portal do cliente (white-label) */}
        <Route path="/clientlogin" element={<ClientLogin />} />
        <Route path="/clientportal" element={<ClientPortal />} />

        {/* Área autenticada da agência */}
        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/posts" element={<Posts />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/team" element={<Team />} />
            <Route path="/biblioteca" element={<Biblioteca />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/onboarding" element={<Onboarding />} />
          </Route>
        </Route>

        {/* Fallback 404 simples */}
        <Route
          path="*"
          element={
            <div className="min-h-screen flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-2">
                  404 - Página não encontrada
                </h1>
                <p className="text-sm text-gray-600 mb-4">
                  Verifique a URL ou volte para o dashboard.
                </p>
                <a
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 rounded-md bg-purple-500 text-white text-sm font-medium hover:bg-purple-600"
                >
                  Ir para o dashboard
                </a>
              </div>
            </div>
          }
        />
      </Routes>
    </Suspense>
  );
}
