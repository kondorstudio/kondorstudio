// front/src/layout.jsx
import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { base44 } from "@/apiClient/base44Client";

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

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const toggleMobile = () => setMobileOpen((prev) => !prev);
  const closeMobile = () => setMobileOpen(false);
  const handleLogout = async () => {
    try {
      await base44.auth.logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-200">
          <div
            className="h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold"
            style={{ background: "var(--primary)" }}
          >
            K
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-sm" style={{ color: "var(--primary)" }}>
              KONDOR
            </span>
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
                      ? "font-medium"
                      : "text-gray-600 hover:bg-gray-100",
                  ].join(" ")
                }
                style={({ isActive }) =>
                  isActive
                    ? {
                        background: "var(--primary-light)",
                        color: "var(--primary)",
                      }
                    : {}
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Footer / usuário */}
        <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
          <span className="block mb-2 text-gray-500">Usuário</span>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* CONTAINER PRINCIPAL */}
      <div className="flex-1 flex flex-col">
        {/* TOPBAR MOBILE */}
        <header className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMobile}
              className="p-2 rounded-lg border border-gray-200 text-gray-700"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <div
                className="h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold"
                style={{ background: "var(--primary)" }}
              >
                K
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-semibold text-sm" style={{ color: "var(--primary)" }}>
                  KONDOR
                </span>
                <span className="text-xs text-gray-500">STUDIO</span>
              </div>
            </div>
          </div>
        </header>

        {/* MENU MOBILE */}
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
                      ? "font-medium"
                      : "text-gray-600 hover:bg-gray-100",
                  ].join(" ")
                }
                style={({ isActive }) =>
                  isActive
                    ? {
                        background: "var(--primary-light)",
                        color: "var(--primary)",
                      }
                    : {}
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  closeMobile();
                  handleLogout();
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition"
              >
                Sair
              </button>
            </div>
          </nav>
        )}

        {/* CONTEÚDO */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
