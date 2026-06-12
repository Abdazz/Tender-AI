"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Country {
  id: number;
  name: string;
  code: string;
}

interface Props {
  onCreated: () => void;
}

export function CreateUserDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"super_admin" | "admin" | "viewer">("viewer");
  const [countryId, setCountryId] = useState<string>("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetch("/api/proxy/countries")
        .then((r) => r.json())
        .then((data) => setCountries(Array.isArray(data) ? data : []))
        .catch(() => setCountries([]));
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (role !== "super_admin" && !countryId) {
      setError("Un pays est requis pour les rôles admin et viewer.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = { username, email, role };
      if (role !== "super_admin" && countryId) body.country_id = Number(countryId);
      const res = await fetch("/api/proxy/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail ?? "Erreur lors de la création");
        return;
      }
      setOpen(false);
      setUsername("");
      setEmail("");
      setRole("viewer");
      setCountryId("");
      onCreated();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        Nouvel utilisateur
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un utilisateur</DialogTitle>
          <DialogDescription>
            Un mot de passe sera généré automatiquement et envoyé par email.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-username">Identifiant</Label>
            <Input
              id="new-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-role">Rôle</Label>
            <select
              id="new-role"
              value={role}
              onChange={(e) => { setRole(e.target.value as typeof role); setCountryId(""); }}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          {role !== "super_admin" && (
            <div className="space-y-2">
              <Label htmlFor="new-country">Pays <span className="text-red-500">*</span></Label>
              <select
                id="new-country"
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                required
              >
                <option value="">— Sélectionner un pays —</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
