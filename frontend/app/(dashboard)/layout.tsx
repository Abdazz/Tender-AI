import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { Sidebar } from "@/components/sidebar";
import { CountryProvider } from "@/contexts/country-context";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "");

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) redirect("/login");

  let payload: { sub: string; role: "admin" | "viewer" };
  try {
    const result = await jwtVerify(token, JWT_SECRET);
    payload = result.payload as typeof payload;
  } catch {
    redirect("/login");
  }

  return (
    <CountryProvider>
      <div className="flex min-h-screen">
        <Sidebar role={payload.role} username={payload.sub} />
        <main className="flex-1 p-6 bg-slate-50">{children}</main>
      </div>
    </CountryProvider>
  );
}
