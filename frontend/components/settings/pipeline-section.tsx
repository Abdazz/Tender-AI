"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DEDUP_METHODS = ["hash_only", "similarity_only", "hash_similarity", "llm_only", "hybrid"];

export interface PipelineData {
  max_items_per_run: number;
  min_relevance_score: number;
  deduplication_threshold: number;
  deduplication_method: string;
  use_llm_classification: boolean;
  pdf_timeout: number;
  max_file_size_mb: number;
}

interface Props { initialData: PipelineData; saveUrl?: string; }

export function PipelineSection({ initialData, saveUrl = "/api/proxy/settings/pipeline" }: Props) {
  const [form, setForm] = useState<PipelineData>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function set<K extends keyof PipelineData>(key: K, value: PipelineData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch(saveUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail ?? "Erreur lors de la sauvegarde");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Items max par run</Label>
              <Input type="number" value={form.max_items_per_run} min={1} max={10000}
                onChange={(e) => set("max_items_per_run", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Score de pertinence minimum (0–1)</Label>
              <Input type="number" value={form.min_relevance_score} min={0} max={1} step={0.01}
                onChange={(e) => set("min_relevance_score", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Seuil de déduplication (0–1)</Label>
              <Input type="number" value={form.deduplication_threshold} min={0} max={1} step={0.01}
                onChange={(e) => set("deduplication_threshold", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Méthode de déduplication</Label>
              <select value={form.deduplication_method}
                onChange={(e) => set("deduplication_method", e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background">
                {DEDUP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Timeout PDF (secondes)</Label>
              <Input type="number" value={form.pdf_timeout} min={10}
                onChange={(e) => set("pdf_timeout", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Taille max fichier (Mo)</Label>
              <Input type="number" value={form.max_file_size_mb} min={1}
                onChange={(e) => set("max_file_size_mb", Number(e.target.value))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input id="llm-classif" type="checkbox" checked={form.use_llm_classification}
              onChange={(e) => set("use_llm_classification", e.target.checked)}
              className="h-4 w-4 rounded border-input" />
            <Label htmlFor="llm-classif" className="cursor-pointer">
              Utiliser le LLM pour la classification
            </Label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">Sauvegardé ✓</p>}
          <Button type="submit" disabled={saving}>{saving ? "Sauvegarde…" : "Sauvegarder"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
