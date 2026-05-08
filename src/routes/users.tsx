import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAdmin } from "@/lib/require-admin";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, ShieldOff, Search } from "lucide-react";

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "Users — eBicycle Roma" }] }),
  component: UsersPage,
});

type Row = {
  id: string;
  display_name: string;
  avatar_initials: string;
  staff_id: string | null;
  staff_name: string | null;
  staff_email: string | null;
  roles: ("admin" | "staff")[];
};

function UsersPage() {
  const { ready } = useRequireAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles }, { data: staffRows }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_initials, staff_id"),
      supabase.from("staff").select("id, name, email"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const staffById = new Map((staffRows ?? []).map((s) => [s.id, s]));
    const rolesByUser = new Map<string, ("admin" | "staff")[]>();
    for (const r of roles ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role as "admin" | "staff");
      rolesByUser.set(r.user_id, list);
    }
    const merged: Row[] = (profiles ?? []).map((p) => {
      const s = p.staff_id ? staffById.get(p.staff_id) : null;
      return {
        id: p.id,
        display_name: p.display_name,
        avatar_initials: p.avatar_initials,
        staff_id: p.staff_id,
        staff_name: s?.name ?? null,
        staff_email: s?.email ?? null,
        roles: rolesByUser.get(p.id) ?? [],
      };
    });
    merged.sort((a, b) => a.display_name.localeCompare(b.display_name));
    setRows(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const toggleAdmin = async (row: Row) => {
    setBusyId(row.id);
    try {
      const isAdmin = row.roles.includes("admin");
      if (isAdmin) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", row.id)
          .eq("role", "admin");
        if (error) throw error;
        toast.success(`Removed admin from ${row.display_name}`);
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: row.id, role: "admin" });
        if (error) throw error;
        toast.success(`${row.display_name} is now an admin`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setBusyId(null);
    }
  };

  if (!ready) return null;

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      r.display_name.toLowerCase().includes(needle) ||
      (r.staff_email ?? "").toLowerCase().includes(needle) ||
      (r.staff_name ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        subtitle="Anyone who signs up gets a guide account automatically. Promote trusted users to admin."
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email"
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No users found.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((row) => {
              const isAdmin = row.roles.includes("admin");
              return (
                <div key={row.id} className="flex items-center gap-4 p-4">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                    {row.avatar_initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{row.display_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {row.staff_email ?? "—"}
                    </div>
                  </div>
                  <div className="hidden sm:flex gap-1.5">
                    {isAdmin && (
                      <Badge variant="default" className="gap-1">
                        <Shield className="h-3 w-3" /> Admin
                      </Badge>
                    )}
                    {row.roles.includes("staff") && (
                      <Badge variant="secondary">Guide</Badge>
                    )}
                    {row.roles.length === 0 && (
                      <Badge variant="outline">No role</Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isAdmin ? "outline" : "default"}
                    disabled={busyId === row.id}
                    onClick={() => void toggleAdmin(row)}
                  >
                    {isAdmin ? (
                      <>
                        <ShieldOff className="h-3.5 w-3.5 mr-1.5" /> Revoke admin
                      </>
                    ) : (
                      <>
                        <Shield className="h-3.5 w-3.5 mr-1.5" /> Make admin
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
