import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function getToken(): Promise<string | null> {
  return (await cookies()).get("auth_token")?.value ?? null;
}

export async function GET() {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${API_URL}/api/v1/admin/settings`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
