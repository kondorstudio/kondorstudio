import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { base44 } from "@/apiClient/base44Client";

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    agencyName: "",
    tenantSlug: "",
    adminName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const suggestedSlug = useMemo(() => {
    if (form.tenantSlug) return slugify(form.tenantSlug);
    return slugify(form.agencyName || "");
  }, [form.agencyName, form.tenantSlug]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!form.password || form.password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    const payload = {
      tenantName: form.agencyName.trim(),
      tenantSlug: suggestedSlug || undefined,
      userName: form.adminName.trim(),
      userEmail: form.email.trim().toLowerCase(),
      password: form.password,
    };

    if (!payload.tenantName || !payload.tenantSlug || !payload.userName || !payload.userEmail) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }

    setLoading(true);
    try {
      await base44.auth.registerTenant(payload);
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(err?.message || "Falha ao criar sua conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-white px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center space-y-3">
          <span className="text-xs font-semibold text-purple-600 tracking-[0.3em] uppercase">
            Teste gratuito de 3 dias
          </span>
          <h1 className="text-4xl font-bold text-slate-900">
            Crie sua conta no KONDOR STUDIO
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">
            Configure sua agência, convide o time e use todos os módulos durante o período de teste. Todo o fluxo foi pensado para funcionar perfeitamente em telas menores.
          </p>
        </div>

        <div className="card">
          <form className="grid gap-5" onSubmit={handleSubmit} noValidate>
            <fieldset className="grid gap-5" disabled={loading}>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="agencyName">
                    Nome da agência *
                  </label>
                  <input
                    id="agencyName"
                    name="agencyName"
                    value={form.agencyName}
                    onChange={handleChange("agencyName")}
                    placeholder="Ex.: Alfa Social"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="tenantSlug">
                    Slug / subdomínio *
                  </label>
                  <input
                    id="tenantSlug"
                    name="tenantSlug"
                    pattern="[a-z0-9-]+"
                    value={form.tenantSlug}
                    onChange={handleChange("tenantSlug")}
                    placeholder="ex: alfa-social"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Endereço sugerido: <span className="font-medium">{suggestedSlug || "seu-slug"}</span>
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="adminName">
                    Nome do administrador *
                  </label>
                  <input
                    id="adminName"
                    name="adminName"
                    value={form.adminName}
                    onChange={handleChange("adminName")}
                    placeholder="Seu nome"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="email">
                    E-mail corporativo *
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    value={form.email}
                    onChange={handleChange("email")}
                    placeholder="voce@agencia.com"
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="password">
                    Senha *
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange("password")}
                    placeholder="mínimo 6 caracteres"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="confirmPassword">
                    Confirmar senha *
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={form.confirmPassword}
                    onChange={handleChange("confirmPassword")}
                    placeholder="repita sua senha"
                    required
                  />
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
              className="w-full inline-flex items-center justify-center rounded-full bg-purple-600 text-white text-sm font-semibold px-4 py-3 shadow-lg shadow-purple-500/20 hover:bg-purple-700 transition disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando conta...
                </>
              ) : (
                "Começar meu teste grátis"
              )}
            </button>
          </form>
        </div>

        <div className="text-center text-sm text-slate-600">
          Já tem conta?{" "}
          <Link to="/login" className="text-purple-600 font-semibold hover:underline">
            Fazer login
          </Link>
        </div>
      </div>
    </div>
  );
}
