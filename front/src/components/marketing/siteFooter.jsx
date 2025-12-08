import React from "react";
import { Link } from "react-router-dom";
import logoFull from "@/assets/logo-full.svg";

const footerColumns = [
  {
    title: "Produto",
    links: [
      { label: "Home", to: "/" },
      { label: "Módulos", to: "/modules" },
      { label: "Planos", to: "/pricing" },
      { label: "Demo", to: "/demo" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { label: "Documentação", to: "/" },
      { label: "Central de ajuda", to: "/" },
      { label: "Status", to: "/" },
    ],
  },
  {
    title: "Contato",
    links: [
      { label: "contato@kondor.studio", href: "mailto:contato@kondor.studio" },
      { label: "+55 (11) 4002-8922", href: "tel:+551140028922" },
      { label: "LinkedIn", href: "https://www.linkedin.com" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="bg-slate-950 text-slate-300 mt-20">
      <div className="max-w-6xl mx-auto px-6 py-12 grid gap-8 md:grid-cols-4">
        <div className="space-y-3">
          <img src={logoFull} alt="Kondor Studio" className="h-10 w-auto" />
          <p className="text-sm text-slate-400">
            Plataforma de gestão para agências modernas. Organização, automação
            e inteligência em um único lugar.
          </p>
          <p className="text-xs text-slate-500">
            Av. Paulista, 1374 · São Paulo/SP · Brasil
          </p>
        </div>
        {footerColumns.map((column) => (
          <div key={column.title} className="space-y-3">
            <p className="text-sm font-semibold text-white">{column.title}</p>
            <ul className="space-y-2 text-sm">
              {column.links.map((item) => (
                <li key={item.label}>
                  {item.to ? (
                    <Link
                      to={item.to}
                      className="text-slate-400 hover:text-white transition"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <a
                      href={item.href}
                      className="text-slate-400 hover:text-white transition"
                    >
                      {item.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 text-xs text-slate-500 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Kondor Studio. Todos os direitos reservados.</span>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-white transition">
              Termos de uso
            </Link>
            <Link to="/privacy" className="hover:text-white transition">
              Privacidade
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
