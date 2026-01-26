import React from "react";

export default function ReportsIntro() {
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-[var(--border)] bg-white/90 px-6 py-6 shadow-[var(--shadow-sm)]">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(31,111,235,0.18),rgba(31,111,235,0))]" />
      <div className="pointer-events-none absolute -left-20 bottom-[-96px] h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.15),rgba(249,115,22,0))]" />
      <div className="relative grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Novo modulo
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--text)] md:text-3xl">
            Relatorios inteligentes
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Templates, relatorios por marca/grupo e widgets configuraveis ja estao disponiveis.
            Dashboards ao vivo e automacoes chegam nas proximas etapas.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { title: "Templates prontos", description: "Crie em 1 clique" },
            { title: "Dashboards ao vivo", description: "Dados em tempo real" },
            { title: "Widgets flexiveis", description: "Montagem livre" },
            { title: "Automacoes", description: "Em breve" },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-[14px] border border-[var(--border)] bg-white/80 px-4 py-3 shadow-[var(--shadow-sm)]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {item.title}
              </p>
              <p className="mt-1 text-sm text-[var(--text)]">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
