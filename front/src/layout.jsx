// ARQUIVO: front/src/layout.jsx

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.jsx";

import { NavLink } from "react-router-dom";

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
  return (
    <SidebarProvider>
      {/* Em mobile: coluna (sidebar em cima, conteúdo embaixo)
          Em desktop: linha (sidebar à esquerda, conteúdo à direita) */}
      <div className="flex h-screen flex-col md:flex-row">
        {/* SIDEBAR WRAPPER RESPONSIVO */}
        <div className="w-full md:w-64 md:flex-shrink-0 md:h-full border-b md:border-b-0 md:border-r border-gray-200 bg-white">
          <Sidebar>
            <SidebarHeader>
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-purple-500 flex items-center justify-center text-white font-bold">
                    K
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="font-semibold text-sm">KONDOR</span>
                    <span className="text-xs text-gray-500">STUDIO</span>
                  </div>
                </div>

                {/* Botão de toggle só aparece no mobile */}
                <div className="md:hidden">
                  <SidebarTrigger />
                </div>
              </div>
            </SidebarHeader>

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Principal</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItems.map((item) => (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.to}
                            className={({ isActive }) =>
                              [
                                "flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                                isActive
                                  ? "bg-purple-100 text-purple-700 font-medium"
                                  : "text-gray-600 hover:bg-gray-100",
                              ].join(" ")
                            }
                          >
                            <span>{item.label}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="hidden md:block">
              <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-500">
                <span>Usuário</span>
                <SidebarTrigger />
              </div>
            </SidebarFooter>
          </Sidebar>
        </div>

        {/* CONTEÚDO */}
        <main className="flex-1 bg-gray-100 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
