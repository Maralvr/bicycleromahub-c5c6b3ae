import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRentalPoints } from "@/lib/rental-points";
import { useLiveStaff } from "@/lib/live-staff";
import type { LiveShift, LiveShiftInput } from "@/lib/live-shifts";

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
        notes: initial.notes ?? "",
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
    } else {
      setForm(empty);
      setTagsText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit shift" : "New shift"}</DialogTitle>
          <DialogDescription>Manual booking — assigned to a rental point and optionally a guide.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {initial?.source === "bokun" && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
              <div className="font-medium text-foreground">Bokun references</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
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
              <Label>Rental point</Label>
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
              <Label>Assigned guide</Label>
              <Select value={form.assigned_staff_id ?? NONE_VALUE} onValueChange={(v) => setForm({ ...form, assigned_staff_id: v === NONE_VALUE ? null : v, status: v === NONE_VALUE ? "unassigned" : "pending" })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Unassigned</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} <span className="text-muted-foreground">· {s.role}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sh-meet">Meeting point details</Label>
            <Input id="sh-meet" value={form.meeting_point ?? ""} onChange={(e) => setForm({ ...form, meeting_point: e.target.value })} placeholder="Override or extra details" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sh-cname">Customer name</Label>
              <Input id="sh-cname" value={form.customer_name ?? ""} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sh-cphone">Customer phone</Label>
              <Input id="sh-cphone" value={form.customer_phone ?? ""} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} placeholder="+39 …" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {([
              ["adults", "Adults"],
              ["teens", "Teens"],
              ["infants", "Infants"],
              ["trailers", "Trailers"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form[key] ?? 0}
                  onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) || 0 })}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sh-rate">Rate (€)</Label>
              <Input id="sh-rate" type="number" step="0.01" value={form.rate ?? ""} onChange={(e) => setForm({ ...form, rate: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sh-tags">Required tags (comma-separated)</Label>
              <Input id="sh-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="e-bike, Vatican tour" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sh-notes">Notes</Label>
            <Textarea id="sh-notes" rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything the guide should know." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : initial ? "Save changes" : "Create shift"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
