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
  shift_start_time: string | null;
  shift_end_time: string | null;
  notes: string | null;
  status: "pending" | "accepted" | "rejected" | "cancelled" | null;
  pending_expires_at: string | null;
  rejection_reason: string | null;
};

type ShiftRate = {
  rental_staff_id: string;
  shift_start_time: string;
  shift_end_time: string;
  amount: number;
};

/** Double-shift day pay config (applies to every rental staff member). */
type FlatRate = {
  id: string;
  double_shift_rate: number | null;
  double_shift_season_start: string | null;
  double_shift_season_end: string | null;
};



/** Season bounds are MM-DD text compared month/day only, so they recur yearly. */
const inSeason = (iso: string, start: string | null, end: string | null) => {
  if (!start || !end) return false;
  const md = iso.slice(5, 10);
  return start <= end ? md >= start && md <= end : md >= start || md <= end;
};

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);
const rangeLabel = (a: { shift_start_time: string | null; shift_end_time: string | null }) =>
  a.shift_start_time || a.shift_end_time
    ? `${hhmm(a.shift_start_time) ?? "?"}–${hhmm(a.shift_end_time) ?? "?"}`
    : null;



/**
 * Hook for integrating rental-point staff assignment into the existing
 * shifts calendar. Returns:
 *   - renderDayOverlay(iso): avatar stack to display in each day cell
 *   - renderDayDialogSection(iso): assignment toggles for the day-details dialog
 *   - ManageRosterButton: button + dialog to edit the staff roster
 */
