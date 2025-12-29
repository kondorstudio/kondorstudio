// front/src/pages/teamlogin.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, Users, ShieldCheck } from "lucide-react";
import { base44 } from "@/apiClient/base44Client";

export default function TeamLogin() {
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaMaskedEmail, setMfaMaskedEmail] = useState("");
  const [mfaExpiresAt, setMfaExpiresAt] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  const from = location.state?.from?.pathname || "/dashboard";

  useEffect(() => {
    const authData = base44?.storage?.loadAuthFromStorage?.();
    if (authData?.accessToken) {
      navigate(from, { replace: true });
    }
  }, [from, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await base44.auth.login({
        email: identifier,
        password,
      });

      if (data?.mfaRequired) {
        setMfaRequired(true);
        setMfaChallengeId(data.challengeId || "");
        setMfaMaskedEmail(data.maskedEmail || "");
        setMfaExpiresAt(data.expiresAt || "");
        setMfaCode("");
        return;
      }

      navigate(from, { replace: true });
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
      await base44.auth.verifyMfa({
        challengeId: mfaChallengeId,
        code: mfaCode,
      });
      navigate(from, { replace: true });
    } catch (err) {
      console.error(err);
      setError(err.message || "Erro ao validar MFA");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-[14px] border-[1.5px] border-[#C4B5FD]/90 bg-white/85 px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-[0_15px_45px_rgba(124,58,237,0.08)] focus:outline-none focus:ring-2 focus:ring-[#A78BFA] focus:border-[#A78BFA] transition-all duration-150";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_60%)] from-slate-900/5 via-white to-white px-4 py-16 flex items-center justify-center">
      <div className="w-full max-w-xl space-y-10">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple-100 via-purple-50 to-white text-purple-600 px-4 py-1 text-xs font-semibold tracking-widest uppercase">
            <Users className="w-3.5 h-3.5" />
            Equipe Kondor
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            Área exclusiva da equipe
          </h1>
          <p className="text-base text-gray-500 max-w-md mx-auto">
            Faça login com seu e-mail ou usuário e continue apenas nas contas e clientes liberados para você.
          </p>
        </div>

        <div className="relative group animate-fade-in-up">
          <div className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-white/70 via-white/10 to-white/70 blur-3xl" aria-hidden />
          {!mfaRequired ? (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="relative rounded-[24px] border border-[#C4B5FD]/20 bg-white/80 backdrop-blur-xl shadow-2xl px-8 py-10 md:px-10 md:py-12 transition-all duration-500 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_30px_80px_rgba(79,70,229,0.18)]"
            >
              <fieldset className="space-y-6" disabled={loading}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500" htmlFor="team-identifier">
                    E-mail ou usuário
                  </label>
                  <input
                    id="team-identifier"
                    name="identifier"
                    type="text"
                    autoComplete="username"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="voce@agencia.com ou usuario"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500" htmlFor="team-password">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      id="team-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputClass} pr-12`}
                  />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
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
                    Entrando...
                  </>
                ) : (
                  "Entrar no painel"
                )}
              </button>
            </form>
          ) : (
            <form
              onSubmit={handleVerifyMfa}
              noValidate
              className="relative rounded-[24px] border border-[#C4B5FD]/20 bg-white/80 backdrop-blur-xl shadow-2xl px-8 py-10 md:px-10 md:py-12 transition-all duration-500 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_30px_80px_rgba(79,70,229,0.18)]"
            >
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-purple-600 uppercase tracking-widest">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verificação MFA
                </div>
                <p className="text-sm text-gray-500">
                  Enviamos um código para {mfaMaskedEmail || "seu e-mail"}.
                  {mfaExpiresAt && (
                    <span className="block text-xs text-gray-400">
                      Válido até {new Date(mfaExpiresAt).toLocaleTimeString("pt-BR")}
                    </span>
                  )}
                </p>
              </div>

              <fieldset className="space-y-6 mt-6" disabled={loading}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500" htmlFor="team-mfa">
                    Código de verificação
                  </label>
                  <input
                    id="team-mfa"
                    name="mfa"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="000000"
                    className={`${inputClass} tracking-[0.3em] text-center`}
                  />
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
                    Validando...
                  </>
                ) : (
                  "Validar acesso"
                )}
              </button>
            </form>
          )}
        </div>

        <div className="text-center space-y-2 text-sm text-gray-600">
          <Link
            to="/login"
            className="inline-flex items-center justify-center text-xs text-gray-500 underline decoration-gray-300/60 underline-offset-4 hover:text-gray-700 hover:decoration-purple-200 transition"
          >
            Sou gestor da agência
          </Link>
          <Link
            to="/clientlogin"
            className="inline-flex items-center justify-center text-xs text-gray-500 underline decoration-gray-300/60 underline-offset-4 hover:text-gray-700 hover:decoration-purple-200 transition"
          >
            Acessar como cliente do portal
          </Link>
        </div>
      </div>
    </div>
  );
}
