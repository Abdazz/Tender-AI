"use client";

import { useEffect, useState } from "react";
import { useCountry } from "@/contexts/country-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunItem } from "@/lib/api";

interface HealthData {
  status: string;
  components: Record<string, { status: string }>;
}

export default function DashboardPage() {
  const { selectedCountry, role } = useCountry();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState("");

  useEffect(() => {
    fetch("/api/proxy/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: "error", components: {} }));
  }, []);

  useEffect(() => {
    if (!selectedCountry) return;
    const params = new URLSearchParams({
      country_id: String(selectedCountry.id),
      page: "1",
      page_size: "10",
    });
    fetch(`/api/proxy/runs?${params}`)
      .then((r) => r.json())
      .then((data) => setRuns(data.runs ?? []))
      .catch(() => setRuns([]));
  }, [selectedCountry?.id]);

  async function handleTriggerRun() {
    if (!selectedCountry) return;
    setTriggering(true);
    setTriggerMsg("");
    try {
      const res = await fetch(`/api/proxy/countries/${selectedCountry.id}/run`, {
        method: "POST",
      });
      if (res.ok) {
        setTriggerMsg("Pipeline lancé avec succès !");
        setTimeout(() => {
          const params = new URLSearchParams({
            country_id: String(selectedCountry.id),
            page: "1",
            page_size: "10",
          });
          fetch(`/api/proxy/runs?${params}`)
            .then((r) => r.json())
            .then((data) => setRuns(data.runs ?? []));
        }, 2000);
      } else {
        setTriggerMsg("Erreur lors du lancement du pipeline.");
      }
    } finally {
      setTriggering(false);
    }
  }

  const canTrigger = role === "super_admin" || role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {canTrigger && selectedCountry && (
          <div className="flex items-center gap-3">
            {triggerMsg && (
              <span className="text-sm text-slate-600">{triggerMsg}</span>
            )}
            <button
              onClick={handleTriggerRun}
              disabled={triggering}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {triggering ? "Lancement…" : "Lancer maintenant"}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Système</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={health?.status === "healthy" ? "default" : "destructive"}>
              {health?.status ?? "…"}
            </Badge>
          </CardContent>
        </Card>
        {Object.entries(health?.components ?? {}).map(([name, comp]) => (
          <Card key={name}>
            <CardHeader>
              <CardTitle className="text-sm capitalize">{name}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={comp.status === "healthy" ? "default" : "destructive"}>
                {comp.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Runs récents{selectedCountry ? ` — ${selectedCountry.name}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="pb-2">ID</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2">Démarré</th>
                <th className="pb-2">Durée</th>
                <th className="pb-2">Items</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.run_id} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{run.run_id.slice(0, 8)}…</td>
                  <td>
                    <Badge
                      variant={
                        run.status === "completed"
                          ? "default"
                          : run.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {run.status}
                    </Badge>
                  </td>
                  <td className="text-slate-500">{run.started_at?.slice(0, 16) ?? "—"}</td>
                  <td className="text-slate-500">
                    {run.duration_seconds ? `${run.duration_seconds.toFixed(1)}s` : "—"}
                  </td>
                  <td>{run.stats?.relevant_items ?? 0}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-slate-400 text-center">
                    Aucun run disponible
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
