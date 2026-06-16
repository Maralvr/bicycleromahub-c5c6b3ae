import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, X, UserPlus, Users2, ChevronDown, ChevronRight } from "lucide-react";
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
};

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function RentalStaffPanel({
  pointId,
  dates,
}: {
  pointId: string;
  dates: string[]; // upcoming dates with bookings, sorted ascending
}) {
  const list = useServerFn(listRentalStaff);
  const listA = useServerFn(listAssignmentsForPoint);
  const assign = useServerFn(assignRentalStaff);
  const unassign = useServerFn(unassignRentalStaff);
  const upsert = useServerFn(upsertRentalStaff);

  const [staff, setStaff] = useState<RentalStaff[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(true);
  const [showRoster, setShowRoster] = useState(false);

  const range = useMemo(() => {
    if (dates.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      return { from: today, to: today };
    }
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [dates]);

  const reload = async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        list(),
        listA({ data: { pointId, from: range.from, to: range.to } }),
      ]);
      setStaff(s.staff as RentalStaff[]);
      setAssignments(a.assignments as Assignment[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load rental staff");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointId, range.from, range.to]);

  const byDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      map.set(a.date, [...(map.get(a.date) ?? []), a]);
    }
    return map;
  }, [assignments]);

  const handleAssign = async (date: string, staffId: string) => {
    try {
      await assign({ data: { pointId, staffId, date } });
      await reload();
      toast.success("Assigned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign");
    }
  };

  const handleUnassign = async (id: string) => {
    try {
      await unassign({ data: { id } });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unassign");
    }
  };

  return (
    <Card className="p-4 mb-4 border-border/60">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-left hover:opacity-80"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <Users2 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Rental-point staff on duty</h3>
        </button>
        {!collapsed && (
          <Button size="sm" variant="outline" onClick={() => setShowRoster(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Manage roster
          </Button>
        )}
      </div>

      {!collapsed && (
        loading ? (
          <div className="text-xs text-muted-foreground py-2">Loading…</div>
        ) : dates.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">
            No upcoming bookings on this point yet.
          </div>
        ) : (
          <div className="grid gap-2">
            {dates.slice(0, 30).map((date) => {
              const assigned = byDate.get(date) ?? [];
              const remaining = staff.filter(
                (s) => s.active && !assigned.some((a) => a.rental_staff_id === s.id),
              );
              return (
                <div
                  key={date}
                  className="flex items-center gap-2 flex-wrap py-1.5 border-b border-border/40 last:border-b-0"
                >
                  <span className="text-xs font-medium text-foreground w-28 shrink-0">
                    {fmtDate(date)}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap flex-1">
                    {assigned.map((a) => {
                      const s = staff.find((x) => x.id === a.rental_staff_id);
                      if (!s) return null;
                      return (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary pl-1 pr-2 py-0.5 text-xs"
                        >
                          <Avatar name={s.name} initials={s.avatar} size="sm" className="!h-4 !w-4 text-[8px]" />
                          {s.name}
                          <button
                            onClick={() => handleUnassign(a.id)}
                            className="ml-0.5 hover:text-destructive"
                            aria-label="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          disabled={remaining.length === 0}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-1" align="start">
                        {remaining.length === 0 ? (
                          <div className="text-xs text-muted-foreground p-2">
                            {staff.length === 0 ? "Add staff to the roster first." : "All staff already assigned."}
                          </div>
                        ) : (
                          remaining.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => handleAssign(date, s.id)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent rounded-sm text-left"
                            >
                              <Avatar name={s.name} initials={s.avatar} size="sm" className="!h-5 !w-5 text-[9px]" />
                              <span className="truncate">{s.name}</span>
                            </button>
                          ))
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

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
    </Card>
  );
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
            People who work at the rental points. They sign in with their email and see the days they're scheduled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-auto">
          {staff.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">No staff yet.</div>
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
              <Label htmlFor="rs-name" className="text-xs">Name *</Label>
              <Input id="rs-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label htmlFor="rs-email" className="text-xs">Email (for sign-in)</Label>
              <Input id="rs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label htmlFor="rs-phone" className="text-xs">Phone</Label>
              <Input id="rs-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" />
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
