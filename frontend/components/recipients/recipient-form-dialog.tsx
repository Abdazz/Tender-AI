"use client";

import { useEffect, useState } from "react";
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
import type { RecipientOut } from "@/lib/api";

interface Props {
  recipient?: RecipientOut | null;
  trigger?: React.ReactElement;
  onSaved: () => void;
  countryId?: number;
}

const empty = { email: "", name: "", group: "to", enabled: true };

export function RecipientFormDialog({ recipient, trigger, onSaved, countryId }: Props) {
  const isEdit = !!recipient;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        recipient
          ? { email: recipient.email, name: recipient.name ?? "", group: recipient.group, enabled: recipient.enabled }
          : { ...empty }
      );
      setError("");
    }
  }, [open, recipient]);

  function set(field: keyof typeof empty, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const url = isEdit ? `/api/proxy/recipients/${recipient!.id}` : "/api/proxy/recipients";
    const method = isEdit ? "PUT" : "POST";

    const payload = isEdit
      ? { name: form.name || null, group: form.group, enabled: form.enabled }
      : { email: form.email, name: form.name || null, group: form.group, enabled: form.enabled, country_id: countryId ?? null };

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail ?? "Erreur lors de la sauvegarde");
        return;
      }
      setOpen(false);
      onSaved();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button />}>
        {trigger ? trigger.props.children : "Nouveau destinataire"}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le destinataire" : "Nouveau destinataire"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Modifiez les paramètres du destinataire." : "Ajoutez un destinataire pour les rapports."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="r-email">Email</Label>
              <Input
                id="r-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
                placeholder="nom@example.com"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="r-name">Nom</Label>
            <Input
              id="r-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Nom complet (optionnel)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="r-group">Type</Label>
            <select
              id="r-group"
              value={form.group}
              onChange={(e) => set("group", e.target.value)}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="to">À (to)</option>
              <option value="cc">Copie (cc)</option>
              <option value="bcc">Copie cachée (bcc)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="r-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="r-enabled" className="cursor-pointer">Actif</Label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? (isEdit ? "Sauvegarde..." : "Création...") : isEdit ? "Sauvegarder" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
