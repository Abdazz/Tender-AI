"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PromptEditorDialog } from "./prompt-editor-dialog";

interface PromptPair { system: string; user_template: string; }

export interface PromptsData {
  extraction: PromptPair;
  classification: PromptPair;
  summarization: PromptPair;
  deduplication: PromptPair;
}

const PROMPT_LABELS: Record<keyof PromptsData, string> = {
  extraction: "Extraction",
  classification: "Classification",
  summarization: "Résumé",
  deduplication: "Déduplication",
};

interface Props { initialData: PromptsData; }

export function PromptsSection({ initialData }: Props) {
  const [form, setForm] = useState<PromptsData>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function setPromptField(key: keyof PromptsData, field: "system" | "user_template", value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess(false);
    try {
      const res = await fetch("/api/proxy/settings/prompts", {
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
      <CardHeader><CardTitle>Prompts LLM</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {(Object.keys(form) as Array<keyof PromptsData>).map((key) => (
            <div key={key} className="space-y-2 border rounded-lg p-4">
              <h3 className="font-medium text-sm">{PROMPT_LABELS[key]}</h3>
              <div className="flex items-center justify-between">
                <Label className="text-slate-500 text-xs">Prompt système</Label>
                <PromptEditorDialog
                  title={`${PROMPT_LABELS[key]} — Système`}
                  value={form[key].system}
                  onChange={(v) => setPromptField(key, "system", v)}
                />
              </div>
              <p className="text-xs text-slate-400 font-mono truncate bg-slate-50 p-1 rounded">
                {form[key].system.slice(0, 120)}…
              </p>
              <div className="flex items-center justify-between">
                <Label className="text-slate-500 text-xs">Template utilisateur</Label>
                <PromptEditorDialog
                  title={`${PROMPT_LABELS[key]} — Template utilisateur`}
                  value={form[key].user_template}
                  onChange={(v) => setPromptField(key, "user_template", v)}
                />
              </div>
              <p className="text-xs text-slate-400 font-mono truncate bg-slate-50 p-1 rounded">
                {form[key].user_template.slice(0, 120)}…
              </p>
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
