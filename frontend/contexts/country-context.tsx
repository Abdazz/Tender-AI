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
  isSuperAdmin: boolean;
};

const CountryContext = createContext<CountryContextValue>({
  countries: [],
  selectedCountry: null,
  setSelectedCountry: () => {},
  loading: true,
  isSuperAdmin: false,
});

interface CountryProviderProps {
  children: ReactNode;
  /** For non-super_admin: the country_id from JWT. When set, selection is locked. */
  fixedCountryId?: number | null;
  isSuperAdmin: boolean;
}

export function CountryProvider({ children, fixedCountryId, isSuperAdmin }: CountryProviderProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountryState] = useState<Country | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/proxy/countries")
      .then((r) => r.json())
      .then((data: Country[]) => {
        const active = Array.isArray(data) ? data.filter((c) => c.active) : [];
        setCountries(active);

        if (fixedCountryId) {
          // Non-super_admin: lock to their assigned country
          const found = active.find((c) => c.id === fixedCountryId) ?? null;
          setSelectedCountryState(found);
        } else {
          // super_admin: restore from localStorage or pick first
          const storedId = typeof window !== "undefined"
            ? Number(localStorage.getItem("selectedCountryId"))
            : 0;
          const found = active.find((c) => c.id === storedId) ?? active[0] ?? null;
          setSelectedCountryState(found);
        }
      })
      .catch(() => setCountries([]))
      .finally(() => setLoading(false));
  }, [fixedCountryId]);

  function setSelectedCountry(c: Country) {
    if (fixedCountryId) return; // locked for non-super_admin
    setSelectedCountryState(c);
    if (typeof window !== "undefined") {
      localStorage.setItem("selectedCountryId", String(c.id));
    }
  }

  return (
    <CountryContext.Provider value={{ countries, selectedCountry, setSelectedCountry, loading, isSuperAdmin }}>
      {children}
    </CountryContext.Provider>
  );
}

export const useCountry = () => useContext(CountryContext);
