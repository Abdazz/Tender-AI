"use client";

import { useEffect, useState } from "react";
import { useCountry } from "@/contexts/country-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RunItem } from "@/lib/api";

export default function ReportsPage() {
  const { selectedCountry } = useCountry();
  const [completed, setCompleted] = useState<RunItem[]>([]);

  useEffect(() => {
    if (!selectedCountry) return;
    const params = new URLSearchParams({
      country_id: String(selectedCountry.id),
      page: "1",
      page_size: "50",
    });
    fetch(`/api/proxy/runs?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const runs: RunItem[] = data.runs ?? [];
        setCompleted(runs.filter((r) => r.status === "completed" || r.status === "completed_with_warnings"));
      })
      .catch(() => setCompleted([]));
  }, [selectedCountry?.id]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        Rapports{selectedCountry ? ` — ${selectedCountry.name}` : ""}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Rapports disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="pb-2">Run ID</th>
                <th className="pb-2">Date</th>
                <th className="pb-2">Items</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((run) => (
                <tr key={run.run_id} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{run.run_id.slice(0, 8)}…</td>
                  <td className="text-slate-500">{run.started_at?.slice(0, 16) ?? "—"}</td>
                  <td>{run.stats?.relevant_items ?? 0}</td>
                  <td>
                    <Badge variant="default">{run.status}</Badge>
                  </td>
                  <td>
                    <a
                      href={`/api/proxy/reports/${run.run_id}/download`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Télécharger
                    </a>
                  </td>
                </tr>
              ))}
              {completed.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-slate-400 text-center">
                    Aucun rapport disponible
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
