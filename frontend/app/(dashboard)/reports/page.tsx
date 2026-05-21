import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default async function ReportsPage() {
  const token = (await cookies()).get("auth_token")?.value ?? "";
  const runsData = await api.getRuns(token, 1, 50).catch(() => ({ runs: [] }));
  const completed = runsData.runs.filter((r) => r.status === "completed");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Rapports</h1>
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
                      href={`${API_URL}/api/v1/reports/${run.run_id}/download`}
                      target="_blank"
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
