import React from "react";

export default function ReportsIntro() {
  return (
    <section className="looker-panel px-6 py-5">
      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
        <div>
          <p className="looker-section-title">Relatorios</p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--text)] md:text-3xl">
            Relatorios inteligentes
          </h1>
          <p className="mt-2 max-w-2xl text-sm looker-muted">
            Templates por marca/grupo, widgets configuraveis e dashboards ao vivo para o cliente.
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
              className="looker-card px-4 py-3"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
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
