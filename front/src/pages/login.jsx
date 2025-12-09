// front/src/pages/login.jsx
import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { base44 } from "@/apiClient/base44Client";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Se veio de algum redirect protegido, usamos o "from"
  const from = location.state?.from?.pathname || "/dashboard";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // usa base44.auth.login -> POST /api/auth/login
      const data = await base44.auth.login({ email, password });

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-purple-50 px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-lg grid gap-8">
        <div className="text-center space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-500">
            Bem-vindo de volta
          </p>
          <h1 className="text-3xl font-bold text-slate-900">Acesse o painel</h1>
          <p className="text-sm text-slate-600">
            Gerencie clientes, criação, finanças e automações pelo celular ou desktop.
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <fieldset className="space-y-4" disabled={loading}>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="email">
                  E-mail corporativo
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@agencia.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="password">
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                  <span>Use a senha enviada no onboarding</span>
                  <button
                    type="button"
                    className="font-medium text-purple-600 hover:text-purple-700"
                    onClick={() => navigate("/clientlogin")}
                  >
                    Sou cliente
                  </button>
                </div>
              </div>
            </fieldset>

            <div aria-live="assertive" className="min-h-[1.5rem]">
              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-full bg-purple-600 text-white text-sm font-semibold px-4 py-3 shadow-lg shadow-purple-500/20 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>

        <div className="text-center space-y-1 text-sm text-slate-600">
          <p>
            Ainda não tem conta?{" "}
            <Link to="/register" className="text-purple-600 font-semibold hover:underline">
              Iniciar teste grátis
            </Link>
          </p>
          <Link
            to="/clientlogin"
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Acessar como cliente do portal
          </Link>
        </div>
      </div>
    </div>
  );
}
