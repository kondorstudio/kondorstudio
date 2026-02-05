// front/src/pages/admin/AdminLayout.jsx
import React, { useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  FileText,
  Server,
  Menu,
  X,
  Shield,
  LogOut,
  ArrowLeft,
  ShieldAlert,
  Users,
  CreditCard,
  Plug,
  BarChart3,
  Database,
} from "lucide-react";
import { base44 } from "@/apiClient/base44Client";
import {
  useImpersonationState,
  clearImpersonationState,
} from "@/hooks/useImpersonation";
import {
  getAdminRoleLabel,
  hasAdminPermission,
} from "@/utils/adminPermissions";

const navItems = [
  { to: "/admin", label: "Visao Geral", icon: LayoutDashboard, permission: "tenants.read" },
  { to: "/admin/tenants", label: "Tenants", icon: Building2, permission: "tenants.read" },
  { to: "/admin/users", label: "Usuarios", icon: Users, permission: "users.read" },
  { to: "/admin/billing", label: "Billing", icon: CreditCard, permission: "billing.read" },
  { to: "/admin/integrations", label: "Integracoes", icon: Plug, permission: "integrations.read" },
  { to: "/admin/reports", label: "Relatórios", icon: BarChart3, permission: "reports.read" },
  { to: "/admin/logs", label: "Logs", icon: FileText, permission: "logs.read" },
  { to: "/admin/jobs", label: "Jobs", icon: Server, permission: "jobs.read" },
  { to: "/admin/data", label: "Data Studio", icon: Database, permission: "data.query" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const impersonation = useImpersonationState();
  const authData = useMemo(
    () => base44.storage.loadAuthFromStorage?.() || {},
    [],
  );
  const currentUserName =
    authData?.user?.name || authData?.user?.email || "Admin";
  const currentRole = authData?.user?.role || null;
  const roleLabel = getAdminRoleLabel(currentRole);

  const handleLogout = async () => {
    try {
      await base44.auth.logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const handleExitImpersonation = async () => {
    if (!impersonation) return;
    try {
      await base44.admin.stopImpersonation({
        sessionId: impersonation.sessionId,
        impersonatedUserId: impersonation.userId,
      });
    } catch (err) {
      console.error("Erro ao encerrar impersonate", err);
    } finally {
      if (impersonation.originalAuth) {
        base44.storage.saveAuthToStorage?.(impersonation.originalAuth);
      }
      clearImpersonationState();
      window.location.reload();
    }
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 w-72">
      <div className="px-6 py-5 border-b border-gray-200 flex items-center gap-3">
        <Shield className="w-6 h-6 text-purple-600" />
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Kondor Control Center
          </p>
          <p className="text-xs text-gray-500">{roleLabel}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-auto px-3 py-4 space-y-1">
        {navItems
          .filter((item) => hasAdminPermission(currentRole, item.permission))
          .map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/admin"}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition",
                isActive
                  ? "bg-purple-50 text-purple-600"
                  : "text-gray-600 hover:bg-gray-50",
              ].join(" ")
            }
            onClick={() => setSidebarOpen(false)}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-200 text-sm text-gray-600 space-y-2">
        <div>
          <p className="font-semibold text-gray-900">{currentUserName}</p>
          <p className="text-xs text-gray-500">{roleLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para painel da agência
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 text-white px-3 py-2 text-sm hover:bg-gray-800"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-gray-50">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {isSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-72 bg-white shadow-xl">
            <Sidebar />
          </div>
          <div
            className="flex-1 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="lg:hidden inline-flex items-center justify-center rounded-md border border-gray-200 p-2"
                onClick={() => setSidebarOpen((prev) => !prev)}
              >
                {isSidebarOpen ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Menu className="w-4 h-4" />
                )}
              </button>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Painel Mestre
                </p>
                <h1 className="text-lg font-semibold text-gray-900">
                  Kondor Control Center
                </h1>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
              <Shield className="w-4 h-4 text-purple-600" />
              Acesso seguro
            </div>
          </div>
          {impersonation && (
            <div className="bg-yellow-50 border-t border-b border-yellow-200 px-4 py-2 text-sm text-yellow-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                <span>
                  Você está visualizando como {impersonation.userName || impersonation.userEmail}
                </span>
              </div>
              <button
                type="button"
                onClick={handleExitImpersonation}
                className="inline-flex items-center justify-center rounded-md border border-yellow-600 px-3 py-1 text-xs font-medium text-yellow-900 hover:bg-yellow-100"
              >
                Sair do modo impersonate
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
