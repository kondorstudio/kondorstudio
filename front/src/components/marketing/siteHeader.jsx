import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import logoFull from "@/assets/logo-full.svg";
import logoMark from "@/assets/logo-mark.svg";

const navLinks = [
  { label: "Home", to: "/" },
  { label: "Módulos", to: "/modules" },
  { label: "Demo", to: "/demo" },
  { label: "Planos", to: "/pricing" },
];

export default function SiteHeader({ variant = "solid" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const baseClass =
    variant === "transparent"
      ? "bg-transparent"
      : "bg-white/90 backdrop-blur border-b border-slate-100";

  return (
    <header className={`${baseClass} sticky top-0 z-40`}>
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src={logoFull} alt="Kondor Studio" className="h-9 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-slate-600 hover:text-slate-900 transition"
            >
              {link.label}
            </Link>
          ))}
          <ButtonGhost onClick={() => navigate("/login")}>Entrar</ButtonGhost>
          <button
            className="inline-flex items-center rounded-full bg-gradient-to-r from-purple-500 to-purple-700 px-4 py-2 text-sm font-semibold text-white shadow"
            onClick={() => navigate("/register")}
          >
            Comece Agora
          </button>
        </nav>

        <button
          className="md:hidden text-slate-700"
          onClick={() => setOpen(true)}
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50">
          <div className="ml-auto h-full w-72 bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <img src={logoMark} alt="Kondor" className="h-10 w-10" />
              <button onClick={() => setOpen(false)}>
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="flex-1 px-5 py-6 space-y-4 text-sm">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="block text-slate-700 font-medium"
                >
                  {link.label}
                </Link>
              ))}
              <button
                className="w-full rounded-full border border-slate-200 py-2 font-medium"
                onClick={() => {
                  navigate("/login");
                  setOpen(false);
                }}
              >
                Entrar
              </button>
              <button
                className="w-full rounded-full bg-gradient-to-r from-purple-500 to-purple-700 py-2 font-semibold text-white shadow"
                onClick={() => {
                  navigate("/register");
                  setOpen(false);
                }}
              >
                Comece Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function ButtonGhost({ children, ...props }) {
  return (
    <button
      className="text-sm font-medium text-slate-600 hover:text-slate-900"
      {...props}
    >
      {children}
    </button>
  );
}
