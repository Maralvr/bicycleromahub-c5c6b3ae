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
import { Plus, UserPlus, Users2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  assignRentalStaff,
  listAssignmentsForPoint,
  listRentalStaff,
  unassignRentalStaff,
  upsertRentalStaff,
} from "@/lib/rental-staff.functions";

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
  status: "pending" | "accepted" | null;
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
export function useRentalStaffBridge(pointId: string | null) {
  const list = useServerFn(listRentalStaff);
  const listA = useServerFn(listAssignmentsForPoint);
  const assign = useServerFn(assignRentalStaff);
  const unassign = useServerFn(unassignRentalStaff);
  const upsert = useServerFn(upsertRentalStaff);

  const [staff, setStaff] = useState<RentalStaff[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showRoster, setShowRoster] = useState(false);

  const reload = useCallback(async () => {
    if (!pointId) {
      setStaff([]);
      setAssignments([]);
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
      const [s, a] = await Promise.all([
        list(),
        listA({ data: { pointId, from, to } }),
      ]);
      setStaff(s.staff as RentalStaff[]);
      setAssignments(a.assignments as Assignment[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load rental staff");
    }
  }, [pointId, list, listA]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const byDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      map.set(a.date, [...(map.get(a.date) ?? []), a]);
    }
    return map;
  }, [assignments]);

  const handleToggle = async (date: string, staffId: string) => {
    if (!pointId) return;
    const existing = (byDate.get(date) ?? []).find(
      (a) => a.rental_staff_id === staffId,
    );
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
      if (!pointId) return null;
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
                  : "ring-warning"; // pending (default)
              return (
                <span
                  key={a.id}
                  className={cn("inline-block rounded-full ring-2", ring)}
                  title={`${s.name} — ${a.status === "accepted" ? "accepted" : "awaiting response"}`}
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
    [byDate, staff, pointId],
  );

  const renderDayDialogSection = useCallback(
    (iso: string) => {
      if (!pointId) return null;
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
                const on = assigned.some((a) => a.rental_staff_id === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void handleToggle(iso, s.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors",
                      on
                        ? "bg-primary/15 border-primary/40 text-primary hover:bg-primary/20"
                        : "bg-card border-border hover:bg-accent",
                    )}
                  >
                    <Avatar
                      name={s.name}
                      initials={s.avatar}
                      size="sm"
                      className="!h-4 !w-4 text-[8px]"
                    />
                    <span className="truncate max-w-32">{s.name}</span>
                    {on ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Plus className="h-3 w-3 opacity-60" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byDate, staff, pointId],
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
                <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                  Edit
                </Button>
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
    </Dialog>
  );
}
