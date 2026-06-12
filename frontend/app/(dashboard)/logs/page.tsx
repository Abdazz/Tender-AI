"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function LogsPage() {
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(true);

  async function fetchLogs() {
    setLoading(true);
    try {
      const res = await fetch("/api/proxy/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? "Aucun log disponible.");
      } else {
        setLogs("Erreur lors de la récupération des logs.");
      }
    } catch {
      setLogs("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Logs système</h1>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          {loading ? "Chargement…" : "Rafraîchir"}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>200 dernières lignes</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded overflow-auto h-[600px] whitespace-pre-wrap">
            {loading ? "Chargement…" : logs}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
