import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
  Plus,
  X,
  UserPlus,
  Users2,
  ChevronDown,
  ChevronRight,
  Check,
  CalendarDays,
} from "lucide-react";
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

export type DayInfo = { date: string; count: number };

function parseDate(iso: string) {
  return new Date(iso + "T00:00:00");
}

function fmtDay(iso: string) {
  return parseDate(iso).toLocaleDateString(undefined, { weekday: "short" });
}

function fmtNum(iso: string) {
  return parseDate(iso).getDate();
}

function fmtMonth(iso: string) {
  return parseDate(iso).toLocaleDateString(undefined, { month: "short" });
}

function fmtFull(iso: string) {
  return parseDate(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function isToday(iso: string) {
  return iso === new Date().toISOString().slice(0, 10);
}

export function RentalStaffPanel({
  pointId,
  dates,
}: {
  pointId: string;
  dates: DayInfo[] | string[];
}) {
  // Backward compat: accept string[] or {date,count}[]
  const days: DayInfo[] = useMemo(
    () =>
      (dates as Array<string | DayInfo>).map((d) =>
        typeof d === "string" ? { date: d, count: 0 } : d,
      ),
    [dates],
  );

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
  const [openDate, setOpenDate] = useState<string | null>(null);

  const range = useMemo(() => {
    if (days.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      return { from: today, to: today };
    }
    return { from: days[0].date, to: days[days.length - 1].date };
  }, [days]);

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

  const handleToggle = async (date: string, staffId: string) => {
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

  const totalAssigned = assignments.length;
  const daysWithStaff = byDate.size;
  const daysMissing = days.filter((d) => !(byDate.get(d.date)?.length)).length;

  const visibleDays = days.slice(0, 21);
  const openDay = openDate ? days.find((d) => d.date === openDate) : null;
  const openDayAssigned = openDate ? byDate.get(openDate) ?? [] : [];

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
          <h3 className="font-semibold text-foreground text-sm">
            Rental-point staff on duty
          </h3>
          {collapsed && days.length > 0 && (
            <span className="text-[11px] text-muted-foreground ml-1">
              {daysMissing > 0
                ? `${daysMissing} day${daysMissing === 1 ? "" : "s"} need staff`
                : `All ${days.length} day${days.length === 1 ? "" : "s"} covered`}
            </span>
          )}
        </button>
        {!collapsed && (
          <Button size="sm" variant="outline" onClick={() => setShowRoster(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Manage roster
          </Button>
        )}
      </div>

      {!collapsed &&
        (loading ? (
          <div className="text-xs text-muted-foreground py-2">Loading…</div>
        ) : days.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">
            No upcoming bookings on this point yet.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {days.length} upcoming day{days.length === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span>
                {daysWithStaff}/{days.length} covered
              </span>
              <span>·</span>
              <span>{totalAssigned} assignments</span>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2.5">
              {visibleDays.map((d) => {
                const assigned = byDate.get(d.date) ?? [];
                const missing = assigned.length === 0;
                const today = isToday(d.date);
                const weekend = [0, 6].includes(parseDate(d.date).getDay());
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setOpenDate(d.date)}
                    className={cn(
                      "group relative flex flex-col items-stretch overflow-hidden rounded-xl border text-left transition-all duration-200",
                      "hover:-translate-y-0.5 hover:shadow-md",
                      missing
                        ? "border-dashed border-border bg-card hover:border-primary/50 hover:bg-primary/[0.02]"
                        : "border-transparent bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm hover:shadow-primary/20",
                      today && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                    )}
                  >
                    {/* Top accent bar — status at a glance */}
                    <div
                      className={cn(
                        "h-1 w-full",
                        missing
                          ? "bg-muted"
                          : "bg-gradient-to-r from-primary to-primary/60",
                      )}
                    />

                    <div className="flex flex-col gap-2 p-2.5">
                      {/* Date block */}
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex flex-col leading-none">
                          <span
                            className={cn(
                              "text-[10px] uppercase tracking-wider font-semibold",
                              today
                                ? "text-primary"
                                : weekend
                                  ? "text-foreground/60"
                                  : "text-muted-foreground",
                            )}
                          >
                            {today ? "Today" : fmtDay(d.date)}
                          </span>
                          <span className="mt-0.5 text-2xl font-bold tabular-nums text-foreground leading-none tracking-tight">
                            {fmtNum(d.date)}
                          </span>
                          <span className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                            {fmtMonth(d.date)}
                          </span>
                        </div>

                        {d.count > 0 && (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums",
                              missing
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                : "bg-primary/15 text-primary",
                            )}
                            title={`${d.count} booking${d.count === 1 ? "" : "s"}`}
                          >
                            {d.count}
                          </span>
                        )}
                      </div>

                      {/* Staff row */}
                      <div className="flex items-center min-h-6 pt-1.5 border-t border-border/50">
                        {assigned.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground group-hover:text-primary transition-colors">
                            <Plus className="h-3 w-3" /> Assign staff
                          </span>
                        ) : (
                          <>
                            <div className="flex -space-x-1.5">
                              {assigned.slice(0, 3).map((a) => {
                                const s = staff.find(
                                  (x) => x.id === a.rental_staff_id,
                                );
                                if (!s) return null;
                                return (
                                  <Avatar
                                    key={a.id}
                                    name={s.name}
                                    initials={s.avatar}
                                    size="sm"
                                    className="!h-6 !w-6 text-[9px] ring-2 ring-background"
                                  />
                                );
                              })}
                              {assigned.length > 3 && (
                                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/20 text-primary text-[9px] font-semibold ring-2 ring-background">
                                  +{assigned.length - 3}
                                </span>
                              )}
                            </div>
                            <span className="ml-auto text-[10px] font-medium text-primary">
                              {assigned.length} on duty
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>


            {days.length > visibleDays.length && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                + {days.length - visibleDays.length} more day
                {days.length - visibleDays.length === 1 ? "" : "s"} not shown
              </div>
            )}
          </>
        ))}

      <DayAssignDialog
        open={!!openDate}
        onClose={() => setOpenDate(null)}
        date={openDate}
        bookingCount={openDay?.count ?? 0}
        staff={staff}
        assigned={openDayAssigned}
        onToggle={(staffId) => {
          if (openDate) void handleToggle(openDate, staffId);
        }}
        onManageRoster={() => {
          setOpenDate(null);
          setShowRoster(true);
        }}
      />

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

function DayAssignDialog({
  open,
  onClose,
  date,
  bookingCount,
  staff,
  assigned,
  onToggle,
  onManageRoster,
}: {
  open: boolean;
  onClose: () => void;
  date: string | null;
  bookingCount: number;
  staff: RentalStaff[];
  assigned: Assignment[];
  onToggle: (staffId: string) => void | Promise<void>;
  onManageRoster: () => void;
}) {
  const active = staff.filter((s) => s.active);
  const isAssigned = (id: string) =>
    assigned.some((a) => a.rental_staff_id === id);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{date ? fmtFull(date) : "Assign staff"}</DialogTitle>
          <DialogDescription>
            {bookingCount > 0
              ? `${bookingCount} booking${bookingCount === 1 ? "" : "s"} on this day. Tap a staff member to toggle.`
              : "Tap a staff member to toggle their assignment."}
          </DialogDescription>
        </DialogHeader>

        {active.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            No staff in the roster yet.
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={onManageRoster}>
                <UserPlus className="h-4 w-4 mr-1" /> Add staff
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-auto">
            {active.map((s) => {
              const on = isAssigned(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onToggle(s.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md border text-left transition-colors",
                    on
                      ? "bg-primary/10 border-primary/40 hover:bg-primary/15"
                      : "border-border/60 hover:bg-accent",
                  )}
                >
                  <Avatar name={s.name} initials={s.avatar} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {s.name}
                    </div>
                    {(s.email || s.phone) && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {s.email || s.phone}
                      </div>
                    )}
                  </div>
                  {on ? (
                    <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                      <Check className="h-3.5 w-3.5" /> On duty
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Plus className="h-3.5 w-3.5" /> Assign
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onManageRoster}>
            <UserPlus className="h-4 w-4 mr-1" /> Manage roster
          </Button>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
