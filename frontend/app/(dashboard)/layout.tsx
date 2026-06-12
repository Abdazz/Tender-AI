import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { Sidebar } from "@/components/sidebar";
import { CountryProvider } from "@/contexts/country-context";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "");

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) redirect("/login");

  let payload: { sub: string; role: "super_admin" | "admin" | "viewer"; country_id?: number | null };
  try {
    const result = await jwtVerify(token, JWT_SECRET);
    payload = result.payload as typeof payload;
  } catch {
    redirect("/login");
  }

  const isSuperAdmin = payload.role === "super_admin";
  const fixedCountryId = isSuperAdmin ? null : (payload.country_id ?? null);

  return (
    <CountryProvider isSuperAdmin={isSuperAdmin} fixedCountryId={fixedCountryId} role={payload.role}>
      <div className="flex min-h-screen">
        <Sidebar role={payload.role} username={payload.sub} />
        <main className="flex-1 p-6 bg-slate-50">{children}</main>
      </div>
    </CountryProvider>
  );
}
