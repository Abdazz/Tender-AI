"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface EmailData {
  from_address: string;
  from_name: string;
  to_address: string;
  reply_to: string | null;
  subject_prefix: string;
  signature: string;
}

interface Props { initialData: EmailData; }

export function EmailSection({ initialData }: Props) {
  const [form, setForm] = useState<EmailData>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function set<K extends keyof EmailData>(key: K, value: EmailData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess(false);
    try {
      const res = await fetch("/api/proxy/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); setError(d.detail ?? "Erreur"); }
      else setSuccess(true);
    } catch { setError("Erreur réseau."); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Email</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Adresse expéditeur</Label>
              <Input type="email" value={form.from_address}
                onChange={(e) => set("from_address", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Nom expéditeur</Label>
              <Input value={form.from_name} onChange={(e) => set("from_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Adresse destinataire</Label>
              <Input type="email" value={form.to_address}
                onChange={(e) => set("to_address", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Reply-To (optionnel)</Label>
              <Input type="email" value={form.reply_to ?? ""}
                onChange={(e) => set("reply_to", e.target.value || null)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Préfixe du sujet</Label>
              <Input value={form.subject_prefix}
                onChange={(e) => set("subject_prefix", e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Signature</Label>
              <Input value={form.signature} onChange={(e) => set("signature", e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">Sauvegardé ✓</p>}
          <Button type="submit" disabled={saving}>{saving ? "Sauvegarde…" : "Sauvegarder"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
