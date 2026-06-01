"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Country = {
  id: number;
  name: string;
  code: string;
  locale: string;
  active: boolean;
};

type CountryContextValue = {
  countries: Country[];
  selectedCountry: Country | null;
  setSelectedCountry: (c: Country) => void;
  loading: boolean;
};

const CountryContext = createContext<CountryContextValue>({
  countries: [],
  selectedCountry: null,
  setSelectedCountry: () => {},
  loading: true,
});

export function CountryProvider({ children }: { children: ReactNode }) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountryState] = useState<Country | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/proxy/countries")
      .then((r) => r.json())
      .then((data: Country[]) => {
        const active = Array.isArray(data) ? data.filter((c) => c.active) : [];
        setCountries(active);
        const storedId = typeof window !== "undefined"
          ? Number(localStorage.getItem("selectedCountryId"))
          : 0;
        const found = active.find((c) => c.id === storedId) ?? active[0] ?? null;
        setSelectedCountryState(found);
      })
      .catch(() => setCountries([]))
      .finally(() => setLoading(false));
  }, []);

  function setSelectedCountry(c: Country) {
    setSelectedCountryState(c);
    if (typeof window !== "undefined") {
      localStorage.setItem("selectedCountryId", String(c.id));
    }
  }

  return (
    <CountryContext.Provider value={{ countries, selectedCountry, setSelectedCountry, loading }}>
      {children}
    </CountryContext.Provider>
  );
}

export const useCountry = () => useContext(CountryContext);
