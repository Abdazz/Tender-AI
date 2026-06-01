import { cookies } from "next/headers";
import { SettingsClient } from "./settings-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default async function SettingsPage() {
  const token = (await cookies()).get("auth_token")?.value ?? "";
  const res = await fetch(`${API_URL}/api/v1/admin/settings`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  const body = res?.ok ? await res.json() : { sections: {}, readonly: {} };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Paramètres</h1>
      <SettingsClient sections={body.sections ?? {}} readonly={body.readonly ?? {}} />
    </div>
  );
}
