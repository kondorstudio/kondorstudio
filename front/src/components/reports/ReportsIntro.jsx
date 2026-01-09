import React from "react";

export default function ReportsIntro() {
  return (
    <section className="rounded-[18px] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-sm)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
        Novo modulo
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--text)] md:text-3xl">
        Relatorios inteligentes
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
        Templates, relatorios por marca/grupo e widgets configuraveis ja estao disponiveis. Dashboards
        ao vivo e automacoes chegam nas proximas etapas.
      </p>
    </section>
  );
}
