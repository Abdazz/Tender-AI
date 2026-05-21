"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceFormDialog } from "@/components/sources/source-form-dialog";
import { DeleteSourceDialog } from "@/components/sources/delete-source-dialog";
import type { SourceOut } from "@/lib/api";

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<Record<number, string>>({});

  async function loadSources() {
    setLoading(true);
    try {
      const res = await fetch("/api/proxy/sources");
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSources();
  }, []);

  async function handleTest(source: SourceOut) {
    setTestResults((prev) => ({ ...prev, [source.id]: "..." }));
    try {
      const res = await fetch(`/api/proxy/sources/${source.id}/test`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setTestResults((prev) => ({
          ...prev,
          [source.id]: `OK — ${data.content_length ?? 0} bytes`,
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [source.id]: `Erreur: ${data.detail ?? "inconnue"}`,
        }));
      }
    } catch {
      setTestResults((prev) => ({ ...prev, [source.id]: "Erreur réseau" }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sources</h1>
        <SourceFormDialog onSaved={loadSources} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sources configurées</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400 text-sm">Chargement…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="pb-2">Nom</th>
                  <th className="pb-2">Parser</th>
                  <th className="pb-2">Statut</th>
                  <th className="pb-2">Dernière réussite</th>
                  <th className="pb-2">Dernière erreur</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">
                      <div>{source.name}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[180px]">
                        {source.list_url}
                      </div>
                    </td>
                    <td className="font-mono text-xs">{source.parser_type}</td>
                    <td>
                      <Badge variant={source.enabled ? "default" : "secondary"}>
                        {source.enabled ? "Actif" : "Inactif"}
                      </Badge>
                    </td>
                    <td className="text-slate-500 text-xs">
                      {source.last_success_at
                        ? source.last_success_at.slice(0, 16).replace("T", " ")
                        : "Jamais"}
                    </td>
                    <td className="text-xs max-w-[160px]">
                      {testResults[source.id] ? (
                        <span
                          className={
                            testResults[source.id].startsWith("OK")
                              ? "text-green-600"
                              : "text-red-500"
                          }
                        >
                          {testResults[source.id]}
                        </span>
                      ) : source.last_error_message ? (
                        <span className="text-red-500 truncate block" title={source.last_error_message}>
                          {source.last_error_message.slice(0, 40)}
                          {source.last_error_message.length > 40 ? "…" : ""}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="space-x-1 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTest(source)}
                        disabled={testResults[source.id] === "..."}
                      >
                        Tester
                      </Button>
                      <SourceFormDialog
                        source={source}
                        trigger={
                          <Button size="sm" variant="outline">
                            Modifier
                          </Button>
                        }
                        onSaved={loadSources}
                      />
                      <DeleteSourceDialog source={source} onDeleted={loadSources} />
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-slate-400 text-center">
                      Aucune source configurée
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
