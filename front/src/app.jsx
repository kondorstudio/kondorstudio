// front/src/app.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Layout from "./layout.jsx";
import PrivateRoute from "./components/privateRoute.jsx";

import Dashboard from "./pages/dashboard.jsx";
import Clients from "./pages/clients.jsx";
import Posts from "./pages/posts.jsx";
import Tasks from "./pages/tasks.jsx";
import Finance from "./pages/finance.jsx";
import Library from "./pages/library.jsx";
import Team from "./pages/team.jsx";

import Login from "./pages/login.jsx";
import Onboarding from "./pages/onboarding.jsx";

import ClientLogin from "./pages/clientlogin.jsx";
import ClientPortal from "./pages/clientportal.jsx";

import Pricing from "./pages/pricing.jsx";

export default function App() {
  return (
    <Routes>
      {/* Rotas públicas */}
      <Route path="/login" element={<Login />} />
      <Route path="/pricing" element={<Pricing />} />

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
          <Route path="/finance" element={<Finance />} />
          <Route path="/library" element={<Library />} />
          <Route path="/team" element={<Team />} />
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
  );
}