export function useRentalStaffBridge(
  pointId: string | null,
  enabled = true,
  /** Dates (yyyy-mm-dd) that have bookings at this point. Days with no
   *  bookings need no coverage, so the calendar dot is hidden for them. */
  bookingDates?: Set<string>,
) {

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
  const [shiftRates, setShiftRates] = useState<ShiftRate[]>([]);
  const [flatRates, setFlatRates] = useState<FlatRate[]>([]);

  /**
   * False until the per-staff time-range rates have actually been read.
   * Guards the assign click: if we can't prove whether someone is paid by
   * time range, we must NOT quietly assign them with no time recorded.
   */
  const [ratesReady, setRatesReady] = useState(false);
  /** "<staffId>|<iso>" — which staff pill has its time quick-picker open. */
  const [picking, setPicking] = useState<string | null>(null);



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
      const [s, a, u, r, f] = await Promise.all([
        list(),
        listA({ data: { pointId, from, to } }),
        // Any unavailability entry (all-day or partial) is worth surfacing
        // to the admin -- a partial-day busy window still overlaps whatever
        // hours the rental point needs covering that day.
        supabase
          .from("rental_staff_unavailability" as never)
          .select("rental_staff_id, date, all_day, from_time, to_time")
          .gte("date", from)
          .lte("date", to),
        // Per-staff paid time ranges: staff who have these get quick-pick
        // shift times (their pay depends on the range); staff with no
        // don't need a time range at all.
        supabase
          .from("rental_staff_shift_rates" as never)
          .select("rental_staff_id, shift_start_time, shift_end_time, amount"),
        // Double-shift day pay config (applies to everyone).
        // quick-picks so a double-shift day can actually be recorded.
        supabase
          .from("rental_staff" as never)
          .select(
            "id, double_shift_rate, double_shift_season_start, double_shift_season_end",
          ),
      ]);
      setStaff(s.staff as RentalStaff[]);
      setAssignments(a.assignments as Assignment[]);
      if (f.error) {
        toast.error(`Couldn't load flat pay rates: ${f.error.message}`);
        setFlatRates([]);
      } else {
        setFlatRates((f.data ?? []) as unknown as FlatRate[]);
      }
      if (r.error) {
        // Never assume "no rates" on a failed read -- that silently assigns
        // time-range-paid staff with no shift time, which computes as EUR 0
        // in the payout view.
        toast.error(`Couldn't load pay rates: ${r.error.message}`);
        setShiftRates([]);
        setRatesReady(false);
      } else {
        setShiftRates((r.data ?? []) as unknown as ShiftRate[]);
        setRatesReady(true);
      }



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

  /** Paid time ranges configured for a staff member. */
  const ratesFor = useCallback(
    (staffId: string) =>
      shiftRates
        .filter((r) => r.rental_staff_id === staffId)
        .sort((a, b) => a.shift_end_time.localeCompare(b.shift_end_time)),
    [shiftRates],
  );

  /** Double-shift day pay config for a staff member (null when not set). */
  const flatFor = useCallback(
    (staffId: string) => flatRates.find((f) => f.id === staffId) ?? null,
    [flatRates],
  );


  const addAssignment = async (
    date: string,
    staffId: string,
    startTime?: string | null,
    endTime?: string | null,
  ) => {
    if (!pointId) return;
    const conflict = unavailableByKey.get(`${staffId}|${date}`);
    if (conflict) {
      const name = staff.find((s) => s.id === staffId)?.name ?? "This person";
      const detail = conflict.allDay
        ? "marked the whole day off"
        : `marked themselves busy ${conflict.from ?? "?"}–${conflict.to ?? "?"}`;
      if (!confirm(`${name} ${detail} on ${date}. Assign anyway?`)) return;
    }
    try {
      await assign({ data: { pointId, staffId, date, startTime, endTime } });
      setPicking(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const removeAssignment = async (id: string) => {
    try {
      await unassign({ data: { id } });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  };


  /**
   * Calendar-grid coverage indicator (one dot per day cell). Deliberately
   * minimal: the full per-person roster stays in the day dialog. Colors match
   * the app's status language (success/warning/destructive).
   *   green  = bookings + at least one accepted assignment
   *   amber  = bookings + assignments, none accepted yet
   *   red    = bookings + nobody assigned (real coverage gap)
   *   none   = no bookings that day at this point -> nothing to cover
   */
  const renderDayOverlay = useCallback(
    (iso: string) => {
      if (!pointId || !enabled) return null;
      const hasBookings = bookingDates ? bookingDates.has(iso) : true;
      if (!hasBookings) return null;

      const assigned = (byDate.get(iso) ?? []).filter((a) => a.status !== "rejected" && a.status !== "cancelled");
      const nameOf = (id: string) => staff.find((x) => x.id === id)?.name ?? "Unknown";
      const accepted = assigned.filter((a) => a.status === "accepted");
      const pending = assigned.filter((a) => a.status !== "accepted");

      const state =
        accepted.length > 0 ? "covered" : assigned.length > 0 ? "pending" : "uncovered";
      const dot =
        state === "covered" ? "bg-success" : state === "pending" ? "bg-warning" : "bg-destructive";
      const label =
        state === "covered"
          ? `Covered — accepted: ${accepted.map((a) => nameOf(a.rental_staff_id)).join(", ")}${
              pending.length
                ? ` · awaiting: ${pending.map((a) => nameOf(a.rental_staff_id)).join(", ")}`
                : ""
            }`
          : state === "pending"
            ? `Awaiting response — ${pending.map((a) => nameOf(a.rental_staff_id)).join(", ")}`
            : "Uncovered — no rental staff assigned";

      return (
        <div className="flex items-center" title={label} aria-label={label}>
          <span className={cn("h-2 w-2 rounded-full", dot)} />
        </div>
      );
    },
    [byDate, staff, pointId, enabled, bookingDates],
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
            <div className="space-y-2">
              {/* Existing assignments — one chip per assignment, so the same
                  person can hold two shifts on one day (different ranges). */}
              {assigned.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {assigned.map((a) => {
                    const s = staff.find((x) => x.id === a.rental_staff_id);
                    const status = a.status ?? null;
                    const reason = a.rejection_reason ?? null;
                    const conflict = unavailableByKey.get(`${a.rental_staff_id}|${iso}`);
                    const tone =
                      status === "accepted"
                        ? "bg-success/15 border-success/40 text-success-foreground hover:bg-success/20"
                        : status === "rejected" || status === "cancelled"
                          ? "bg-destructive/15 border-destructive/40 text-destructive hover:bg-destructive/20"
                          : "bg-warning/15 border-warning/40 text-warning-foreground hover:bg-warning/20";
                    const range = rangeLabel(a);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => void removeAssignment(a.id)}
                        title={
                          status === "rejected"
                            ? `Rejected${reason ? `: ${reason}` : ""} — click to clear`
                            : "Click to unassign"
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors",
                          tone,
                        )}
                      >
                        <Avatar
                          name={s?.name ?? "?"}
                          initials={s?.avatar ?? "?"}
                          size="sm"
                          className="!h-4 !w-4 text-[8px]"
                        />
                        <span className="truncate max-w-32">{s?.name ?? "Unknown"}</span>
                        {range && (
                          <span className="text-[10px] font-medium tabular-nums opacity-80">
                            {range}
                          </span>
                        )}
                        {status === "accepted" && (
                          <span className="text-[9px] font-bold uppercase tracking-wider">✓</span>
                        )}
                        {status && status !== "accepted" && (
                          <span className="text-[9px] font-bold uppercase tracking-wider">
                            {status}
                          </span>
                        )}
                        {!!conflict && (
                          <AlertTriangle
                            className="h-3 w-3 text-destructive shrink-0"
                            aria-label="Marked unavailable this day"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Add someone. Everyone gets the shift time-range quick-picks. */}
              <div className="flex flex-wrap gap-1.5">
                {active.map((s) => {
                  const rates = ratesFor(s.id);
                  const flat = flatFor(s.id);
                  const alreadyToday = (byDate.get(iso) ?? []).filter(
                    (a) =>
                      a.rental_staff_id === s.id &&
                      a.status !== "rejected" &&
                      a.status !== "cancelled",
                  ).length;
                  // Double-shift day: a 2nd shift inside the season window pays
                  // the double-shift amount instead of the summed ranges.
                  const seasonal =
                    flat != null &&
                    inSeason(iso, flat.double_shift_season_start, flat.double_shift_season_end) &&
                    flat.double_shift_rate != null;
                  const key = `${s.id}|${iso}`;
                  const open = picking === key;
                  const conflict = unavailableByKey.get(key);
                  const hasPicker = rates.length > 0;
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (!ratesReady) {
                            toast.error("Pay rates haven't loaded yet — try again in a moment.");
                            return;
                          }
                          if (hasPicker) setPicking(open ? null : key);
                          else void addAssignment(iso, s.id, null, null);
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors",
                          conflict
                            ? "bg-destructive/10 border-destructive/30 hover:bg-destructive/15"
                            : "bg-card border-border hover:bg-accent",
                          open && "ring-1 ring-primary",
                        )}
                        title={
                          conflict
                            ? conflict.allDay
                              ? `${s.name} marked the whole day off`
                              : `${s.name} marked themselves busy ${conflict.from ?? "?"}–${conflict.to ?? "?"}`
                            : hasPicker
                              ? "Pick a shift time"
                              : "Assign this day"
                        }
                      >
                        <Avatar
                          name={s.name}
                          initials={s.avatar}
                          size="sm"
                          className="!h-4 !w-4 text-[8px]"
                        />
                        <span className="truncate max-w-32">{s.name}</span>
                        {!!conflict && (
                          <AlertTriangle
                            className="h-3 w-3 text-destructive shrink-0"
                            aria-label="Marked unavailable this day"
                          />
                        )}
                        <Plus className="h-3 w-3 opacity-60" />
                      </button>
                      {open &&
                        rates.map((r) => (
                          <button
                            key={`${r.shift_start_time}-${r.shift_end_time}`}
                            type="button"
                            onClick={() =>
                              void addAssignment(
                                iso,
                                s.id,
                                hhmm(r.shift_start_time),
                                hhmm(r.shift_end_time),
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] tabular-nums hover:bg-primary/20"
                          >
                            {hhmm(r.shift_start_time)}–{hhmm(r.shift_end_time)}
                            {/* Fixed-salary staff have 0-amount ranges: the time
                                range is recorded, but there's nothing to pay. */}
                            {Number(r.amount) > 0 && (
                              <span className="opacity-70">€{Number(r.amount)}</span>
                            )}
                          </button>
                        ))}
                      {open && alreadyToday >= 1 && seasonal && (
                        <span className="text-[10px] text-muted-foreground">
                          Double-shift day → €{Number(flat!.double_shift_rate)} total
                        </span>
                      )}
                      {open && (
                        <button
                          type="button"
                          onClick={() => void addAssignment(iso, s.id, null, null)}
                          className="rounded-full border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent"
                        >
                          No time
                        </button>
                      )}
                    </div>
                  );
                })}

              </div>
            </div>
          )}

        </div>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byDate, staff, pointId, enabled, unavailableByKey, ratesFor, flatFor, ratesReady, picking],
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
