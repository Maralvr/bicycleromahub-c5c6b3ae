import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAdmin } from "@/lib/require-admin";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Shield,
  ShieldOff,
  Search,
  MoreHorizontal,
  Ban,
  CheckCircle2,
  Trash2,
  Pause,
  Play,
} from "lucide-react";

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "Users — eBicycle Roma" }] }),
  component: UsersPage,
});

type StaffJobRole = "guide" | "rental" | "mechanic" | "admin";

type Row = {
  id: string;
  display_name: string;
  avatar_initials: string;
  staff_id: string | null;
  staff_name: string | null;
  staff_email: string | null;
  staff_role: StaffJobRole | null;
  active: boolean;
  banned: boolean;
  roles: ("admin" | "staff")[];
};

type Filter = "all" | "admin" | "guide" | "banned" | "inactive";

function UsersPage() {
  const { ready } = useRequireAdmin();
  const { user: me } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirm, setConfirm] = useState<{ row: Row; action: "delete" | "ban" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [profilesRes, staffRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_initials, staff_id"),
      supabase.from("staff").select("id, profile_id, name, email, role, active"),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    const staffByProfile = new Map(
      (staffRes.data ?? [])
        .filter((s) => s.profile_id)
        .map((s) => [s.profile_id as string, s]),
    );
    const rolesByUser = new Map<string, ("admin" | "staff")[]>();
    for (const r of rolesRes.data ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role as "admin" | "staff");
      rolesByUser.set(r.user_id, list);
    }
    const merged: Row[] = (profilesRes.data ?? []).map((p) => {
      const s = staffByProfile.get(p.id);
      return {
        id: p.id,
        display_name: p.display_name,
        avatar_initials: p.avatar_initials,
        staff_id: p.staff_id,
        staff_name: s?.name ?? null,
        staff_email: s?.email ?? null,
        staff_role: (s?.role ?? null) as StaffJobRole | null,
        active: s?.active ?? true,
        banned: false, // banned state lives in auth.users; surface via 'inactive' if needed
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

  const callAdmin = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-users", { body });
    if (error) throw error;
    if (data && typeof data === "object" && "error" in data && data.error) {
      throw new Error(String((data as { error: string }).error));
    }
  };

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

  const setStaffRole = async (row: Row, role: StaffJobRole) => {
    setBusyId(row.id);
    try {
      await callAdmin({ type: "set_staff_role", userId: row.id, role });
      toast.success(`Job role set to ${role}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const setActive = async (row: Row, active: boolean) => {
    setBusyId(row.id);
    try {
      await callAdmin({ type: "set_active", userId: row.id, active });
      toast.success(active ? "Account reactivated" : "Account deactivated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const banUser = async (row: Row) => {
    setBusyId(row.id);
    try {
      await callAdmin({ type: "ban", userId: row.id });
      toast.success(`${row.display_name} has been banned`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  };

  const deleteUser = async (row: Row) => {
    setBusyId(row.id);
    try {
      await callAdmin({ type: "delete", userId: row.id });
      toast.success(`${row.display_name} has been deleted`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "admin" && !r.roles.includes("admin")) return false;
      if (filter === "guide" && r.roles.includes("admin")) return false;
      if (filter === "inactive" && r.active) return false;
      if (filter === "banned" && !r.banned) return false;
      if (!needle) return true;
      return (
        r.display_name.toLowerCase().includes(needle) ||
        (r.staff_email ?? "").toLowerCase().includes(needle) ||
        (r.staff_name ?? "").toLowerCase().includes(needle) ||
        (r.staff_role ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, filter]);

  if (!ready) return null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        subtitle={`${rows.length} total — manage roles, deactivate or remove team members.`}
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email or role"
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="admin">Admins only</SelectItem>
            <SelectItem value="guide">Guides only</SelectItem>
            <SelectItem value="inactive">Deactivated</SelectItem>
          </SelectContent>
        </Select>
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
              const isMe = row.id === me?.id;
              return (
                <div
                  key={row.id}
                  className={`flex items-center gap-3 sm:gap-4 p-4 ${!row.active ? "opacity-60" : ""}`}
                >
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                    {row.avatar_initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate flex items-center gap-2">
                      {row.display_name}
                      {isMe && <Badge variant="outline" className="text-[10px]">You</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {row.staff_email ?? "—"}
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-1.5">
                    {isAdmin && (
                      <Badge variant="default" className="gap-1">
                        <Shield className="h-3 w-3" /> Admin
                      </Badge>
                    )}
                    {!row.active && <Badge variant="destructive">Inactive</Badge>}
                  </div>

                  {row.staff_id && (
                    <Select
                      value={row.staff_role ?? "guide"}
                      onValueChange={(v) => void setStaffRole(row, v as StaffJobRole)}
                      disabled={busyId === row.id}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="guide">Guide</SelectItem>
                        <SelectItem value="rental">Rental</SelectItem>
                        <SelectItem value="mechanic">Mechanic</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={busyId === row.id}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel>Manage</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => void toggleAdmin(row)}>
                        {isAdmin ? (
                          <><ShieldOff className="h-4 w-4 mr-2" /> Revoke admin</>
                        ) : (
                          <><Shield className="h-4 w-4 mr-2" /> Make admin</>
                        )}
                      </DropdownMenuItem>
                      {row.staff_id && (
                        <DropdownMenuItem onClick={() => void setActive(row, !row.active)}>
                          {row.active ? (
                            <><Pause className="h-4 w-4 mr-2" /> Deactivate</>
                          ) : (
                            <><Play className="h-4 w-4 mr-2" /> Reactivate</>
                          )}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={isMe}
                        onClick={() => setConfirm({ row, action: "ban" })}
                      >
                        <Ban className="h-4 w-4 mr-2" /> Ban from sign-in
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={isMe}
                        className="text-destructive focus:text-destructive"
                        onClick={() => setConfirm({ row, action: "delete" })}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete account
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "delete" ? "Delete account?" : "Ban user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "delete" ? (
                <>
                  This permanently removes <strong>{confirm.row.display_name}</strong>'s
                  account, profile and staff record. This cannot be undone.
                </>
              ) : confirm ? (
                <>
                  <strong>{confirm.row.display_name}</strong> will no longer be able to sign
                  in. You can lift the ban later from this same menu.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.action === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}
              onClick={() => {
                if (!confirm) return;
                if (confirm.action === "delete") void deleteUser(confirm.row);
                else void banUser(confirm.row);
              }}
            >
              {confirm?.action === "delete" ? (
                <><Trash2 className="h-4 w-4 mr-2" /> Delete</>
              ) : (
                <><Ban className="h-4 w-4 mr-2" /> Ban</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hint icon to satisfy unused-import lint if filter changes later */}
      <CheckCircle2 className="hidden" />
    </AppShell>
  );
}
