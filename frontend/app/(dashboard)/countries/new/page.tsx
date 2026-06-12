"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TABS = ["Infos de base", "Pipeline & LLM", "Scheduler", "Email", "Prompts", "Classification & RAG"] as const;
type Tab = (typeof TABS)[number];

export default function NewCountryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("Infos de base");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [basic, setBasic] = useState({ name: "", code: "", locale: "fr" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!basic.name || !basic.code) {
      setError("Nom et code ISO sont requis.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/proxy/countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basic),
      });
      if (!resp.ok) {
        const data = await resp.json();
        setError(data.detail ?? "Erreur lors de la création.");
        return;
      }
      router.push("/countries");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Nouveau pays</h1>

      <div className="flex gap-1 mb-6 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 p-6">
        {activeTab === "Infos de base" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom du pays</label>
              <input
                type="text"
                value={basic.name}
                onChange={(e) => setBasic({ ...basic, name: e.target.value })}
                placeholder="ex. Côte d'Ivoire"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Code ISO 3166-1 alpha-2</label>
              <input
                type="text"
                value={basic.code}
                onChange={(e) => setBasic({ ...basic, code: e.target.value.toUpperCase() })}
                placeholder="ex. CI"
                maxLength={2}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Locale</label>
              <select
                value={basic.locale}
                onChange={(e) => setBasic({ ...basic, locale: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="fr">Français (fr)</option>
                <option value="en">Anglais (en)</option>
              </select>
            </div>
          </div>
        )}

        {activeTab !== "Infos de base" && (
          <p className="text-sm text-slate-500 py-4">
            La configuration de cet onglet sera pré-remplie depuis les paramètres globaux à la création.
            Vous pourrez la modifier depuis la page Paramètres après avoir sélectionné ce pays.
          </p>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Création..." : "Créer le pays"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/countries")}
            className="px-4 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
