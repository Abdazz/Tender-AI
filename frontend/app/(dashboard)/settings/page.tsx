"use client";

import { useEffect, useState } from "react";
import { useCountry } from "@/contexts/country-context";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  const { selectedCountry, loading: countryLoading } = useCountry();
  const [settings, setSettings] = useState<{ sections: Record<string, Record<string, unknown>>; readonly: Record<string, unknown> }>({ sections: {}, readonly: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (countryLoading) return;

    setLoading(true);
    const url = selectedCountry
      ? `/api/proxy/countries/${selectedCountry.id}/settings`
      : "/api/proxy/settings";

    fetch(url)
      .then((r) => (r.ok ? r.json() : { sections: {}, readonly: {} }))
      .then((body) => {
        // Country settings endpoint returns flat sections dict
        // Global settings endpoint returns { sections: {}, readonly: {} }
        if (selectedCountry) {
          setSettings({ sections: body, readonly: {} });
        } else {
          setSettings({ sections: body.sections ?? {}, readonly: body.readonly ?? {} });
        }
      })
      .catch(() => setSettings({ sections: {}, readonly: {} }))
      .finally(() => setLoading(false));
  }, [selectedCountry?.id, countryLoading]);

  if (loading || countryLoading) return <p className="text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Paramètres</h1>
        {selectedCountry && (
          <span className="text-sm text-slate-500">
            Pays: <span className="font-medium text-slate-700">{selectedCountry.name}</span>
          </span>
        )}
      </div>
      <SettingsClient
        sections={settings.sections}
        readonly={settings.readonly}
        countryId={selectedCountry?.id}
      />
    </div>
  );
}
