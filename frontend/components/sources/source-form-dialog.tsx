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
import type { SourceOut } from "@/lib/api";

interface Props {
  /** When provided, the dialog is in edit mode; when null it is in create mode. */
  source?: SourceOut | null;
  /** Custom trigger element; defaults to a "Nouvelle source" button. */
  trigger?: React.ReactNode;
  onSaved: () => void;
}

const PARSER_TYPES = ["html", "pdf", "html-pdf-mixed"] as const;

const empty = {
  name: "",
  base_url: "",
  list_url: "",
  parser_type: "html",
  rate_limit: "10/m",
  enabled: true,
};

export function SourceFormDialog({ source, trigger, onSaved }: Props) {
  const isEdit = !!source;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (open) {
      setForm(
        source
          ? {
              name: source.name,
              base_url: source.base_url,
              list_url: source.list_url,
              parser_type: source.parser_type,
              rate_limit: source.rate_limit,
              enabled: source.enabled,
            }
          : { ...empty }
      );
      setError("");
    }
  }, [open, source]);

  function set(field: keyof typeof empty, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const url = isEdit
      ? `/api/proxy/sources/${source!.id}`
      : "/api/proxy/sources";
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
        {trigger ? undefined : "Nouvelle source"}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifier la source" : "Nouvelle source"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifiez les paramètres de la source."
              : "Ajoutez une nouvelle source de données à surveiller."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="src-name">Nom</Label>
            <Input
              id="src-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              placeholder="ex: DGCMEF"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="src-base-url">URL de base</Label>
            <Input
              id="src-base-url"
              type="url"
              value={form.base_url}
              onChange={(e) => set("base_url", e.target.value)}
              required
              placeholder="https://example.gov"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="src-list-url">URL de liste (page des appels d&apos;offres)</Label>
            <Input
              id="src-list-url"
              type="url"
              value={form.list_url}
              onChange={(e) => set("list_url", e.target.value)}
              required
              placeholder="https://example.gov/appels-offres"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="src-parser">Type de parser</Label>
              <select
                id="src-parser"
                value={form.parser_type}
                onChange={(e) => set("parser_type", e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                {PARSER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="src-rate">Limite de requêtes</Label>
              <Input
                id="src-rate"
                value={form.rate_limit}
                onChange={(e) => set("rate_limit", e.target.value)}
                placeholder="10/m"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="src-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="src-enabled" className="cursor-pointer">
              Source active
            </Label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading
                ? isEdit
                  ? "Sauvegarde..."
                  : "Création..."
                : isEdit
                ? "Sauvegarder"
                : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
