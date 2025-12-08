import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.jsx";
import { PlayCircle, CheckCircle2 } from "lucide-react";
import SiteHeader from "@/components/marketing/siteHeader.jsx";
import SiteFooter from "@/components/marketing/siteFooter.jsx";

const highlights = [
  "Diagnóstico dos problemas mais comuns em agências",
  "Tour pelo painel: planejamento, produção e aprovações",
  "Como configurar alertas e automatizações",
  "Resultados esperados em tempo, custo e controle",
];

export default function DemoPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader />

      <main className="max-w-5xl mx-auto px-6 py-16 space-y-12">
        <section className="text-center space-y-4">
          <p className="text-sm uppercase tracking-[0.4em] text-purple-500">
            Demo guiada
          </p>
          <h1 className="text-4xl font-bold">
            Assista à plataforma Kondor em ação
          </h1>
          <p className="text-slate-600 max-w-3xl mx-auto">
            Vídeo de 3 minutos mostrando a narrativa completa: problemas, fluxo
            de trabalho, interface e resultados esperados. Ideal para apresentar
            para sócios e clientes.
          </p>
        </section>

        <section className="rounded-3xl overflow-hidden border border-slate-200 shadow-lg bg-black">
          <iframe
            title="Demo Kondor"
            className="w-full h-72 md:h-[420px]"
            src="https://www.youtube-nocookie.com/embed/poY7h1dMQUA"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          <div className="rounded-3xl bg-white border border-slate-100 p-6 space-y-3">
            <h2 className="text-2xl font-semibold">Roteiro da apresentação</h2>
            <ul className="space-y-2 text-sm text-slate-600">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-600 mt-1" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-white border border-slate-100 p-6 space-y-4">
            <h2 className="text-2xl font-semibold">Próximos passos</h2>
            <p className="text-sm text-slate-600">
              Após assistir, você pode agendar um walkthrough personalizado ou
              iniciar o teste gratuito para explorar a plataforma no seu ritmo.
            </p>
            <div className="flex flex-col gap-3">
              <Button
                className="bg-gradient-to-r from-purple-500 to-purple-700"
                onClick={() => navigate("/register")}
              >
                Iniciar teste gratuito
              </Button>
              <Button
                variant="outline"
                className="border-purple-200 text-purple-700"
                onClick={() => navigate("/pricing")}
              >
                Ver planos disponíveis
              </Button>
            </div>
          </div>
        </section>

        <section className="text-center bg-slate-900 text-white rounded-3xl py-12 px-6 space-y-4">
          <h3 className="text-3xl font-bold">
            Pronto para aplicar o que viu na demo?
          </h3>
          <p className="text-white/80 max-w-2xl mx-auto">
            Nossa equipe ajuda você a configurar workflows, integrações e
            automações para que cada módulo entregue valor real em poucos dias.
          </p>
          <Button
            size="lg"
            variant="outline"
            className="border-white text-white"
            onClick={() => navigate("/register")}
          >
            Falar com nosso time
          </Button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
