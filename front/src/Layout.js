import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "./apiClient/base44Client";
import {
  LayoutDashboard, Users, FileText, CheckSquare,
  Settings, LogOut, Menu, Zap, BarChart3,
  UserCircle, Building2, DollarSign, Image as ImageIcon
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navigationItems = [
  { title: "Dashboard", url: "Dashboard", icon: LayoutDashboard },
  { title: "Clientes", url: "Clients", icon: Users },
  { title: "Posts", url: "Posts", icon: FileText },
  { title: "Tarefas", url: "Tasks", icon: CheckSquare },
  { title: "Biblioteca", url: "Biblioteca", icon: ImageIcon },
  { title: "Financeiro", url: "Financeiro", icon: DollarSign },
  { title: "Equipe", url: "Team", icon: UserCircle },
  { title: "Métricas", url: "Metrics", icon: BarChart3 },
  { title: "Integrações", url: "Integrations", icon: Zap },
  { title: "Configurações", url: "Settings", icon: Settings },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    loadUserAndTenant();
  }, []);

  const loadUserAndTenant = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      const tenants = await base44.entities.Tenant.list();
      if (tenants.length > 0) {
        setTenant(tenants[0]);
      }
    } catch (error) {
      console.error("Error loading user/tenant:", error);
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  // Páginas públicas sem layout
  const publicPages = ["Pricing", "ClientPortal"];
  if (publicPages.includes(currentPageName)) {
    return children;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-white">
        <style>{`
          :root {
            --primary: #A78BFA;
            --accent: #39FF14;
            --background: #FFFFFF;
            --text: #1A1A1A;
            --gray: #EDEDED;
          }
        `}</style>

        <Sidebar className="border-r border-gray-200">
          <SidebarHeader className="border-b border-gray-200 p-6">
            <Link to={createPageUrl("Dashboard")} className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" fill="currentColor" />
              </div>
              <div>
                <h2 className="font-bold text-xl text-gray-900">KONDOR</h2>
                <p className="text-xs text-purple-400 font-medium">STUDIO</p>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent className="p-3">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => {
                    const isActive = location.pathname === createPageUrl(item.url);
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className={`hover:bg-purple-50 transition-all duration-200 rounded-lg mb-1 ${
                            isActive ? 'bg-purple-100 text-purple-700 font-medium' : 'text-gray-700'
                          }`}
                        >
                          <Link to={createPageUrl(item.url)} className="flex items-center gap-3 px-3 py-2.5">
                            <item.icon className="w-5 h-5" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-gray-200 p-4">
            {tenant && (
              <div className="mb-3 px-2 py-2 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-medium text-purple-900">{tenant.agency_name}</span>
                </div>
                <div className="text-xs text-purple-600">
                  Plano: <span className="font-semibold capitalize">{tenant.plan}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-semibold text-sm">
                    {user?.full_name?.[0] || "U"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {user?.full_name || "Usuário"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Sair"
              >
                <LogOut className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col">
          <header className="bg-white border-b border-gray-200 px-6 py-4 md:hidden">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-gray-100 p-2 rounded-lg">
                <Menu className="w-5 h-5" />
              </SidebarTrigger>
              <h1 className="text-xl font-bold">KONDOR STUDIO</h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto bg-gray-50">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}