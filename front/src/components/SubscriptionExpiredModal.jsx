import React from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useSubscription } from "./SubscriptionContext.jsx";

export default function SubscriptionExpiredModal() {
  const navigate = useNavigate();
  const { setExpired } = useSubscription();

  function handleGoToPlans() {
    setExpired(false);
    navigate("/pricing");
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Aviso de assinatura expirada"
    >
      <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-purple-100 p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-purple-50 text-purple-600">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-purple-500 font-semibold">
              Acesso pausado
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              Sua assinatura foi desativada
            </h2>
          </div>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">
          Seu trial terminou ou o pagamento da sua assinatura está pendente.
          Para voltar a usar o <span className="font-semibold">Kondor Studio</span>,
          escolha um plano ativo abaixo.
        </p>

        <button
          type="button"
          onClick={handleGoToPlans}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-purple-600 text-white text-sm font-semibold px-4 py-3 shadow-lg shadow-purple-500/20 hover:bg-purple-700 transition"
        >
          Ver planos e reativar acesso
        </button>
      </div>
    </div>
  );
}
