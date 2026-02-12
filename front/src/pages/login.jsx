// front/src/pages/login.jsx
import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, Mail, Lock } from "lucide-react";
import { base44 } from "@/apiClient/base44Client";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaMaskedEmail, setMfaMaskedEmail] = useState("");
  const [mfaExpiresAt, setMfaExpiresAt] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  // Se veio de algum redirect protegido, usamos o "from"
  const from = location.state?.from?.pathname || "/dashboard";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // usa base44.auth.login -> POST /api/auth/login
      const data = await base44.auth.login({ email, password });

      if (data?.mfaRequired) {
        setMfaRequired(true);
        setMfaChallengeId(data.challengeId || "");
        setMfaMaskedEmail(data.maskedEmail || "");
        setMfaExpiresAt(data.expiresAt || "");
        setMfaCode("");
        return;
      }

      // aqui você pode decidir:
      // se é primeiro acesso / onboarding, mandar pra /onboarding
      // por enquanto, mandamos sempre pro dashboard ou rota original
      if (data?.user?.mustOnboard) {
        navigate("/onboarding", { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyMfa(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await base44.auth.verifyMfa({
        challengeId: mfaChallengeId,
        code: mfaCode,
      });

      if (data?.user?.mustOnboard) {
        navigate("/onboarding", { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Erro ao validar MFA");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-[14px] border-[1.5px] border-[#C4B5FD]/90 bg-white/80 px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-[0_15px_45px_rgba(124,58,237,0.08)] focus:outline-none focus:ring-2 focus:ring-[#A78BFA] focus:border-[#A78BFA] transition-all duration-150";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.2),_transparent_60%)] from-slate-900/5 via-white to-white px-4 py-16 flex items-center justify-center">
      <div className="w-full max-w-xl space-y-10">
        <div className="text-center space-y-3">
          <p className="tracking-widest text-xs font-semibold text-[#A78BFA] uppercase">
            Bem-vindo de volta
          </p>
          <h1 className="text-3xl font-bold text-gray-900">Acesse o painel</h1>
          <p className="text-base text-gray-500 max-w-md mx-auto">
            Entre no ambiente premium da Kondor para acompanhar operações, aprovações e finanças em tempo real.
          </p>
        </div>

        <div className="relative group animate-fade-in-up">
          <div className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-white/70 via-white/10 to-white/70 blur-3xl" aria-hidden />
          <form
            onSubmit={mfaRequired ? handleVerifyMfa : handleSubmit}
            noValidate
            className="relative rounded-[24px] border border-[#C4B5FD]/20 bg-white/75 backdrop-blur-xl shadow-2xl px-8 py-10 md:px-10 md:py-12 transition-all duration-500 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_30px_80px_rgba(79,70,229,0.18)]"
          >
            {!mfaRequired ? (
              <fieldset className="space-y-6" disabled={loading}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500" htmlFor="email">
                    E-mail corporativo
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 pointer-events-none" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@agencia.com"
                      className={`${inputClass} pl-12`}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-500" htmlFor="password">
                      Senha
                    </label>
                    <span className="text-[11px] text-gray-400">Use a senha enviada no onboarding</span>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 pointer-events-none" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`${inputClass} pl-12 pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/clientlogin")}
                      className="absolute -top-3 right-3 text-[11px] font-semibold text-purple-600 bg-white/80 border border-purple-100 rounded-full px-3 py-1 shadow-sm hover:bg-purple-50 transition-all"
                    >
                      Sou cliente
                    </button>
                  </div>
                </div>
              </fieldset>
            ) : (
              <fieldset className="space-y-4" disabled={loading}>
                <div className="rounded-2xl border border-[#C4B5FD]/50 bg-white/70 p-4">
                  <p className="text-xs uppercase tracking-widest text-purple-500 font-semibold">
                    Verificação de acesso
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    Enviamos um código para {mfaMaskedEmail || "seu e-mail"}.
                    {mfaExpiresAt ? (
                      <span className="block mt-1 text-xs text-gray-500">
                        Válido até {new Date(mfaExpiresAt).toLocaleTimeString("pt-BR")}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500" htmlFor="mfaCode">
                    Código MFA
                  </label>
                  <input
                    id="mfaCode"
                    name="mfaCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="000000"
                    className={`${inputClass} text-center tracking-[0.3em]`}
                  />
                </div>
              </fieldset>
            )}

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
                  {mfaRequired ? "Validando código..." : "Entrando..."}
                </>
              ) : (
                mfaRequired ? "Validar acesso" : "Entrar"
              )}
            </button>
          </form>
        </div>

        <div className="text-center space-y-2 text-sm text-gray-600">
          <p className="text-gray-500">
            Ainda não tem conta?{" "}
            <Link
              to="/register"
              className="font-semibold text-purple-600 underline decoration-purple-300/60 underline-offset-4 hover:decoration-purple-600 transition"
            >
              Iniciar teste grátis
            </Link>
          </p>
          <Link
            to="/clientlogin"
            className="inline-flex items-center justify-center text-xs text-gray-500 underline decoration-gray-300/60 underline-offset-4 hover:text-gray-700 hover:decoration-purple-200 transition-opacity duration-200"
          >
            Acessar como cliente do portal
          </Link>
        </div>
      </div>
    </div>
  );
}
