import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
import { jwtVerify } from "jose";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "");

async function getTokenAndRole() {
  const token = (await cookies()).get("auth_token")?.value ?? "";
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return { token, role: payload.role as string };
}

export default async function DashboardPage() {
  const { token, role } = await getTokenAndRole();
  const [health, runsData] = await Promise.all([
    api.getHealth().catch(() => ({ status: "error", components: {} as Record<string, { status: string }> })),
    api.getRuns(token).catch(() => ({ runs: [] })),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {role === "admin" && (
          <form action="/api/runs/trigger" method="POST">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors"
            >
              Lancer maintenant
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Système</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={health.status === "healthy" ? "default" : "destructive"}>
              {health.status}
            </Badge>
          </CardContent>
        </Card>
        {Object.entries(health.components ?? {}).map(([name, comp]) => (
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
          <CardTitle>Runs récents</CardTitle>
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
              {runsData.runs.map((run) => (
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
              {runsData.runs.length === 0 && (
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
