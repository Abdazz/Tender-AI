"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LLM_PROVIDERS = ["groq", "openai", "ollama"];

export interface LLMData {
  provider: string;
  groq_model: string;
  openai_model: string;
  ollama_model: string;
  ollama_base_url: string;
  temperature: number;
  max_tokens: number;
  timeout: number;
}

interface Props { initialData: LLMData; }

export function LLMSection({ initialData }: Props) {
  const [form, setForm] = useState<LLMData>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function set<K extends keyof LLMData>(key: K, value: LLMData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess(false);
    try {
      const res = await fetch("/api/proxy/settings/llm", {
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
      <CardHeader><CardTitle>Modèle LLM</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Fournisseur actif</Label>
            <select value={form.provider} onChange={(e) => set("provider", e.target.value)}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background">
              {LLM_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Modèle Groq</Label>
              <Input value={form.groq_model} onChange={(e) => set("groq_model", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Modèle OpenAI</Label>
              <Input value={form.openai_model} onChange={(e) => set("openai_model", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Modèle Ollama</Label>
              <Input value={form.ollama_model} onChange={(e) => set("ollama_model", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>URL Ollama</Label>
              <Input value={form.ollama_base_url} onChange={(e) => set("ollama_base_url", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Température (0–2)</Label>
              <Input type="number" value={form.temperature} min={0} max={2} step={0.05}
                onChange={(e) => set("temperature", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Tokens max</Label>
              <Input type="number" value={form.max_tokens} min={100}
                onChange={(e) => set("max_tokens", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Timeout requête (s)</Label>
              <Input type="number" value={form.timeout} min={10}
                onChange={(e) => set("timeout", Number(e.target.value))} />
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
