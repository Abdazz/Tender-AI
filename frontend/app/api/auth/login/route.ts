import { NextRequest, NextResponse } from "next/server";
import { api } from "@/lib/api";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  try {
    const data = await api.login(username, password);
    const response = NextResponse.json({
      role: data.role,
      password_reset_required: data.password_reset_required,
    });
    response.cookies.set("auth_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: data.expires_in,
      path: "/",
    });
    return response;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message ?? "Login failed";
    return NextResponse.json({ error: message }, { status });
  }
}
