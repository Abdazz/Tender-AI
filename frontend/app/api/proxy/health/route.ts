import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function GET() {
  const res = await fetch(`${API_URL}/health`).catch(() => null);
  if (!res) return NextResponse.json({ status: "error", components: {} }, { status: 503 });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
