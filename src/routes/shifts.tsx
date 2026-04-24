import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader, StatusPill } from "@/components/page-header";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { shifts as initialShifts, staff, Shift } from "@/lib/mock-data";
import { mapBokunBookingToShift, sampleBokunPayloads } from "@/lib/bokun-mapper";
import { suggestStaffForShift, StaffSuggestion } from "@/lib/staff-matcher";
import { Plus, Copy, MapPin, Users, Sparkles, Clock, CheckCircle2, XCircle, ExternalLink, Euro, Webhook, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/shifts")({
  head: () => ({
    meta: [
      { title: "Shifts — eBicycle Roma" },
      { name: "description", content: "Bokun-synced bookings and manual shift assignments." },
    ],
  }),
  component: ShiftsPage,
});

function ShiftsPage() {
  const { t } = useI18n();
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);

  const updateStatus = (id: string, status: Shift["status"]) => {
    setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    toast.success(`Shift ${status}`);
  };

  const assignStaff = (shiftId: string, staffId: string, staffName: string) => {
    setShifts((prev) =>
      prev.map((s) => (s.id === shiftId ? { ...s, assignedStaffId: staffId, status: "pending" } : s)),
    );
    toast.success(`Assigned to ${staffName}`, { description: "Awaiting their accept/reject." });
  };

  const duplicate = (s: Shift) => {
    setShifts((prev) => [...prev, { ...s, id: `${s.id}-copy-${Date.now()}`, status: "unassigned", assignedStaffId: null }]);
    toast.success("Shift duplicated");
  };

  const simulateBokunBooking = () => {
    const payload = sampleBokunPayloads[Math.floor(Math.random() * sampleBokunPayloads.length)];
    const newShift = mapBokunBookingToShift(payload);
    const suggestions = suggestStaffForShift(newShift, staff, shifts, 1);
    setShifts((prev) => [newShift, ...prev]);
    toast.success(`Bokun booking received: ${payload.confirmationCode}`, {
      description: suggestions[0]
        ? `${payload.productTitle} — AI suggests ${suggestions[0].staff.name}.`
        : `${payload.productTitle} — no matching guide found.`,
    });
  };

  return (
    <AppShell>
      <PageHeader
        title={t.shifts.title}
        subtitle={t.shifts.subtitle}
        actions={
          <>
            <Button variant="outline" onClick={simulateBokunBooking}>
              <Webhook className="h-4 w-4 mr-1" /> Simulate Bokun booking
            </Button>
            <Button onClick={() => toast.success("Manual shift form would open")} className="shadow-[var(--shadow-elegant)]">
              <Plus className="h-4 w-4 mr-1" /> {t.shifts.newShift}
            </Button>
          </>
        }
      />

      <Tabs defaultValue="all" className="mb-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="all">{t.common.all}</TabsTrigger>
          <TabsTrigger value="bokun">{t.shifts.fromBokun}</TabsTrigger>
          <TabsTrigger value="manual">{t.shifts.manual}</TabsTrigger>
          <TabsTrigger value="mine">{t.shifts.myShifts}</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-5">
          <ShiftList shifts={shifts} allShifts={shifts} onAssign={assignStaff} onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
        </TabsContent>
        <TabsContent value="bokun" className="mt-5">
          <ShiftList shifts={shifts.filter((s) => s.source === "bokun")} allShifts={shifts} onAssign={assignStaff} onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
        </TabsContent>
        <TabsContent value="manual" className="mt-5">
          <ShiftList shifts={shifts.filter((s) => s.source === "manual")} allShifts={shifts} onAssign={assignStaff} onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
        </TabsContent>
        <TabsContent value="mine" className="mt-5">
          <ShiftList shifts={shifts.filter((s) => s.assignedStaffId === "s1")} allShifts={shifts} guideView onAssign={assignStaff} onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ShiftList({ shifts, onAccept, onReject, onDuplicate, guideView }: { shifts: Shift[]; onAccept: (id: string) => void; onReject: (id: string) => void; onDuplicate: (s: Shift) => void; guideView?: boolean }) {
  const { t } = useI18n();
  if (shifts.length === 0) return <div className="text-muted-foreground text-sm py-12 text-center border border-dashed border-border rounded-xl">No shifts yet.</div>;
  return (
    <div className="grid gap-4">
      {shifts.map((s) => {
        const guide = staff.find((p) => p.id === s.assignedStaffId);
        const suggested = !guide ? staff.find((p) => s.requiredTags.every((tag) => p.tags.includes(tag)) && p.status === "available") : null;
        const isUrgent = s.status === "unassigned" || s.status === "pending";

        return (
          <Card key={s.id} className={`p-0 overflow-hidden border-border/60 hover:shadow-[var(--shadow-card)] transition-all ${isUrgent ? "ring-1 ring-warning/20" : ""}`}>
            <div className="flex flex-col lg:flex-row">
              {/* Left time block */}
              <div className="lg:w-36 p-5 bg-gradient-to-br from-muted/40 to-transparent lg:border-r border-border/60 flex lg:flex-col items-center lg:items-start gap-4 lg:gap-2 justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">{s.date}</div>
                  <div className="text-2xl font-bold text-foreground flex items-center gap-1.5 mt-1">
                    <Clock className="h-4 w-4 text-primary" />
                    {s.startTime}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">→ {s.endTime}</div>
                </div>
                <Badge variant={s.source === "bokun" ? "default" : "outline"} className={`text-[9px] uppercase tracking-wider font-bold ${s.source === "bokun" ? "bg-secondary text-secondary-foreground" : ""}`}>
                  {s.source === "bokun" ? "BOKUN" : "MANUAL"}
                </Badge>
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0 p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground text-[15px] leading-tight">{s.tourName}</h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.meetingPoint}</span>
                      {s.bookingId && <span className="flex items-center gap-1"><ExternalLink className="h-3 w-3" />{s.bookingId}</span>}
                    </div>
                  </div>
                  <StatusPill status={s.status} />
                </div>

                {s.customer && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 p-3 rounded-lg bg-muted/40 border border-border/40 text-xs">
                    <div>
                      <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">{t.common.customer}</div>
                      <div className="font-semibold text-foreground mt-0.5">{s.customer.name}</div>
                      <div className="text-muted-foreground">{s.customer.phone}</div>
                    </div>
                    {s.participants && (
                      <div className="col-span-2">
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1"><Users className="h-2.5 w-2.5" /> {t.common.participants}</div>
                        <div className="font-medium text-foreground mt-0.5 flex gap-2 flex-wrap">
                          <span><b>{s.participants.adults}</b> {t.shifts.adults}</span>
                          {s.participants.teens > 0 && <span><b>{s.participants.teens}</b> {t.shifts.teens}</span>}
                          {s.participants.infants > 0 && <span><b>{s.participants.infants}</b> {t.shifts.infants}</span>}
                          {s.participants.trailers > 0 && <span><b>{s.participants.trailers}</b> {t.shifts.trailers}</span>}
                        </div>
                      </div>
                    )}
                    {s.rate !== undefined && (
                      <div>
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">{t.common.rate}</div>
                        <div className="font-semibold text-foreground mt-0.5 flex items-center gap-0.5"><Euro className="h-3 w-3" />{s.rate}</div>
                      </div>
                    )}
                  </div>
                )}

                {s.notes && <div className="mt-3 text-xs text-foreground/70 italic flex gap-1.5"><span>📝</span>{s.notes}</div>}

                <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border/60 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    {guide ? (
                      <>
                        <Avatar name={guide.name} initials={guide.avatar} size="sm" />
                        <span className="font-medium">{guide.name}</span>
                      </>
                    ) : suggested ? (
                      <div className="flex items-center gap-2 text-foreground/80 px-2 py-1 rounded-md bg-primary/10 border border-primary/20">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs">{t.shifts.suggested}:</span>
                        <Avatar name={suggested.name} initials={suggested.avatar} size="sm" />
                        <span className="font-medium text-xs">{suggested.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">{t.common.unassigned}</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {guideView && s.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => onReject(s.id)}>
                          <XCircle className="h-3.5 w-3.5 mr-1" /> {t.common.reject}
                        </Button>
                        <Button size="sm" onClick={() => onAccept(s.id)} className="shadow-[var(--shadow-elegant)]">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t.common.accept}
                        </Button>
                      </>
                    )}
                    {!guideView && (
                      <>
                        {!guide && (
                          <Button size="sm" onClick={() => toast.success("Guide picker would open")} className="shadow-[var(--shadow-elegant)]">
                            {t.shifts.assignGuide}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => onDuplicate(s)}>
                          <Copy className="h-3.5 w-3.5 mr-1" /> {t.common.duplicate}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
