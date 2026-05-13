import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Shift } from "@/lib/mock-data";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: Omit<Shift, "id" | "guideNotes">) => Promise<void> | void;
};

export function ManualShiftDialog({ open, onOpenChange, onSubmit }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [tourName, setTourName] = useState("");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [adults, setAdults] = useState(1);
  const [teens, setTeens] = useState(0);
  const [infants, setInfants] = useState(0);
  const [trailers, setTrailers] = useState(0);
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTourName(""); setDate(today); setStartTime("09:00"); setEndTime("12:00");
    setMeetingPoint(""); setCustomerName(""); setCustomerPhone("");
    setAdults(1); setTeens(0); setInfants(0); setTrailers(0); setRate(""); setNotes("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tourName.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        source: "manual",
        tourName: tourName.trim(),
        date,
        startTime,
        endTime,
        meetingPoint: meetingPoint.trim(),
        customer: customerName || customerPhone ? { name: customerName || "—", phone: customerPhone || "—" } : undefined,
        participants: { adults, teens, infants, trailers },
        rate: rate ? Number(rate) : undefined,
        notes: notes.trim() || undefined,
        assignedStaffId: null,
        status: "unassigned",
        requiredTags: [],
      });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New manual shift</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tourName">Tour name</Label>
            <Input id="tourName" value={tourName} onChange={(e) => setTourName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start">Start</Label>
              <Input id="start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">End</Label>
              <Input id="end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meet">Meeting point</Label>
            <Input id="meet" value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cn">Customer name</Label>
              <Input id="cn" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp">Customer phone</Label>
              <Input id="cp" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ad">Adults</Label>
              <Input id="ad" type="number" min={0} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="te">Teens</Label>
              <Input id="te" type="number" min={0} value={teens} onChange={(e) => setTeens(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in">Infants</Label>
              <Input id="in" type="number" min={0} value={infants} onChange={(e) => setInfants(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr">Trailers</Label>
              <Input id="tr" type="number" min={0} value={trailers} onChange={(e) => setTrailers(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate">Rate (€)</Label>
            <Input id="rate" type="number" step="0.01" min={0} value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Create shift"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
