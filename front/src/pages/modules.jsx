import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.jsx";
import { CheckCircle2, Layers } from "lucide-react";
import { modulesData } from "@/data/modules.js";
import SiteHeader from "@/components/marketing/siteHeader.jsx";
import SiteFooter from "@/components/marketing/siteFooter.jsx";

export default function ModulesPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader />

      <main className="max-w-6xl mx-auto px-6 py-16 space-y-16">
        <section className="text-center space-y-4">
          <p className="text-sm uppercase tracking-[0.4em] text-purple-500">
            Ecossistema Kondor
          </p>
          <h1 className="text-4xl font-bold">
            Cada módulo resolve uma dor estratégica da sua operação
          </h1>
          <p className="text-slate-600 max-w-3xl mx-auto">
            Ative os módulos de acordo com a maturidade da sua agência e
            garanta previsibilidade em todos os fluxos — do planejamento ao
            financeiro.
          </p>
        </section>

        <section className="space-y-8">
          {modulesData.map((module) => (
            <div
              key={module.title}
              className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="text-sm text-purple-500 font-semibold flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Módulo
                  </p>
                  <h2 className="text-2xl font-bold mt-1">{module.title}</h2>
                  <p className="text-slate-600 mt-2">{module.description}</p>
                </div>
                <Button
                  variant="outline"
                  className="border-purple-200 text-purple-700"
                  onClick={() => navigate("/register")}
                >
                  Quero este módulo
                </Button>
              </div>
              <ul className="grid md:grid-cols-2 gap-3 mt-5 text-sm text-slate-600">
                {module.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-purple-600 mt-1" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="text-center bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-3xl py-12 px-6 space-y-4">
          <h3 className="text-3xl font-bold">
            Combine módulos e crie o fluxo perfeito para sua agência
          </h3>
          <p className="text-white/80 max-w-3xl mx-auto">
            Nossa equipe ajuda você a desenhar o rollout ideal e ativar apenas o
            que for necessário em cada etapa.
          </p>
          <Button
            size="lg"
            className="bg-white text-purple-700 hover:bg-white/90"
            onClick={() => navigate("/pricing")}
          >
            Ver planos com estes módulos
          </Button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
