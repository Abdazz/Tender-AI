import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readFileSync } from "fs";

function readLogs(): string {
  try {
    const raw = readFileSync("/app/logs/tenderai.log", "utf-8");
    const lines = raw.split("\n");
    return lines.slice(-200).join("\n");
  } catch {
    return "Logs non disponibles dans ce contexte.";
  }
}

export default function LogsPage() {
  const logs = readLogs();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Logs système</h1>
      <Card>
        <CardHeader>
          <CardTitle>200 dernières lignes</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded overflow-auto h-[600px]">
            {logs}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
