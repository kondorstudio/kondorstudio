import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.jsx";
import { CheckCircle2, Target, BarChart3 } from "lucide-react";

const navLinks = [
  { label: "Home", to: "/" },
  { label: "Módulos", to: "/modules" },
  { label: "Demo", to: "/demo" },
  { label: "Planos", to: "/pricing" },
];

const plans = [
  {
    name: "Essencial",
    tag: "Pequenos negócios",
    monthly: 790,
    yearly: 690,
    users: "Até 5 usuários",
    modules: ["Financeiro", "Relatórios", "CRM/Clientes"],
    support: "Suporte em horário comercial",
    integrations: "Integrações básicas",
    cta: "Começar agora",
  },
  {
    name: "Profissional",
    tag: "Mais popular",
    monthly: 1590,
    yearly: 1390,
    users: "Até 20 usuários",
    modules: [
      "Financeiro",
      "Relatórios",
      "Operacional",
      "Compliance",
      "Painel Executivo",
    ],
    support: "Suporte 24/7 com CS dedicado",
    integrations: "Integrações completas + API",
    highlight: true,
    cta: "Explorar plano",
  },
  {
    name: "Enterprise",
    tag: "Personalizável",
    monthly: 0,
    yearly: 0,
    users: "Usuários ilimitados",
    modules: ["Todos os módulos + automações customizadas"],
    support: "CSM dedicado e SLA contratado",
    integrations: "Integrações avançadas e sob demanda",
    cta: "Solicitar contato",
  },
];

const comparison = [
  { feature: "Financeiro completo", essential: true, pro: true, enterprise: true },
  { feature: "Automação fiscal", essential: false, pro: true, enterprise: true },
  { feature: "Portal do cliente", essential: true, pro: true, enterprise: true },
  { feature: "APIs e integrações ilimitadas", essential: false, pro: true, enterprise: true },
  { feature: "Automação customizada", essential: false, pro: false, enterprise: true },
];

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);

export default function Pricing() {
  const navigate = useNavigate();
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-semibold">
              K
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">KONDOR</p>
              <p className="text-[10px] text-purple-500 uppercase tracking-[0.4em]">
                Pricing
              </p>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-slate-600 hover:text-slate-900"
              >
                {link.label}
              </Link>
            ))}
            <Button
              variant="outline"
              className="border-purple-200 text-purple-700"
              onClick={() => navigate("/login")}
            >
              Entrar
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-20 space-y-12">
        <section className="text-center space-y-4">
          <p className="text-sm text-purple-600 font-semibold">
            Planos e Preços
          </p>
          <h1 className="text-4xl font-bold">Escolha o plano ideal</h1>
          <p className="text-slate-600 max-w-3xl mx-auto">
            Ative módulos sob demanda e evolua conforme a sua operação cresce.
            Todos os planos incluem portal do cliente, aprovações e suporte
            humano.
          </p>
          <div className="flex items-center justify-center gap-3 text-sm mt-4">
            <span className={!isAnnual ? "font-semibold" : "text-slate-500"}>
              Mensal
            </span>
            <button
              onClick={() => setIsAnnual((prev) => !prev)}
              className={`relative w-12 h-6 rounded-full transition ${
                isAnnual ? "bg-purple-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition ${
                  isAnnual ? "right-0.5" : "left-0.5"
                }`}
              />
            </button>
            <span className={isAnnual ? "font-semibold" : "text-slate-500"}>
              Anual (-15%)
            </span>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const price = isAnnual ? plan.yearly : plan.monthly;
            return (
              <div
                key={plan.name}
                className={`rounded-3xl border p-6 bg-white shadow-sm ${
                  plan.highlight
                    ? "border-purple-400 shadow-xl relative"
                    : "border-slate-100"
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-lg">
                    Mais popular
                  </span>
                )}
                <p className="text-sm text-purple-600 font-semibold">
                  {plan.tag}
                </p>
                <h3 className="text-2xl font-bold mt-1">{plan.name}</h3>
                {price > 0 ? (
                  <p className="text-4xl font-bold mt-4">
                    {formatCurrency(price)}
                    <span className="text-base text-slate-500">
                      /{isAnnual ? "mês (anual)" : "mês"}
                    </span>
                  </p>
                ) : (
                  <p className="text-4xl font-bold mt-4">Custom</p>
                )}
                <p className="text-sm text-slate-600 mt-2">{plan.users}</p>
                <ul className="space-y-2 text-sm text-slate-600 mt-4">
                  {plan.modules.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 text-sm text-slate-600 space-y-2">
                  <p className="flex items-start gap-2">
                    <Target className="w-4 h-4 text-purple-500 mt-1" />
                    {plan.support}
                  </p>
                  <p className="flex items-start gap-2">
                    <BarChart3 className="w-4 h-4 text-purple-500 mt-1" />
                    {plan.integrations}
                  </p>
                </div>
                <Button
                  className="w-full mt-6"
                  variant={plan.highlight ? "default" : "outline"}
                  onClick={() =>
                    plan.cta === "Solicitar contato"
                      ? navigate("/register")
                      : navigate("/checkout", { state: { plan: plan.name } })
                  }
                >
                  {plan.cta}
                </Button>
              </div>
            );
          })}
        </section>

        <section className="overflow-auto border border-slate-100 rounded-3xl">
          <table className="w-full text-sm text-slate-600">
            <thead>
              <tr className="bg-slate-50 text-slate-800">
                <th className="text-left py-4 px-4">Comparativo</th>
                <th>Essencial</th>
                <th>Profissional</th>
                <th>Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.feature} className="border-t border-slate-100">
                  <td className="py-3 px-4 text-left font-medium">
                    {row.feature}
                  </td>
                  {[row.essential, row.pro, row.enterprise].map((val, idx) => (
                    <td key={idx} className="text-center">
                      {val ? "✔️" : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="text-center space-y-3">
          <p className="text-slate-600">
            Ainda com dúvidas? Nossa equipe pode te ajudar a escolher o plano
            certo.
          </p>
          <Button
            variant="outline"
            className="border-purple-200 text-purple-700"
            onClick={() => navigate("/register")}
          >
            Falar com especialista
          </Button>
        </section>
      </main>
    </div>
  );
}
