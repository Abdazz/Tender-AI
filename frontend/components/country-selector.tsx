"use client";

import { useCountry } from "@/contexts/country-context";

export function CountrySelector() {
  const { countries, selectedCountry, setSelectedCountry, loading } = useCountry();

  if (loading || countries.length <= 1) return null;

  return (
    <div className="px-2 pb-2">
      <select
        value={selectedCountry?.id ?? ""}
        onChange={(e) => {
          const c = countries.find((c) => c.id === Number(e.target.value));
          if (c) setSelectedCountry(c);
        }}
        className="w-full text-xs bg-slate-800 text-slate-100 border border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:border-slate-400"
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
