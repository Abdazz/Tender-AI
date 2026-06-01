"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface RAGData {
  enabled: boolean;
  chunk_size: number;
  chunk_overlap: number;
  top_k_results: number;
  embedding_model: string;
  vector_search_query: string;
}

interface Props { initialData: RAGData; saveUrl?: string; }

export function RAGSection({ initialData, saveUrl = "/api/proxy/settings/rag" }: Props) {
  const [form, setForm] = useState<RAGData>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function set<K extends keyof RAGData>(key: K, value: RAGData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess(false);
    try {
      const res = await fetch(saveUrl, {
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
      <CardHeader><CardTitle>RAG (Retrieval-Augmented Generation)</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2">
            <input id="rag-enabled" type="checkbox" checked={form.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
              className="h-4 w-4 rounded border-input" />
            <Label htmlFor="rag-enabled" className="cursor-pointer">RAG activé</Label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Taille des chunks (caractères)</Label>
              <Input type="number" value={form.chunk_size} min={64}
                onChange={(e) => set("chunk_size", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Chevauchement des chunks</Label>
              <Input type="number" value={form.chunk_overlap} min={0}
                onChange={(e) => set("chunk_overlap", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Résultats à récupérer (top-k)</Label>
              <Input type="number" value={form.top_k_results} min={1} max={100}
                onChange={(e) => set("top_k_results", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Modèle d&apos;embedding</Label>
              <Input value={form.embedding_model}
                onChange={(e) => set("embedding_model", e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Requête de recherche vectorielle</Label>
              <Input value={form.vector_search_query}
                onChange={(e) => set("vector_search_query", e.target.value)} />
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
