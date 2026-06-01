"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SchedulerData {
  cron_schedule: string;
  timezone: string;
  enabled: boolean;
  max_concurrent_runs: number;
  run_on_startup: boolean;
}

interface Props { initialData: SchedulerData; }

export function SchedulerSection({ initialData }: Props) {
  const [form, setForm] = useState<SchedulerData>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function set<K extends keyof SchedulerData>(key: K, value: SchedulerData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess(false);
    try {
      const res = await fetch("/api/proxy/settings/scheduler", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const data = await res.json(); setError(data.detail ?? "Erreur lors de la sauvegarde"); }
      else setSuccess(true);
    } catch { setError("Erreur réseau."); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Planificateur</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Planning cron (5 champs)</Label>
              <Input value={form.cron_schedule}
                onChange={(e) => set("cron_schedule", e.target.value)}
                placeholder="0 7 * * 1-5" />
              <p className="text-xs text-slate-400">ex : &quot;0 7 * * 1-5&quot; = Lun–Ven à 7h00</p>
            </div>
            <div className="space-y-1">
              <Label>Fuseau horaire</Label>
              <Input value={form.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                placeholder="Africa/Ouagadougou" />
            </div>
            <div className="space-y-1">
              <Label>Runs max simultanés</Label>
              <Input type="number" value={form.max_concurrent_runs} min={1}
                onChange={(e) => set("max_concurrent_runs", Number(e.target.value))} />
            </div>
          </div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <input id="sched-enabled" type="checkbox" checked={form.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
                className="h-4 w-4 rounded border-input" />
              <Label htmlFor="sched-enabled" className="cursor-pointer">Planificateur actif</Label>
            </div>
            <div className="flex items-center gap-2">
              <input id="sched-startup" type="checkbox" checked={form.run_on_startup}
                onChange={(e) => set("run_on_startup", e.target.checked)}
                className="h-4 w-4 rounded border-input" />
              <Label htmlFor="sched-startup" className="cursor-pointer">Exécuter au démarrage</Label>
            </div>
          </div>
          <p className="text-xs text-amber-600">
            ⚠ Les modifications de planning cron prennent effet au prochain redémarrage du service worker.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">Sauvegardé ✓</p>}
          <Button type="submit" disabled={saving}>{saving ? "Sauvegarde…" : "Sauvegarder"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
