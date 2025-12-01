// ARQUIVO: front/src/layout.jsx

import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";

// Rotas principais do app
const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/clients", label: "Clientes" },
  { to: "/posts", label: "posts" },
  { to: "/tasks", label: "Tarefas" },
  { to: "/biblioteca", label: "Biblioteca" },
  { to: "/financeiro", label: "Financeiro" },
  { to: "/team", label: "Equipe" },
  { to: "/metrics", label: "Métricas" },
  { to: "/integrations", label: "Integrações" },
  { to: "/settings", label: "Configurações" },
];

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-200">
          <div className="h-8 w-8 rounded-xl bg-purple-500 flex items-center justify-center text-white font-bold">
            K
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-sm">KONDOR</span>
            <span className="text-xs text-gray-500">STUDIO</span>
          </div>
        </div>

        {/* Menu */}
        <div className="flex-1 overflow-auto px-2 py-4">
          <p className="text-xs font-semibold text-gray-500 px-2 mb-2">
            Principal
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "block px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-purple-100 text-purple-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
          Usuário
        </div>
      </aside>

      {/* TOPO MOBILE */}
      <header className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-purple-500 flex items-center justify-center text-white font-bold">
            K
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-sm">KONDOR</span>
            <span className="text-xs text-gray-500">STUDIO</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* MENU MOBILE DROPDOWN */}
      {mobileOpen && (
        <nav className="md:hidden bg-white border-b border-gray-200 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-gray-500 px-1 mb-2">
            Principal
          </p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeMobile}
              className={({ isActive }) =>
                [
                  "block px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-purple-100 text-purple-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}

      {/* CONTEÚDO */}
      <main className="flex-1 overflow-auto p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
