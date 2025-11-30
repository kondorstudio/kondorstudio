import React from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  FileText,
  ListChecks,
  Image as ImageIcon,
  DollarSign,
  Users2,
  BarChart3,
  Cable,
  Settings,
  Zap,
  User,
  ExternalLink
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarRail
} from "@/components/ui/sidebar";

import { createPageUrl } from "@/utils";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    url: "dashboard",
    icon: LayoutDashboard
  },
  {
    label: "Clientes",
    url: "clientes",
    icon: Users
  },
  {
    label: "Posts",
    url: "posts",
    icon: FileText
  },
  {
    label: "Tarefas",
    url: "tarefas",
    icon: ListChecks
  },
  {
    label: "Biblioteca",
    url: "biblioteca",
    icon: ImageIcon
  },
  {
    label: "Financeiro",
    url: "financeiro",
    icon: DollarSign
  },
  {
    label: "Equipe",
    url: "equipe",
    icon: Users2
  },
  {
    label: "Métricas",
    url: "metricas",
    icon: BarChart3
  },
  {
    label: "Integrações",
    url: "integracoes",
    icon: Cable
  },
  {
    label: "Configurações",
    url: "configuracoes",
    icon: Settings
  }
];

function SidebarNav() {
  const location = useLocation();

  return (
    <SidebarContent className="flex flex-col">
      <SidebarGroup className="mt-4">
        <SidebarGroupContent>
          <SidebarMenu className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const to = createPageUrl(item.url);
              const isActive = location.pathname === to;

              return (
                <SidebarMenuItem key={item.url}>
                  <Link to={to}>
                    <SidebarMenuButton
                      className={
                        (isActive
                          ? "bg-purple-100 text-purple-700 "
                          : "text-slate-700 hover:bg-slate-100 ") +
                        "flex items-center gap-3 rounded-lg"
                      }
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {item.label}
                      </span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}

export default function Layout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen bg-slate-100 text-slate-900">
        {/* SIDEBAR ESQUERDA */}
        <Sidebar className="w-64 border-r border-slate-200 bg-white">
          <SidebarHeader className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white">
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">
                KONDOR
              </span>
              <span className="text-xs uppercase tracking-wide text-slate-500">
                STUDIO
              </span>
            </div>
          </SidebarHeader>

          <SidebarNav />

          <SidebarFooter className="mt-auto border-t border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-white text-xs font-medium">
                  U
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-slate-900">
                    Usuário
                  </span>
                  <span className="text-xs text-slate-500">
                    conta@kondor.studio
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <SidebarTrigger className="px-2 py-1">
                  <span className="sr-only">Alternar sidebar</span>
                  <span className="text-xs">⇤</span>
                </SidebarTrigger>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Sair
                </button>
              </div>
            </div>
          </SidebarFooter>

          <SidebarRail className="hidden" />
        </Sidebar>

        {/* ÁREA DA DIREITA */}
        <div className="flex flex-1 flex-col">
          {/* Aqui poderia ter um topbar depois */}
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
