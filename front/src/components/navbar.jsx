// front/src/components/navbar.jsx
import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { base44 } from "@/apiClient/base44Client";
import { useSubscription } from "./SubscriptionContext.jsx";
import SubscriptionExpiredModal from "./SubscriptionExpiredModal.jsx";
import logoHeader from "@/assets/logoheader.png";
import { clearImpersonationState, useImpersonationState } from "@/hooks/useImpersonation";

export default function Navbar() {
  const navigate = useNavigate();
  const { status, openModal, isModalOpen, closeModal } = useSubscription();
  const impersonation = useImpersonationState();

  async function handleLogout() {
    try {
      await base44.auth.logout();
    } catch (err) {
      console.error("Erro ao fazer logout", err);
    } finally {
      navigate("/login", { replace: true });
    }
  }

  async function handleStopImpersonation() {
    if (!impersonation) return;
    const adminToken = impersonation.originalAuth?.accessToken;
    try {
      if (adminToken) {
        await base44.rawFetch("/admin/impersonate/stop", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            sessionId: impersonation.sessionId,
            impersonatedUserId: impersonation.userId,
          }),
        });
      }
    } catch (err) {
      console.error("Erro ao encerrar impersonate", err);
    } finally {
      if (impersonation.originalAuth) {
        base44.storage.saveAuthToStorage?.(impersonation.originalAuth);
      }
      clearImpersonationState();
      navigate("/admin", { replace: true });
    }
  }

  const isBlocked =
    status?.status === "expired" || status?.status === "blocked";

  function handleUpgradeClick() {
    openModal();
  }

  return (
    <>
      {impersonation && (
        <div className="w-full bg-amber-50 border-b border-amber-200">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-amber-900">
            <span>
              Modo impersonate ativo: {impersonation.userName || impersonation.userEmail}
            </span>
            <button
              type="button"
              onClick={handleStopImpersonation}
              className="inline-flex items-center rounded-md border border-amber-600 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Encerrar impersonate
            </button>
          </div>
        </div>
      )}

      <header className="w-full border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Logo + nome */}
          <div className="flex items-center gap-2">
            <img
              src={logoHeader}
              alt="Kondor Studio"
              className="h-9 w-auto"
            />
            <span className="text-[11px] text-gray-500 hidden sm:inline">
              Painel da agência
            </span>
          </div>

          {/* Navegação principal (desktop simples) */}
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                [
                  "px-2 py-1 rounded-md",
                  isActive
                    ? "text-purple-600 bg-purple-50"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
                ].join(" ")
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/clients"
              className={({ isActive }) =>
                [
                  "px-2 py-1 rounded-md",
                  isActive
                    ? "text-purple-600 bg-purple-50"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
                ].join(" ")
              }
            >
              Clientes
            </NavLink>
            <NavLink
              to="/posts"
              className={({ isActive }) =>
                [
                  "px-2 py-1 rounded-md",
                  isActive
                    ? "text-purple-600 bg-purple-50"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
                ].join(" ")
              }
            >
              Posts
            </NavLink>
            <NavLink
              to="/tasks"
              className={({ isActive }) =>
                [
                  "px-2 py-1 rounded-md",
                  isActive
                    ? "text-purple-600 bg-purple-50"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
                ].join(" ")
              }
            >
              Tarefas
            </NavLink>
            <NavLink
              to="/team"
              className={({ isActive }) =>
                [
                  "px-2 py-1 rounded-md",
                  isActive
                    ? "text-purple-600 bg-purple-50"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
                ].join(" ")
              }
            >
              Equipe
            </NavLink>
          </nav>

          {/* Ações à direita */}
          <div className="flex items-center gap-3">
            {isBlocked && (
              <button
                type="button"
                onClick={handleUpgradeClick}
                className="hidden sm:inline-flex items-center rounded-full border border-purple-300 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 transition"
              >
                Plano expirado – Fazer upgrade
              </button>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Modal de assinatura/trial expirado */}
      <SubscriptionExpiredModal open={isModalOpen} onClose={closeModal} />
    </>
  );
}
