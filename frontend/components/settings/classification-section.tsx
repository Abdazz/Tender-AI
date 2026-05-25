"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ClassificationData {
  relevant_keywords: Record<string, string[]>;
}

const CATEGORY_LABELS: Record<string, string> = {
  it_services: "Services IT",
  it_hardware: "Matériels informatiques",
  it_consulting: "Conseil IT",
};

interface Props { initialData: ClassificationData; }

export function ClassificationSection({ initialData }: Props) {
  const [form, setForm] = useState<ClassificationData>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function setKeywords(category: string, text: string) {
    const keywords = text.split("\n").map((k) => k.trim()).filter(Boolean);
    setForm((prev) => ({
      relevant_keywords: { ...prev.relevant_keywords, [category]: keywords },
    }));
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess(false);
    try {
      const res = await fetch("/api/proxy/settings/classification", {
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
      <CardHeader><CardTitle>Mots-clés de classification</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <p className="text-sm text-slate-500">Un mot-clé ou expression par ligne.</p>
          {Object.entries(form.relevant_keywords).map(([cat, keywords]) => (
            <div key={cat} className="space-y-1">
              <Label>{CATEGORY_LABELS[cat] ?? cat}</Label>
              <textarea
                className="w-full h-40 font-mono text-sm p-2 border border-input rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                value={keywords.join("\n")}
                onChange={(e) => setKeywords(cat, e.target.value)}
                spellCheck={false}
              />
              <p className="text-xs text-slate-400">{keywords.length} mots-clés</p>
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">Sauvegardé ✓</p>}
          <Button type="submit" disabled={saving}>{saving ? "Sauvegarde…" : "Sauvegarder"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
