// front/src/pages/clientlogin.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Mail, Lock } from "lucide-react";
import { base44 } from "@/apiClient/base44Client";

export default function ClientLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // login de cliente usa endpoint dedicado no backend:
      // POST /api/auth/client-login
      const res = await base44.rawFetch("/auth/client-login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password: portalPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Falha ao fazer login");
      }

      // Armazenar token de cliente (separado do token da agência)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "kondor_client_auth",
          JSON.stringify(data)
        );
      }

      // Redireciona para o portal do cliente
      navigate("/clientportal", { replace: true });
    } catch (err) {
      console.error(err);
      setError(err.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-[14px] border-[1.5px] border-[#C4B5FD]/90 bg-white/85 px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-[0_15px_45px_rgba(124,58,237,0.08)] focus:outline-none focus:ring-2 focus:ring-[#A78BFA] focus:border-[#A78BFA] transition-all duration-150";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.2),_transparent_60%)] from-slate-900/5 via-white to-white px-4 py-16 flex items-center justify-center">
      <div className="w-full max-w-xl space-y-10">
        <div className="text-center space-y-3">
          <p className="tracking-widest text-xs font-semibold text-[#A78BFA] uppercase">
            Bem-vindo ao portal
          </p>
          <h1 className="text-3xl font-bold text-gray-900">Acesse como cliente</h1>
          <p className="text-base text-gray-500 max-w-md mx-auto">
            Aprove a criação da sua agência, acompanhe métricas e mantenha a operação sincronizada em tempo real.
          </p>
        </div>

        <div className="relative group animate-fade-in-up">
          <div className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-white/70 via-white/10 to-white/70 blur-3xl" aria-hidden />
          <form
            onSubmit={handleSubmit}
            noValidate
            className="relative rounded-[24px] border border-[#C4B5FD]/20 bg-white/80 backdrop-blur-xl shadow-2xl px-8 py-10 md:px-10 md:py-12 transition-all duration-500 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_30px_80px_rgba(79,70,229,0.18)]"
          >
            <fieldset className="space-y-6" disabled={loading}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500" htmlFor="client-email">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 pointer-events-none" />
                  <input
                    id="client-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@empresa.com"
                    className={`${inputClass} pl-12`}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500" htmlFor="client-password">
                  Senha do portal
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 pointer-events-none" />
                  <input
                    id="client-password"
                    type="password"
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className={`${inputClass} pl-12`}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <p className="text-[11px] text-gray-400">
                  No primeiro acesso, você cria a senha do portal a partir do convite enviado pela agência.
                </p>
              </div>
            </fieldset>

            <div aria-live="assertive" className="min-h-[1.5rem] mt-6">
              {error && (
                <div className="text-xs text-red-600 bg-red-50/80 border border-red-100 rounded-2xl px-4 py-2">
                  {error}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A78BFA] text-sm font-semibold tracking-wide text-white px-6 py-4 shadow-lg shadow-[#7C3AED]/30 hover:scale-[1.02] transition-all duration-150 disabled:opacity-70 disabled:hover:scale-100"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Validando acesso...
                </>
              ) : (
                "Entrar no portal"
              )}
            </button>
          </form>
        </div>

        <div className="text-center space-y-2 text-sm text-gray-600">
          <Link
            to="/login"
            className="inline-flex items-center justify-center text-xs text-gray-500 underline decoration-gray-300/60 underline-offset-4 hover:text-gray-700 hover:decoration-purple-200 transition"
          >
            Sou da agência e preciso do painel interno
          </Link>
        </div>
      </div>
    </div>
  );
}
