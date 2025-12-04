// front/src/pages/onboarding.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/apiClient/base44Client";

export default function Onboarding() {
  const navigate = useNavigate();

  const [agencyName, setAgencyName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#A78BFA");
  const [accentColor, setAccentColor] = useState("#39FF14");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      // Atualiza tenant com as configs básicas de branding
      await base44.entities.Tenant.update({
        name: agencyName || undefined,
        primaryColor,
        accentColor,
        logoUrl: logoUrl || undefined,
      });

      // Depois do onboarding, manda pro dashboard
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error(err);
      setError(
        err?.message || "Erro ao salvar as configurações iniciais da agência."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-xl border border-gray-200 rounded-2xl shadow-sm p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">
            Bem-vindo ao KONDOR STUDIO
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Vamos configurar rapidamente a identidade da sua agência para
            personalizar o portal do cliente.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Nome da agência
            </label>
            <input
              type="text"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="Ex.: Allianz Marketing, Alpha Social, etc."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Cor primária
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-10 rounded-md border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="#A78BFA"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Cor de acento
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-10 rounded-md border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="#39FF14"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              URL do logo (opcional)
            </label>
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="https://seu-cdn.com/logo.png"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Você poderá trocar isso depois nas configurações do tenant.
            </p>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full inline-flex items-center justify-center rounded-md bg-purple-500 text-white text-sm font-medium px-4 py-2 hover:bg-purple-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {saving ? "Salvando..." : "Concluir e ir para o dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}
