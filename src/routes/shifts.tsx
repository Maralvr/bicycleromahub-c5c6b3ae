import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader, StatusPill } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { shifts as initialShifts, staff, Shift } from "@/lib/mock-data";
import { Plus, Copy, MapPin, Users, Sparkles, Clock, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
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

  const duplicate = (s: Shift) => {
    setShifts((prev) => [...prev, { ...s, id: `${s.id}-copy-${Date.now()}`, status: "unassigned", assignedStaffId: null }]);
    toast.success("Shift duplicated");
  };

  return (
    <AppShell>
      <PageHeader
        title={t.shifts.title}
        subtitle={t.shifts.subtitle}
        actions={
          <Button onClick={() => toast.success("Manual shift form would open")}>
            <Plus className="h-4 w-4 mr-1" /> {t.shifts.newShift}
          </Button>
        }
      />

      <Tabs defaultValue="all" className="mb-6">
        <TabsList>
          <TabsTrigger value="all">{t.common.all}</TabsTrigger>
          <TabsTrigger value="bokun">{t.shifts.fromBokun}</TabsTrigger>
          <TabsTrigger value="manual">{t.shifts.manual}</TabsTrigger>
          <TabsTrigger value="mine">{t.shifts.myShifts}</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-5">
          <ShiftList shifts={shifts} onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
        </TabsContent>
        <TabsContent value="bokun" className="mt-5">
          <ShiftList shifts={shifts.filter((s) => s.source === "bokun")} onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
        </TabsContent>
        <TabsContent value="manual" className="mt-5">
          <ShiftList shifts={shifts.filter((s) => s.source === "manual")} onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
        </TabsContent>
        <TabsContent value="mine" className="mt-5">
          <ShiftList shifts={shifts.filter((s) => s.assignedStaffId === "s1")} guideView onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ShiftList({ shifts, onAccept, onReject, onDuplicate, guideView }: { shifts: Shift[]; onAccept: (id: string) => void; onReject: (id: string) => void; onDuplicate: (s: Shift) => void; guideView?: boolean }) {
  const { t } = useI18n();
  if (shifts.length === 0) return <div className="text-muted-foreground text-sm py-8 text-center">No shifts.</div>;
  return (
    <div className="grid gap-4">
      {shifts.map((s) => {
        const guide = staff.find((p) => p.id === s.assignedStaffId);
        const suggested = !guide ? staff.find((p) => s.requiredTags.every((t) => p.tags.includes(t)) && p.status === "available") : null;

        return (
          <Card key={s.id} className="p-5 hover:shadow-[var(--shadow-card)] transition-shadow">
            <div className="flex flex-col lg:flex-row gap-5">
              <div className="lg:w-32 flex lg:flex-col gap-3 lg:gap-1 lg:border-r lg:pr-5 border-border">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.date}</div>
                <div className="text-2xl font-bold text-foreground flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" />
                  {s.startTime}
                </div>
                <div className="text-xs text-muted-foreground">→ {s.endTime}</div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{s.tourName}</h3>
                      <Badge variant={s.source === "bokun" ? "default" : "outline"} className="text-[10px]">
                        {s.source === "bokun" ? "BOKUN" : "MANUAL"}
                      </Badge>
                      {s.bookingId && <span className="text-xs text-muted-foreground flex items-center gap-1"><ExternalLink className="h-3 w-3" />{s.bookingId}</span>}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-3.5 w-3.5" /> {s.meetingPoint}
                    </div>
                  </div>
                  <StatusPill status={s.status} />
                </div>

                {s.customer && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 p-3 rounded-lg bg-muted/50 text-xs">
                    <div>
                      <div className="text-muted-foreground">{t.common.customer}</div>
                      <div className="font-medium text-foreground">{s.customer.name}</div>
                      <div className="text-muted-foreground">{s.customer.phone}</div>
                    </div>
                    {s.participants && (
                      <div className="col-span-2 md:col-span-2">
                        <div className="text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> {t.common.participants}</div>
                        <div className="font-medium text-foreground">
                          {s.participants.adults} {t.shifts.adults} · {s.participants.teens} {t.shifts.teens} · {s.participants.infants} {t.shifts.infants} · {s.participants.trailers} {t.shifts.trailers}
                        </div>
                      </div>
                    )}
                    {s.rate !== undefined && (
                      <div>
                        <div className="text-muted-foreground">{t.common.rate}</div>
                        <div className="font-medium text-foreground">€{s.rate}</div>
                      </div>
                    )}
                  </div>
                )}

                {s.notes && <div className="mt-3 text-xs text-foreground/70 italic">📝 {s.notes}</div>}

                <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    {guide ? (
                      <>
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-primary-foreground text-[10px] font-bold">{guide.avatar}</div>
                        <span className="font-medium">{guide.name}</span>
                      </>
                    ) : suggested ? (
                      <div className="flex items-center gap-2 text-foreground/80">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs">{t.shifts.suggested}:</span>
                        <span className="font-medium">{suggested.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">{t.common.unassigned}</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {guideView && s.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => onReject(s.id)}>
                          <XCircle className="h-3.5 w-3.5 mr-1" /> {t.common.reject}
                        </Button>
                        <Button size="sm" onClick={() => onAccept(s.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t.common.accept}
                        </Button>
                      </>
                    )}
                    {!guideView && (
                      <>
                        {!guide && (
                          <Button size="sm" onClick={() => toast.success("Guide picker would open")}>
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
