// front/src/layout.jsx
import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, X } from "lucide-react";
import { base44 } from "@/apiClient/base44Client";
import logoHeader from "@/assets/logoheader.png";

const navItems = [
  {
    to: "/dashboard",
    label: "Dashboard",
    prefetch: {
      key: ["dashboard-overview"],
      fn: () => base44.entities.Dashboard.overview(),
    },
  },
  {
    to: "/clients",
    label: "Clientes",
    prefetch: {
      key: ["clients"],
      fn: () => base44.entities.Clients?.list?.(),
    },
  },
  {
    to: "/posts",
    label: "posts",
    prefetch: {
      key: ["posts"],
      fn: () => base44.entities.Posts?.list?.(),
    },
  },
  {
    to: "/tasks",
    label: "Tarefas",
    prefetch: {
      key: ["tasks"],
      fn: () => base44.entities.Tasks?.list?.(),
    },
  },
  { to: "/biblioteca", label: "Biblioteca" },
  {
    to: "/financeiro",
    label: "Financeiro",
    prefetch: {
      key: ["finance"],
      fn: () => base44.entities.FinancialRecord?.list?.(),
    },
  },
  {
    to: "/team",
    label: "Equipe",
    prefetch: {
      key: ["team"],
      fn: () => base44.entities.TeamMember?.list?.(),
    },
  },
  {
    to: "/metrics",
    label: "Métricas",
    prefetch: {
      key: ["metrics-overview"],
      fn: () => base44.entities.Metrics?.overview?.(),
    },
  },
  { to: "/integrations", label: "Integrações" },
  { to: "/settings", label: "Configurações" },
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const toggleMobile = () => setMobileOpen((prev) => !prev);
  const closeMobile = () => setMobileOpen(false);
  const handleLogout = async () => {
    try {
      await base44.auth.logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };
  const handlePrefetch = useCallback(
    (prefetchConfig) => {
      if (!prefetchConfig || typeof prefetchConfig.fn !== "function") return;
      queryClient.prefetchQuery({
        queryKey: prefetchConfig.key,
        queryFn: prefetchConfig.fn,
        staleTime: 60 * 1000,
      });
    },
    [queryClient],
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-200">
          <img
            src={logoHeader}
            alt="Kondor Studio"
            className="h-10 w-auto"
          />
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
                onMouseEnter={() => handlePrefetch(item.prefetch)}
                onFocus={() => handlePrefetch(item.prefetch)}
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
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <img
                src={logoHeader}
                alt="Kondor Studio"
                className="h-9 w-auto"
              />
            </div>
          </div>
        </header>

        {/* MENU MOBILE */}
        {mobileOpen && isMounted
          ? createPortal(
              <div className="md:hidden fixed inset-0 z-[9999]">
                <div
                  className="absolute inset-0 bg-black/40"
                  onClick={closeMobile}
                  aria-hidden="true"
                />
                <nav className="absolute inset-y-0 right-0 w-72 max-w-full bg-white border-l border-gray-100 shadow-2xl px-4 py-6 flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <img
                      src={logoHeader}
                      alt="Kondor Studio"
                      className="h-8 w-auto"
                    />
                    <button
                      type="button"
                      onClick={closeMobile}
                      className="p-2 rounded-full border border-gray-200 text-gray-600"
                      aria-label="Fechar menu"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 px-1 mb-2">
                    Principal
                  </p>
                  <div className="flex-1 overflow-y-auto space-y-1">
                    {navItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => {
                          closeMobile();
                          handlePrefetch(item.prefetch);
                        }}
                        className={({ isActive }) =>
                          [
                            "block px-3 py-2 rounded-lg text-sm transition-colors",
                            isActive
                              ? "bg-purple-50 text-purple-700 font-medium"
                              : "text-gray-600 hover:bg-gray-50",
                          ].join(" ")
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      closeMobile();
                      handleLogout();
                    }}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition mt-3"
                  >
                    Sair
                  </button>
                </nav>
              </div>,
              document.body,
            )
          : null}

        {/* CONTEÚDO */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
