import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default async function SettingsPage() {
  const token = (await cookies()).get("auth_token")?.value ?? "";
  const res = await fetch(`${API_URL}/api/v1/admin/settings`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  const settings = res?.ok ? await res.json() : {};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Paramètres</h1>
      <Card>
        <CardHeader>
          <CardTitle>Configuration actuelle</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-slate-100 p-4 rounded overflow-auto max-h-[600px]">
            {JSON.stringify(settings, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
