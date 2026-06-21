"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecipientFormDialog } from "@/components/recipients/recipient-form-dialog";
import { DeleteRecipientDialog } from "@/components/recipients/delete-recipient-dialog";
import type { RecipientOut } from "@/lib/api";

const GROUP_LABELS: Record<string, string> = { to: "À", cc: "CC", bcc: "BCC", default: "—" };

interface Props { countryId?: number; }

export function RecipientsSection({ countryId }: Props) {
  const [recipients, setRecipients] = useState<RecipientOut[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const params = countryId !== undefined ? `?country_id=${countryId}` : "";
      const res = await fetch(`/api/proxy/recipients${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecipients(data.recipients ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [countryId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Destinataires</CardTitle>
        <RecipientFormDialog onSaved={load} countryId={countryId} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-slate-400 text-sm">Chargement…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="pb-2">Email</th>
                <th className="pb-2">Nom</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2">Dernier envoi</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-3 font-medium">{r.email}</td>
                  <td className="text-slate-500">{r.name ?? "—"}</td>
                  <td><Badge variant="outline">{GROUP_LABELS[r.group] ?? r.group}</Badge></td>
                  <td>
                    <Badge variant={r.enabled ? "default" : "secondary"}>
                      {r.enabled ? "Actif" : "Inactif"}
                    </Badge>
                  </td>
                  <td className="text-slate-500 text-xs">
                    {r.last_sent_at ? r.last_sent_at.slice(0, 16).replace("T", " ") : "Jamais"}
                  </td>
                  <td className="space-x-1 whitespace-nowrap">
                    <RecipientFormDialog
                      recipient={r}
                      trigger={<Button size="sm" variant="outline">Modifier</Button>}
                      onSaved={load}
                    />
                    <DeleteRecipientDialog recipient={r} onDeleted={load} />
                  </td>
                </tr>
              ))}
              {recipients.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-slate-400 text-center">
                    Aucun destinataire configuré
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
