// front/src/layout.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutGrid,
  Library,
  LogOut,
  Menu,
  Plug,
  Settings,
  Users,
  UsersRound,
  Wallet,
  CheckSquare,
  X,
} from "lucide-react";
import { base44 } from "@/apiClient/base44Client";
import logoHeader from "@/assets/logoheader.png";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar.jsx";
import { Button } from "@/components/ui/button.jsx";
import { useActiveClient } from "@/hooks/useActiveClient.js";

const navGroups = [
  {
    label: "Principal",
    items: [
      {
        to: "/dashboard",
        label: "Dashboard",
        icon: LayoutGrid,
        prefetch: {
          key: ["dashboard-overview"],
          fn: () => base44.entities.Dashboard.overview(),
        },
      },
      {
        to: "/posts",
        label: "Posts",
        icon: FileText,
        prefetch: { key: ["posts"], fn: () => base44.entities.Post.list() },
      },
      {
        to: "/clients",
        label: "Clientes",
        icon: Users,
        prefetch: { key: ["clients"], fn: () => base44.entities.Client.list() },
      },
      {
        to: "/tasks",
        label: "Tarefas",
        icon: CheckSquare,
        prefetch: { key: ["tasks"], fn: () => base44.entities.Task.list() },
      },
    ],
  },
  {
    label: "Operacao",
    items: [
      { to: "/biblioteca", label: "Biblioteca", icon: Library },
      { to: "/financeiro", label: "Financeiro", icon: Wallet },
      { to: "/team", label: "Equipe", icon: UsersRound },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/metrics", label: "Metricas", icon: BarChart3 },
      {
        to: "/competitors",
        label: "Concorrentes",
        icon: Users,
        prefetch: { key: ["competitors"], fn: () => base44.entities.Competitor.list() },
      },
    ],
  },
  {
    label: "Configuracoes",
    items: [
      { to: "/integrations", label: "Integracoes", icon: Plug },
      { to: "/settings", label: "Configuracoes", icon: Settings },
    ],
  },
];

function flattenNav(groups) {
  return groups.reduce((acc, group) => acc.concat(group.items || []), []);
}

function LayoutContent() {
  const { collapsed } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("");
  const [activeClientId, setActiveClientId] = useActiveClient();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const flatNav = useMemo(() => flattenNav(navGroups), []);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

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
    [queryClient]
  );

  useEffect(() => {
    const updateUserName = () => {
      const authData = base44?.storage?.loadAuthFromStorage?.();
      const name =
        authData?.user?.name ||
        authData?.user?.fullName ||
        authData?.user?.userName ||
        authData?.user?.username ||
        authData?.user?.email ||
        "Usuario";
      setCurrentUserName(name);
    };

    updateUserName();

    const handleStorage = () => updateUserName();
    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorage);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorage);
      }
    };
  }, []);

  const activeNav = flatNav.find((item) => {
    if (item.to === "/" || item.to === "/dashboard") {
      return location.pathname === "/" || location.pathname.startsWith("/dashboard");
    }
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  });

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)] flex">
      <Sidebar className="hidden lg:flex">
        <SidebarHeader className={`border-[var(--border)] ${collapsed ? "px-3" : "px-4"}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <img src={logoHeader} alt="Kondor Studio" className="h-9 w-auto" />
            </div>
            <SidebarTrigger className="border-[var(--border)] text-[var(--text-muted)]">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </SidebarTrigger>
          </div>
        </SidebarHeader>

        <SidebarContent className={`py-4 ${collapsed ? "px-2" : "px-3"}`}>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              {!collapsed ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
              <SidebarMenu className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          [
                            "flex items-center rounded-[10px] py-2 text-sm font-medium transition",
                            collapsed ? "justify-center px-2" : "gap-3 px-3",
                            isActive
                              ? "bg-[var(--primary-light)] text-[var(--primary)]"
                              : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]",
                          ].join(" ")
                        }
                        onMouseEnter={() => handlePrefetch(item.prefetch)}
                        onFocus={() => handlePrefetch(item.prefetch)}
                      >
                        {Icon ? <Icon className="h-4 w-4" /> : null}
                        {!collapsed ? <span>{item.label}</span> : null}
                      </NavLink>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className={`border-[var(--border)] ${collapsed ? "px-3" : "px-4"}`}>
          <div className={`flex flex-col gap-3 ${collapsed ? "items-center" : ""}`}>
            <div className={`flex items-center gap-3 ${collapsed ? "flex-col" : ""}`}>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xs font-semibold text-slate-700">
                {currentUserName?.slice(0, 2).toUpperCase()}
              </div>
              {!collapsed ? (
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {currentUserName || "Usuario"}
                  </p>
                  <p className="text-xs text-gray-400">Conta ativa</p>
                </div>
              ) : null}
            </div>
            {collapsed ? (
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            ) : (
              <Button variant="secondary" onClick={handleLogout} className="w-full">
                Sair
              </Button>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      <div className="flex-1 flex flex-col">
        <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleMobile}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-muted)] lg:hidden"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                {activeNav?.label || "Painel"}
              </p>
              <p className="text-lg font-semibold text-gray-900">
                {activeNav?.label || "Dashboard"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-white px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Perfil
              </span>
              <select
                value={activeClientId || ""}
                onChange={(event) => setActiveClientId(event.target.value || "")}
                className="w-auto border-0 bg-transparent p-0 text-sm font-semibold text-[var(--text)] focus:outline-none focus:ring-0"
              >
                <option value="">Todos os clientes</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="hidden md:flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]">
              {currentUserName || "Usuario"}
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sair
            </Button>
          </div>
        </header>

          <main className="flex-1">
            <Outlet />
          </main>
        </div>

      {mobileOpen && isMounted
        ? createPortal(
          <div className="fixed inset-0 z-[9999] lg:hidden">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={closeMobile}
                aria-hidden="true"
              />
              <div className="absolute inset-y-0 left-0 w-72 max-w-full bg-[var(--surface)] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-4">
                  <img src={logoHeader} alt="Kondor Studio" className="h-8 w-auto" />
                  <button
                    type="button"
                    onClick={closeMobile}
                    className="rounded-[10px] border border-[var(--border)] p-2 text-[var(--text-muted)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="px-4 py-4 space-y-5">
                  {navGroups.map((group) => (
                    <div key={group.label}>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                        {group.label}
                      </p>
                      <div className="space-y-1">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <NavLink
                              key={item.to}
                              to={item.to}
                              className={({ isActive }) =>
                                [
                                  "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium",
                                  isActive
                                    ? "bg-[var(--primary-light)] text-[var(--primary)]"
                                    : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]",
                                ].join(" ")
                              }
                              onClick={closeMobile}
                            >
                              {Icon ? <Icon className="h-4 w-4" /> : null}
                              {item.label}
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export default function Layout() {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
}
