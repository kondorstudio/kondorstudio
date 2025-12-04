// front/src/pages/login.jsx
import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { base44 } from "@/apiClient/base44Client";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md border border-gray-200 rounded-xl shadow-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900">
            Login - KONDOR STUDIO
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Acesse sua conta para gerenciar clientes, posts e automações.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              E-mail
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="voce@agencia.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-md bg-purple-500 text-white text-sm font-medium px-4 py-2 hover:bg-purple-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 mb-1">
            Ainda não tem conta?
          </p>
          <Link
            to="/pricing"
            className="text-xs font-medium text-purple-600 hover:text-purple-700 underline"
          >
            Ver planos e começar teste grátis
          </Link>
        </div>

        <div className="mt-4 text-center">
          <Link
            to="/clientlogin"
            className="text-[11px] text-gray-500 hover:text-gray-700 underline"
          >
            Acessar como cliente (portal)
          </Link>
        </div>
      </div>
    </div>
  );
}
