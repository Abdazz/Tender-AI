"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CountrySelector } from "@/components/country-selector";
import { useCountry } from "@/contexts/country-context";

const baseLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/reports", label: "Rapports" },
  { href: "/sources", label: "Sources" },
  { href: "/recipients", label: "Destinataires" },
];

const superAdminLinks = [
  { href: "/users", label: "Utilisateurs" },
  { href: "/countries", label: "Pays" },
];

const bottomLinks = [
  { href: "/settings", label: "Paramètres" },
  { href: "/logs", label: "Logs" },
];

interface SidebarProps {
  role: "super_admin" | "admin" | "viewer";
  username: string;
}

export function Sidebar({ role, username }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedCountry } = useCountry();
  const links = role === "super_admin"
    ? [...baseLinks, ...superAdminLinks, ...bottomLinks]
    : [...baseLinks, ...bottomLinks];

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="w-56 min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h1 className="font-bold text-lg">TenderAI BF</h1>
        <p className="text-xs text-slate-400 mt-1">{username}</p>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              pathname === href
                ? "bg-slate-700 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {role === "super_admin" ? (
        <CountrySelector />
      ) : selectedCountry ? (
        <div className="px-4 py-3 border-t border-slate-700">
          <p className="text-xs text-slate-500 mb-1">Pays</p>
          <p className="text-sm text-slate-200 font-medium truncate">{selectedCountry.name}</p>
        </div>
      ) : null}
      <div className="p-4 border-t border-slate-700">
        <button
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-white w-full text-left"
        >
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
