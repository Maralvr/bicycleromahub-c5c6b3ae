import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/avatar";
import { BookingNotesThread } from "@/components/booking-notes-thread";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useRentalPoints } from "@/lib/rental-points";
import { useLiveStaff } from "@/lib/live-staff";
import { useStaffStore } from "@/lib/staff-store";
import { useShiftsStore } from "@/lib/shifts-store";
import { categorizeForAssignment } from "@/lib/staff-matcher";
import type { Shift } from "@/lib/mock-data";
import type { LiveShift, LiveShiftInput } from "@/lib/live-shifts";
import { Package, MapPin, Users, User, FileText, Sparkles, Ban, CheckCircle2, AlertTriangle } from "lucide-react";
import { cleanNoteText } from "@/lib/notes-format";
import { setShiftNoShow } from "@/lib/no-show";

const NONE_VALUE = "__none";

type Props = {
  open: boolean;
  initial: LiveShift | null;
  onClose: () => void;
  onSubmit: (input: LiveShiftInput) => Promise<void>;
};

export function ShiftDialog({ open, initial, onClose, onSubmit }: Props) {
  const { points } = useRentalPoints();
  const { staff } = useLiveStaff();
  const { staff: richStaff } = useStaffStore();
  const { shifts: allShifts } = useShiftsStore();
  const { isAdmin } = useAuth();
  const assignedGuide = initial?.assigned_staff_id
    ? staff.find((s) => s.id === initial.assigned_staff_id) ?? null
    : null;

  const empty: LiveShiftInput = {
    tour_name: "",
    date: new Date().toISOString().slice(0, 10),
    start_time: "09:00",
    end_time: "12:00",
    meeting_point: "",
    rental_point_id: null,
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    adults: 0,
    teens: 0,
    infants: 0,
    trailers: 0,
    participants: [],
    rate: null,
    rate_title: "",
    notes: "",
    operations_notes: "",
    required_tags: [],
    assigned_staff_id: null,
    status: "unassigned",
    source: "manual",
  };

  const [form, setForm] = useState<LiveShiftInput>(empty);
  const [tagsText, setTagsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [noShow, setNoShow] = useState(false);
  const [noShowBusy, setNoShowBusy] = useState(false);

  // Build a Shift-shaped object from the current form for the matcher.
  const candidateShift = useMemo<Shift>(() => ({
    id: initial?.id ?? "__draft__",
    source: (form.source ?? "manual") as Shift["source"],
    bookingId: initial?.booking_id ?? null,
    tourName: form.tour_name || "",
    date: form.date,
    startTime: form.start_time,
    endTime: form.end_time,
    meetingPoint: form.meeting_point ?? "",
    customer: { name: form.customer_name ?? "", phone: form.customer_phone ?? "", email: form.customer_email ?? null },
    adults: form.adults ?? 0,
    teens: form.teens ?? 0,
    infants: form.infants ?? 0,
    trailers: form.trailers ?? 0,
    participants: form.participants ?? [],
    rate: form.rate ?? null,
    notes: form.notes ?? "",
    assignedStaffId: form.assigned_staff_id ?? null,
    status: form.status ?? "unassigned",
    requiredTags: form.required_tags ?? [],
  } as unknown as Shift), [form, initial]);

  const tiers = useMemo(
    () => categorizeForAssignment(candidateShift, richStaff, allShifts),
    [candidateShift, richStaff, allShifts],
  );
  const available = tiers.filter((c) => c.tier === "available");
  const requestable = tiers.filter((c) => c.tier === "requestable");
  const blocked = tiers.filter((c) => c.tier === "blocked");
  const blockedIds = new Set(blocked.map((c) => c.staff.id));

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        tour_name: initial.tour_name,
        date: initial.date,
        start_time: initial.start_time.slice(0, 5),
        end_time: initial.end_time.slice(0, 5),
        meeting_point: initial.meeting_point ?? "",
        rental_point_id: initial.rental_point_id,
        customer_name: initial.customer_name ?? "",
        customer_phone: initial.customer_phone ?? "",
        customer_email: initial.customer_email ?? "",
        adults: initial.adults,
        teens: initial.teens,
        infants: initial.infants,
        trailers: initial.trailers,
        participants: initial.participants ?? [],
        rate: initial.rate,
        rate_title: initial.rate_title ?? "",
        seller: initial.seller,
        booking_channel: initial.booking_channel,
        // Clean up already-corrupted notes (a raw serialized Bokun note
        // array stored as text, see notes-format.ts) so editing a shift
        // doesn't show/re-save the JSON blob verbatim.
        notes: cleanNoteText(initial.notes) ?? "",
        operations_notes: initial.operations_notes ?? "",
        required_tags: initial.required_tags,
        assigned_staff_id: initial.assigned_staff_id,
        status: initial.status,
        source: initial.source,
        booking_id: initial.booking_id,
        channel_booking_ref: initial.channel_booking_ref,
        external_booking_ref: initial.external_booking_ref,
      });
      setTagsText((initial.required_tags ?? []).join(", "));
      setNoShow(initial.no_show ?? false);
    } else {
      setForm(empty);
      setTagsText("");
      setNoShow(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const handleToggleNoShow = async () => {
    if (!initial) return;
    const next = !noShow;
    setNoShowBusy(true);
    try {
      const { error } = await setShiftNoShow(initial.id, next);
      if (error) {
        toast.error(next ? "Couldn't mark as no-show" : "Couldn't undo no-show", { description: error.message });
        return;
      }
      setNoShow(next);
      toast.success(next ? "Marked as no-show" : "No-show cleared", {
        description: next ? "Admins have been notified. This doesn't affect payouts." : undefined,
      });
    } finally {
      setNoShowBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tour_name.trim()) {
      toast.error("Tour name is required");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        tour_name: form.tour_name.trim(),
        meeting_point: form.meeting_point?.toString().trim() || null,
        customer_name: form.customer_name?.toString().trim() || null,
        customer_phone: form.customer_phone?.toString().trim() || null,
        customer_email: form.customer_email?.toString().trim() || null,
        rate_title: form.rate_title?.toString().trim() || null,
        notes: form.notes?.toString().trim() || null,
        operations_notes: form.operations_notes?.toString().trim() || null,
        required_tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const SectionHeader = ({
    icon: Icon,
    title,
    hint,
  }: {
    icon: typeof Package;
    title: string;
    hint?: string;
  }) => (
    <div className="flex items-baseline gap-2 border-b border-border/60 pb-1.5">
      <Icon className="h-4 w-4 text-primary self-center" />
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Booking details & assignment" : "New booking"}</DialogTitle>
          <DialogDescription>
            Every field can be overridden. Review the booking, then assign a guide, then add notes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-6">
          {/* ============ 1. BOOKING DETAILS ============ */}
          <section className="space-y-3">
            <SectionHeader icon={Package} title="Booking details" hint="Editable — any change saves on this booking." />

            {initial?.source === "bokun" && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-xs">
                <div className="font-medium text-foreground text-sm">Bokun references</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {initial.channel_booking_ref && (
                    <div><span className="text-muted-foreground">Booking ref. </span><span className="font-mono">{initial.channel_booking_ref}</span></div>
                  )}
                  {initial.booking_id && (
                    <div><span className="text-muted-foreground">Product booking ref. </span><span className="font-mono">{initial.booking_id}</span></div>
                  )}
                  {initial.external_booking_ref && (
                    <div><span className="text-muted-foreground">Ext. booking ref </span><span className="font-mono">{initial.external_booking_ref}</span></div>
                  )}
                  {initial.bokun_created_at && (
                    <div><span className="text-muted-foreground">Created </span>{new Date(initial.bokun_created_at).toLocaleString()}</div>
                  )}
                  {initial.seller && (
                    <div><span className="text-muted-foreground">Seller </span>{initial.seller}</div>
                  )}
                  {initial.booking_channel && (
                    <div><span className="text-muted-foreground">Channel </span>{initial.booking_channel}</div>
                  )}
                  <div><span className="text-muted-foreground">Ticket sent </span>{initial.ticket_sent ? "Yes" : "No"}</div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="sh-tour">Tour / activity *</Label>
              <Input id="sh-tour" value={form.tour_name} onChange={(e) => setForm({ ...form, tour_name: e.target.value })} placeholder="e.g. Colosseum E-Bike Tour" required />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sh-date">Date *</Label>
                <Input id="sh-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-start">Start *</Label>
                <Input id="sh-start" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-end">End *</Label>
                <Input id="sh-end" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Rental point</Label>
                <Select value={form.rental_point_id ?? NONE_VALUE} onValueChange={(v) => setForm({ ...form, rental_point_id: v === NONE_VALUE ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>—</SelectItem>
                    {points.filter((p) => p.active).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-meet">Meeting point details</Label>
                <Input id="sh-meet" value={form.meeting_point ?? ""} onChange={(e) => setForm({ ...form, meeting_point: e.target.value })} placeholder="Override or extra details" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sh-cname">Customer name</Label>
                <Input id="sh-cname" value={form.customer_name ?? ""} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-cphone">Customer phone</Label>
                <Input id="sh-cphone" value={form.customer_phone ?? ""} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} placeholder="+39 …" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-cmail">Customer email</Label>
                <Input id="sh-cmail" type="email" value={form.customer_email ?? ""} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Users className="h-3 w-3" /> Party</Label>
              <div className="grid grid-cols-4 gap-3">
                {([
                  ["adults", "Adults"],
                  ["teens", "Teens"],
                  ["infants", "Infants"],
                  ["trailers", "Trailers"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form[key] ?? 0}
                      onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) || 0 })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sh-rate">Rate (€)</Label>
                <Input id="sh-rate" type="number" step="0.01" value={form.rate ?? ""} onChange={(e) => setForm({ ...form, rate: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-rate-title">Rate name</Label>
                <Input id="sh-rate-title" value={form.rate_title ?? ""} onChange={(e) => setForm({ ...form, rate_title: e.target.value })} placeholder="e.g. Public tour in Spanish" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-tags">Required tags</Label>
                <Input id="sh-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="e-bike, Vatican tour" />
              </div>
            </div>

            {(form.participants?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label>Participants</Label>
                <div className="rounded-md border divide-y text-sm">
                  {form.participants!.map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5">
                      <span>{p.name}</span>
                      <span className="text-muted-foreground text-xs">{p.category}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ============ 2. ASSIGNMENT ============ */}
          <section className="space-y-3">
            <SectionHeader icon={User} title="Assignment" hint="Pick the guide who should run this booking." />

            {/* AI-tiered suggestions */}
            {richStaff.length > 0 && (
              <div className="rounded-lg border bg-card p-3 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Suggested guides for {form.date} {form.start_time}–{form.end_time}
                </div>

                {/* Available */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-success">
                    <CheckCircle2 className="h-3 w-3" /> Available ({available.length})
                  </div>
                  {available.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground italic">No guides are clearly available for this slot.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {available.slice(0, 6).map((c) => {
                        const picked = form.assigned_staff_id === c.staff.id;
                        return (
                          <button
                            key={c.staff.id}
                            type="button"
                            onClick={() => setForm({ ...form, assigned_staff_id: c.staff.id, status: "pending" })}
                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${picked ? "bg-success/15 border-success text-success-foreground" : "bg-success/5 border-success/30 hover:bg-success/10"}`}
                            title={c.reasons.join(" · ") || "Best fit"}
                          >
                            <Avatar name={c.staff.name} initials={c.staff.avatar} imageUrl={c.staff.avatarUrl} size="sm" />
                            <span className="font-medium">{c.staff.name}</span>
                            <Badge variant="outline" className="h-4 px-1 text-[9px]">{Math.round(c.score)}</Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Requestable */}
                {requestable.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-warning">
                      <AlertTriangle className="h-3 w-3" /> Requestable ({requestable.length})
                      <span className="text-muted-foreground font-normal">— no submitted availability or partial conflict</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {requestable.slice(0, 6).map((c) => {
                        const picked = form.assigned_staff_id === c.staff.id;
                        return (
                          <button
                            key={c.staff.id}
                            type="button"
                            onClick={() => setForm({ ...form, assigned_staff_id: c.staff.id, status: "pending" })}
                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${picked ? "bg-warning/15 border-warning" : "bg-card border-warning/30 hover:bg-warning/5"}`}
                            title={c.warnings.join(" · ")}
                          >
                            <Avatar name={c.staff.name} initials={c.staff.avatar} imageUrl={c.staff.avatarUrl} size="sm" />
                            <span className="font-medium">{c.staff.name}</span>
                            <Badge variant="outline" className="h-4 px-1 text-[9px]">{Math.round(c.score)}</Badge>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Blocked */}
                {blocked.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Ban className="h-3 w-3" /> Blocked ({blocked.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {blocked.slice(0, 6).map((c) => (
                        <span
                          key={c.staff.id}
                          className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground opacity-60 cursor-not-allowed line-through"
                          title={c.blockedReason ?? "Marked off"}
                        >
                          <Avatar name={c.staff.name} initials={c.staff.avatar} imageUrl={c.staff.avatarUrl} size="sm" />
                          <span>{c.staff.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-lg border bg-primary/[0.03] p-3 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[220px] space-y-1.5">
                  <Label className="text-xs">Assigned guide</Label>
                  <Select
                    value={form.assigned_staff_id ?? NONE_VALUE}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        assigned_staff_id: v === NONE_VALUE ? null : v,
                        status: v === NONE_VALUE ? "unassigned" : "pending",
                      })
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>— Unassigned —</SelectItem>
                      {staff.map((s) => {
                        const isBlocked = blockedIds.has(s.id);
                        return (
                          <SelectItem key={s.id} value={s.id} disabled={isBlocked}>
                            {s.name} <span className="text-muted-foreground">· {s.role}</span>
                            {isBlocked && <span className="text-destructive ml-1">· off</span>}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {form.status}
                  </Badge>
                  {noShow && (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold border-destructive/40 text-destructive bg-destructive/5 flex items-center gap-1">
                      <Ban className="h-2.5 w-2.5" /> No-show
                    </Badge>
                  )}
                  {assignedGuide && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <Avatar name={assignedGuide.name} initials={assignedGuide.avatar} imageUrl={richStaff.find((s) => s.id === assignedGuide.id)?.avatarUrl} size="sm" />
                      <span className="font-medium">{assignedGuide.name}</span>
                    </div>
                  )}
                </div>
              </div>
              {form.assigned_staff_id && form.status === "pending" && (
                <p className="text-[11px] text-muted-foreground">
                  Saving will send a pending request to this guide. They have 2 hours to accept or reject.
                </p>
              )}
              {initial?.id && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-[11px] text-muted-foreground">
                    Customer didn't show up? This is a status label only — it doesn't affect payouts.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={noShowBusy}
                    onClick={handleToggleNoShow}
                    className={noShow ? "shrink-0" : "shrink-0 border-destructive/40 text-destructive hover:bg-destructive/5"}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" /> {noShow ? "Undo no-show" : "Mark no-show"}
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* ============ 3. NOTES & ATTACHMENTS ============ */}
          <section className="space-y-3">
            <SectionHeader icon={FileText} title="Notes & attachments" hint="Visible to the assigned guide and other admins." />

            <div className="space-y-1.5">
              <Label htmlFor="sh-notes">Note for booking</Label>
              <Textarea id="sh-notes" rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything the guide should know." />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sh-ops-notes">Note to appear on operations reports</Label>
              <Textarea id="sh-ops-notes" rows={2} value={form.operations_notes ?? ""} onChange={(e) => setForm({ ...form, operations_notes: e.target.value })} placeholder="Internal operations note" />
            </div>

            {initial?.id && (
              <BookingNotesThread shiftId={initial.id} canPost={isAdmin} compact />
            )}
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : initial ? "Save changes" : "Create shift"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
