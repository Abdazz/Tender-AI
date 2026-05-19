import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SourcesPage() {
  const token = (await cookies()).get("auth_token")?.value ?? "";
  const data = await api.getSources(token).catch(() => ({ sources: [] }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sources</h1>
      <Card>
        <CardHeader>
          <CardTitle>Sources configurées</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="pb-2">Nom</th>
                <th className="pb-2">Parser</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2">Dernière réussite</th>
              </tr>
            </thead>
            <tbody>
              {(data.sources as Array<Record<string, unknown>>).map((s, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 font-medium">{String(s.name ?? "—")}</td>
                  <td className="font-mono text-xs">{String(s.parser_type ?? s.parser ?? "—")}</td>
                  <td>
                    <Badge variant={s.enabled ? "default" : "secondary"}>
                      {s.enabled ? "Actif" : "Inactif"}
                    </Badge>
                  </td>
                  <td className="text-slate-500">
                    {s.last_success_at
                      ? String(s.last_success_at).slice(0, 16)
                      : "Jamais"}
                  </td>
                </tr>
              ))}
              {data.sources.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-slate-400 text-center">
                    Aucune source configurée
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
