"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Country = { id: number; name: string; code: string; locale: string; active: boolean };

export default function CountriesPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/proxy/countries")
      .then((r) => r.json())
      .then((data) => setCountries(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  async function toggleActive(country: Country) {
    await fetch(`/api/proxy/countries/${country.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !country.active }),
    });
    setCountries((prev) =>
      prev.map((c) => (c.id === country.id ? { ...c, active: !c.active } : c))
    );
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Pays</h1>
        <Link
          href="/countries/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
        >
          Ajouter un pays
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Nom</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Code</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Locale</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Statut</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {countries.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-3 text-slate-600 font-mono">{c.code}</td>
                <td className="px-4 py-3 text-slate-600">{c.locale}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.active
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {c.active ? "Actif" : "Inactif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => toggleActive(c)}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    {c.active ? "Désactiver" : "Activer"}
                  </button>
                </td>
              </tr>
            ))}
            {countries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Aucun pays configuré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
