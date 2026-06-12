"use client";

import { useCountry } from "@/contexts/country-context";

export function CountrySelector() {
  const { countries, selectedCountry, setSelectedCountry, loading } = useCountry();

  if (loading || countries.length === 0) return null;

  if (countries.length === 1) {
    return (
      <div className="px-4 py-3 border-t border-slate-700">
        <p className="text-xs text-slate-500 mb-1">Pays</p>
        <p className="text-sm text-slate-200 font-medium truncate">{countries[0].name}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-slate-700">
      <p className="text-xs text-slate-500 mb-1">Pays</p>
      <select
        value={selectedCountry?.id ?? ""}
        onChange={(e) => {
          const c = countries.find((c) => c.id === Number(e.target.value));
          if (c) setSelectedCountry(c);
        }}
        className="w-full text-sm bg-slate-800 text-slate-100 border border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:border-slate-400 cursor-pointer"
        aria-label="Sélectionner un pays"
      >
        {countries.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
