import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, UserPlus, Users2, Check, ListChecks, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  assignRentalStaff,
  listAssignmentsForPoint,
  listRentalStaff,
  unassignRentalStaff,
  upsertRentalStaff,
} from "@/lib/rental-staff.functions";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RentalStaff = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar: string;
  active: boolean;
};

type Assignment = {
  id: string;
  rental_point_id: string;
  rental_staff_id: string;
  date: string;
  notes: string | null;
  status: "pending" | "accepted" | "rejected" | null;
  pending_expires_at: string | null;
  rejection_reason: string | null;
};

/**
 * Hook for integrating rental-point staff assignment into the existing
 * shifts calendar. Returns:
 *   - renderDayOverlay(iso): avatar stack to display in each day cell
 *   - renderDayDialogSection(iso): assignment toggles for the day-details dialog
 *   - ManageRosterButton: button + dialog to edit the staff roster
 */
export function useRentalStaffBridge(pointId: string | null, enabled = true) {
  const list = useServerFn(listRentalStaff);
  const listA = useServerFn(listAssignmentsForPoint);
  const assign = useServerFn(assignRentalStaff);
  const unassign = useServerFn(unassignRentalStaff);
  const upsert = useServerFn(upsertRentalStaff);

  const [staff, setStaff] = useState<RentalStaff[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [unavailable, setUnavailable] = useState<
    { rental_staff_id: string; date: string; all_day: boolean; from_time: string | null; to_time: string | null }[]
  >([]);
  const [showRoster, setShowRoster] = useState(false);

  const reload = useCallback(async () => {
    if (!pointId || !enabled) {
      setStaff([]);
      setAssignments([]);
      setUnavailable([]);
      return;
    }
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      .toISOString()
      .slice(0, 10);
    const to = new Date(today.getFullYear(), today.getMonth() + 6, 0)
      .toISOString()
      .slice(0, 10);
    try {
      const [s, a, u] = await Promise.all([
        list(),
        listA({ data: { pointId, from, to } }),
        // Any unavailability entry (all-day or partial) is worth surfacing
        // to the admin -- rental-point day assignments aren't time-sliced,
        // so a partial-day busy window still overlaps whatever hours the
        // rental point needs covering that day.
        supabase
          .from("rental_staff_unavailability" as never)
          .select("rental_staff_id, date, all_day, from_time, to_time")
          .gte("date", from)
          .lte("date", to),
      ]);
      setStaff(s.staff as RentalStaff[]);
      setAssignments(a.assignments as Assignment[]);
      if (u.error) {
        // Don't fail the whole roster load over this -- staff/assignments
        // still loaded fine -- but do surface it, since a silent failure
        // here means the availability-conflict warning below just never
        // fires with no indication anything's wrong.
        toast.error(`Couldn't load staff availability: ${u.error.message}`);
        setUnavailable([]);
      } else {
        setUnavailable(
          ((u.data ?? []) as unknown as {
            rental_staff_id: string;
            date: string;
            all_day: boolean;
            from_time: string | null;
            to_time: string | null;
          }[]),
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load rental staff");
    }
  }, [pointId, enabled, list, listA]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Keep the unavailability picture live while the admin has this calendar
  // open -- a rental staff member marking a day off mid-session shouldn't
  // require the admin to reopen the dialog to see it.
  useEffect(() => {
    if (!pointId || !enabled) return;
    const channel = supabase
      .channel(`rental_unavail_admin:${pointId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rental_staff_unavailability" },
        () => {
          void reload();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pointId, enabled, reload]);

  const byDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      map.set(a.date, [...(map.get(a.date) ?? []), a]);
    }
    return map;
  }, [assignments]);

  // "<rental_staff_id>|<date>" -> marked unavailable that day, so the admin
  // gets a heads-up before assigning them to a rental point anyway --
  // mirrors how guide shift assignment is expected to respect
  // staff_unavailability.
  const unavailableByKey = useMemo(() => {
    const map = new Map<string, { allDay: boolean; from: string | null; to: string | null }>();
    for (const u of unavailable) {
      map.set(`${u.rental_staff_id}|${u.date}`, {
        allDay: u.all_day,
        from: u.from_time?.slice(0, 5) ?? null,
        to: u.to_time?.slice(0, 5) ?? null,
      });
    }
    return map;
  }, [unavailable]);

  const handleToggle = async (date: string, staffId: string) => {
    if (!pointId) return;
    const existing = (byDate.get(date) ?? []).find(
      (a) => a.rental_staff_id === staffId,
    );
    const conflict = unavailableByKey.get(`${staffId}|${date}`);
    if (!existing && conflict) {
      const name = staff.find((s) => s.id === staffId)?.name ?? "This person";
      const detail = conflict.allDay
        ? "marked the whole day off"
        : `marked themselves busy ${conflict.from ?? "?"}–${conflict.to ?? "?"}`;
      if (!confirm(`${name} ${detail} on ${date}. Assign anyway?`)) return;
    }
    try {
      if (existing) {
        await unassign({ data: { id: existing.id } });
      } else {
        await assign({ data: { pointId, staffId, date } });
      }
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const renderDayOverlay = useCallback(
    (iso: string) => {
      if (!pointId || !enabled) return null;
      const assigned = byDate.get(iso) ?? [];
      if (assigned.length === 0) {
        return (
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground/70 italic">
            <Users2 className="h-2.5 w-2.5" /> No staff
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1">
          <div className="flex -space-x-1">
            {assigned.slice(0, 3).map((a) => {
              const s = staff.find((x) => x.id === a.rental_staff_id);
              if (!s) return null;
              const ring =
                a.status === "accepted"
                  ? "ring-success"
                  : a.status === "rejected"
                    ? "ring-destructive"
                    : "ring-warning"; // pending (default)
              const statusLabel =
                a.status === "accepted"
                  ? "accepted"
                  : a.status === "rejected"
                    ? `rejected${a.rejection_reason ? ` — ${a.rejection_reason}` : ""}`
                    : "awaiting response";
              return (
                <span
                  key={a.id}
                  className={cn("inline-block rounded-full ring-2", ring)}
                  title={`${s.name} — ${statusLabel}`}
                >
                  <Avatar
                    name={s.name}
                    initials={s.avatar}
                    size="sm"
                    className="!h-4 !w-4 text-[7px]"
                  />
                </span>
              );
            })}
            {assigned.length > 3 && (
              <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/20 text-primary text-[7px] font-bold ring-1 ring-background">
                +{assigned.length - 3}
              </span>
            )}
          </div>
        </div>
      );
    },
    [byDate, staff, pointId, enabled],
  );

  const renderDayDialogSection = useCallback(
    (iso: string) => {
      if (!pointId || !enabled) return null;
      const assigned = byDate.get(iso) ?? [];
      const active = staff.filter((s) => s.active);
      return (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                Rental-point staff
              </span>
              {assigned.length > 0 && (
                <span className="text-[11px] text-primary font-medium">
                  {assigned.length} on duty
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowRoster(true)}
              className="h-7 px-2 text-xs"
            >
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Roster
            </Button>
          </div>
          {active.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2 text-center">
              No staff in roster yet.{" "}
              <button
                onClick={() => setShowRoster(true)}
                className="text-primary hover:underline"
              >
                Add staff
              </button>
              .
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {active.map((s) => {
                const a = assigned.find((x) => x.rental_staff_id === s.id);
                const on = !!a;
                const status = a?.status ?? null;
                const reason = a?.rejection_reason ?? null;
                const conflict = unavailableByKey.get(`${s.id}|${iso}`);
                const isUnavailable = !!conflict;
                const tone =
                  status === "accepted"
                    ? "bg-success/15 border-success/40 text-success-foreground hover:bg-success/20"
                    : status === "rejected"
                      ? "bg-destructive/15 border-destructive/40 text-destructive hover:bg-destructive/20"
                      : on
                        ? "bg-warning/15 border-warning/40 text-warning-foreground hover:bg-warning/20"
                        : isUnavailable
                          ? "bg-destructive/10 border-destructive/30 hover:bg-destructive/15"
                          : "bg-card border-border hover:bg-accent";
                const conflictDetail = conflict
                  ? conflict.allDay
                    ? `${s.name} marked the whole day off`
                    : `${s.name} marked themselves busy ${conflict.from ?? "?"}–${conflict.to ?? "?"}`
                  : undefined;
                const title =
                  status === "rejected"
                    ? `Rejected${reason ? `: ${reason}` : ""} — click to clear`
                    : conflictDetail;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void handleToggle(iso, s.id)}
                    title={title}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors",
                      tone,
                    )}
                  >
                    <Avatar
                      name={s.name}
                      initials={s.avatar}
                      size="sm"
                      className="!h-4 !w-4 text-[8px]"
                    />
                    <span className="truncate max-w-32">{s.name}</span>
                    {on && status === "accepted" && (
                      <span className="text-[9px] font-bold uppercase tracking-wider">✓</span>
                    )}
                    {on && status === "pending" && (
                      <span className="text-[9px] font-bold uppercase tracking-wider">pending</span>
                    )}
                    {on && status === "rejected" && (
                      <span className="text-[9px] font-bold uppercase tracking-wider">rejected</span>
                    )}
                    {/* Shown whenever the staff marked themselves unavailable
                        that day, even if they're already assigned -- e.g.
                        they went unavailable after being assigned, and the
                        admin should notice and reconsider. */}
                    {isUnavailable && (
                      <AlertTriangle
                        className="h-3 w-3 text-destructive shrink-0"
                        aria-label="Marked unavailable this day"
                      />
                    )}
                    {!on && <Plus className="h-3 w-3 opacity-60" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byDate, staff, pointId, enabled, unavailableByKey],
  );

  const ManageRosterButton = (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowRoster(true)}
        disabled={!pointId}
      >
        <Users2 className="h-4 w-4 mr-1" /> Rental staff roster
      </Button>
      <RosterDialog
        open={showRoster}
        onClose={() => setShowRoster(false)}
        staff={staff}
        onSave={async (input) => {
          try {
            await upsert({ data: input });
            await reload();
            toast.success("Saved");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to save");
          }
        }}
      />
    </>
  );

  return { renderDayOverlay, renderDayDialogSection, ManageRosterButton };
}

function RosterDialog({
  open,
  onClose,
  staff,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  staff: RentalStaff[];
  onSave: (input: {
    id?: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    active?: boolean;
  }) => Promise<void>;
}) {
  const [editing, setEditing] = useState<RentalStaff | null>(null);
  const [assigningTaskTo, setAssigningTaskTo] = useState<RentalStaff | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setEmail(editing.email ?? "");
      setPhone(editing.phone ?? "");
    } else {
      setName("");
      setEmail("");
      setPhone("");
    }
  }, [editing]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rental-point staff roster</DialogTitle>
          <DialogDescription>
            People who work at the rental points. They sign in with their email
            and see the days they're scheduled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-auto">
          {staff.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              No staff yet.
            </div>
          ) : (
            staff.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 p-2 rounded-md border border-border/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={s.name} initials={s.avatar} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {s.email || s.phone || "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setAssigningTaskTo(s)} title="Assign a task">
                    <ListChecks className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border/40 pt-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {editing ? "Edit" : "Add new"}
          </div>
          <div className="space-y-2">
            <div>
              <Label htmlFor="rs-name" className="text-xs">
                Name *
              </Label>
              <Input
                id="rs-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label htmlFor="rs-email" className="text-xs">
                Email (for sign-in)
              </Label>
              <Input
                id="rs-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label htmlFor="rs-phone" className="text-xs">
                Phone
              </Label>
              <Input
                id="rs-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {editing && (
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel edit
            </Button>
          )}
          <Button
            disabled={!name.trim()}
            onClick={async () => {
              await onSave({
                id: editing?.id,
                name,
                email: email || null,
                phone: phone || null,
                active: true,
              });
              setEditing(null);
            }}
          >
            {editing ? "Save changes" : "Add to roster"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <AssignTaskDialog rentalStaff={assigningTaskTo} onClose={() => setAssigningTaskTo(null)} />
    </Dialog>
  );
}

/**
 * Minimal "assign a task" flow for a single rental staff member -- writes
 * directly to rental_staff_tasks (see 20260705000000 migration). Kept as an
 * isolated, additive dialog here rather than folding into the guide-facing
 * NewTaskDialog on /tasks, so the existing guide task-creation flow (which
 * writes to the unrelated public.tasks table) isn't touched.
 */
function AssignTaskDialog({ rentalStaff, onClose }: { rentalStaff: RentalStaff | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState(() => new Date().toISOString().slice(0, 10));
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rentalStaff) {
      setTitle("");
      setDescription("");
      setDue(new Date().toISOString().slice(0, 10));
      setPriority("medium");
    }
  }, [rentalStaff]);

  const submit = async () => {
    if (!rentalStaff || !title.trim()) return;
    setSaving(true);
    try {
      const { error } = await (supabase.from("rental_staff_tasks" as never) as any).insert({
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: rentalStaff.id,
        due,
        priority,
      });
      if (error) throw error;
      toast.success(`Task assigned to ${rentalStaff.name}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!rentalStaff} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign a task</DialogTitle>
          <DialogDescription>{rentalStaff?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="rt-title" className="text-xs">Title *</Label>
            <Input id="rt-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label htmlFor="rt-desc" className="text-xs">Description</Label>
            <Textarea id="rt-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="rt-due" className="text-xs">Due</Label>
              <Input id="rt-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!title.trim() || saving} onClick={submit}>
            {saving ? "Assigning…" : "Assign task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
