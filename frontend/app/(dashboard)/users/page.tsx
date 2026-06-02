"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateUserDialog } from "@/components/users/create-user-dialog";

interface User {
  id: string;
  username: string;
  email: string;
  role: "super_admin" | "admin" | "viewer";
  is_active: boolean;
  password_reset_required: boolean;
  country_id: number | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/proxy/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function toggleActive(user: User) {
    await fetch(`/api/proxy/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    loadUsers();
  }

  async function resetPassword(user: User) {
    if (!confirm(`Réinitialiser le mot de passe de ${user.username} ?`)) return;
    await fetch(`/api/proxy/users/${user.id}/reset-password`, { method: "POST" });
    alert("Nouveau mot de passe envoyé par email.");
  }

  async function deleteUser(user: User) {
    if (!confirm(`Supprimer l'utilisateur ${user.username} ?`)) return;
    await fetch(`/api/proxy/users/${user.id}`, { method: "DELETE" });
    loadUsers();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Utilisateurs</h1>
        <CreateUserDialog onCreated={loadUsers} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des utilisateurs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400 text-sm">Chargement…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="pb-2">Utilisateur</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Rôle</th>
                  <th className="pb-2">Statut</th>
                  <th className="pb-2">Pays</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{user.username}</td>
                    <td className="text-slate-500">{user.email}</td>
                    <td>
                      <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                        {user.role}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant={user.is_active ? "default" : "destructive"}>
                        {user.is_active ? "Actif" : "Inactif"}
                      </Badge>
                    </td>
                    <td className="text-slate-500 text-xs">
                      {user.country_id ?? "—"}
                    </td>
                    <td className="space-x-2">
                      <Button size="sm" variant="outline" onClick={() => toggleActive(user)}>
                        {user.is_active ? "Désactiver" : "Activer"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => resetPassword(user)}>
                        Reset MDP
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteUser(user)}>
                        Supprimer
                      </Button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-slate-400 text-center">
                      Aucun utilisateur
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
