import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader, StatusPill } from "@/components/page-header";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/current-user";
import { useStaffStore } from "@/lib/staff-store";
import type { Shift, GuideNote } from "@/lib/mock-data";
import { useShiftsStore } from "@/lib/shifts-store";
import { mapBokunBookingToShift, sampleBokunPayloads } from "@/lib/bokun-mapper";
import { suggestStaffForShift, StaffSuggestion } from "@/lib/staff-matcher";
import { SmartAssignDialog } from "@/components/smart-assign-dialog";
import { LeaveNoteDialog } from "@/components/leave-note-dialog";
import { useNotesStore } from "@/lib/notes-store";
import { useWaiverSignatures, signaturesForShift } from "@/lib/waivers-store";
import { WaiverStatusBadge, WaiverSignersList } from "@/components/waiver-status-badge";
import { InvoiceDialog } from "@/components/invoice-dialog";

import { AttachmentList } from "@/components/attachment-picker";
import { Plus, Copy, MapPin, Users, Sparkles, Clock, CheckCircle2, XCircle, ExternalLink, Euro, Webhook, AlertTriangle, Wand2, MessageSquarePlus, Wrench, User, MessageSquare, FileSignature, FileText } from "lucide-react";
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
  const { role, staffId } = useCurrentUser();
  const { staff } = useStaffStore();
  const { shifts, addShift, updateShift, setStatus, assignShift } = useShiftsStore();
  const isAdmin = role === "admin";
  const [assignDialogShift, setAssignDialogShift] = useState<Shift | null>(null);
  const [noteDialogShift, setNoteDialogShift] = useState<Shift | null>(null);
  const { notesByShift, addNote, notifyGuide } = useNotesStore();
  const { signatures: waiverSignatures } = useWaiverSignatures();

  const handleNoteSubmit = (note: GuideNote) => {
    const sh = shifts.find((s) => s.id === note.shiftId);
    if (!sh) return;
    addNote(note, sh.tourName);
    toast.success("Note sent to admins", { description: "They've been notified in the activity feed." });
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const isPast = (s: Shift) => s.date < todayStr;
  const upcomingShifts = shifts.filter((s) => !isPast(s));
  const pastShifts = shifts.filter(isPast);

  const shiftSummary = (s: Shift) => `${s.tourName} · ${s.date} ${s.startTime}–${s.endTime} · ${s.meetingPoint}`;

  const updateStatus = async (id: string, status: Shift["status"]) => {
    await setStatus(id, status);
    toast.success(`Shift ${status}`);
  };

  const assignStaff = async (shiftId: string, assignedStaffId: string, staffName: string) => {
    const prevShift = shifts.find((s) => s.id === shiftId);
    await assignShift(shiftId, assignedStaffId);
    if (prevShift) {
      const updated = { ...prevShift, assignedStaffId };
      // Notify the newly assigned guide
      notifyGuide({
        staffId: assignedStaffId,
        type: prevShift.assignedStaffId && prevShift.assignedStaffId !== assignedStaffId ? "reassigned" : "assigned",
        title: prevShift.assignedStaffId && prevShift.assignedStaffId !== assignedStaffId ? "Shift reassigned to you" : "New shift assigned",
        body: shiftSummary(updated),
        shiftId,
        link: "/shifts",
      });
      // If reassigned away from previous guide, notify them too
      if (prevShift.assignedStaffId && prevShift.assignedStaffId !== assignedStaffId) {
        notifyGuide({
          staffId: prevShift.assignedStaffId,
          type: "unassigned",
          title: "Shift removed from your schedule",
          body: `${shiftSummary(prevShift)} — reassigned to ${staffName}.`,
          shiftId,
          link: "/shifts",
        });
      }
    }
    toast.success(`Assigned to ${staffName}`, { description: "Push notification sent — awaiting accept/reject." });
  };

  const autoAssignAll = async () => {
    const unassigned = shifts.filter((s) => !s.assignedStaffId);
    if (unassigned.length === 0) {
      toast.info("Nothing to assign", { description: "All shifts already have a guide." });
      return;
    }
    const queue = [...unassigned].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    let working = [...shifts];
    let assignedCount = 0;
    const skipped: string[] = [];
    for (const sh of queue) {
      const top = suggestStaffForShift(sh, staff, working, 1)[0];
      if (top) {
        working = working.map((s) => (s.id === sh.id ? { ...s, assignedStaffId: top.staff.id, status: "pending" as const } : s));
        await assignShift(sh.id, top.staff.id);
        notifyGuide({
          staffId: top.staff.id,
          type: "assigned",
          title: "New shift assigned",
          body: shiftSummary(sh),
          shiftId: sh.id,
          link: "/shifts",
        });
        assignedCount++;
      } else {
        skipped.push(sh.tourName);
      }
    }
    toast.success(`Auto-assigned ${assignedCount} shift${assignedCount === 1 ? "" : "s"}`, {
      description: skipped.length > 0 ? `${skipped.length} couldn't be matched: ${skipped.slice(0, 2).join(", ")}${skipped.length > 2 ? "…" : ""}` : "All caught up — guides notified.",
    });
  };

  const duplicate = async (s: Shift) => {
    const { id: _omit, ...rest } = s;
    void _omit;
    await addShift({ ...rest, status: "unassigned", assignedStaffId: null });
    toast.success("Shift duplicated");
  };

  const simulateBokunBooking = async () => {
    const payload = sampleBokunPayloads[Math.floor(Math.random() * sampleBokunPayloads.length)];
    const newShiftDraft = mapBokunBookingToShift(payload);
    const { id: _omit, ...rest } = newShiftDraft;
    void _omit;
    const created = await addShift(rest);
    const suggestions = created ? suggestStaffForShift(created, staff, shifts, 1) : [];
    toast.success(`Bokun booking received: ${payload.confirmationCode}`, {
      description: suggestions[0]
        ? `${payload.productTitle} — AI suggests ${suggestions[0].staff.name}.`
        : `${payload.productTitle} — no matching guide found.`,
    });
  };

  const simulateWaiverSigned = async () => {
    // Pick a random unsigned upcoming shift and POST a fake payload to the webhook.
    const candidates = shifts.filter((s) => s.bookingId && signaturesForShift(waiverSignatures, s).length === 0);
    const target = candidates[Math.floor(Math.random() * candidates.length)] || shifts.find((s) => s.bookingId);
    if (!target?.bookingId) {
      toast.error("No shift with a booking ID to simulate against.");
      return;
    }
    const fakePayload = {
      signature_id: `wf-test-${Date.now()}`,
      signer_name: target.customer?.name || "Test Signer",
      signer_email: "test@example.com",
      signed_at: new Date().toISOString(),
      template_id: "tmpl_test",
      custom_fields: [{ label: "Bokun Booking ID", value: target.bookingId }],
    };
    try {
      const res = await fetch("/api/public/waiver-forever-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fakePayload),
      });
      const json = await res.json();
      if (json.matched) {
        toast.success(`Waiver signed for ${target.tourName}`, { description: `Booking ${target.bookingId}` });
      } else {
        toast.warning("Webhook stored signature but couldn't match a shift.");
      }
    } catch (e) {
      toast.error("Webhook call failed", { description: String(e) });
    }
  };

  return (
    <AppShell>
      <PageHeader
        title={isAdmin ? t.shifts.title : "My shifts"}
        subtitle={isAdmin ? t.shifts.subtitle : "Accept or reject the shifts dispatch sent your way."}
        actions={
          isAdmin ? (
            <>
              <Button variant="outline" onClick={simulateBokunBooking}>
                <Webhook className="h-4 w-4 mr-1" /> Simulate Bokun booking
              </Button>
              <Button variant="outline" onClick={simulateWaiverSigned}>
                <FileSignature className="h-4 w-4 mr-1" /> Simulate waiver signed
              </Button>
              <Button variant="outline" onClick={autoAssignAll}>
                <Wand2 className="h-4 w-4 mr-1" /> Auto-assign all
              </Button>
              <Button onClick={() => toast.success("Manual shift form would open")} className="shadow-[var(--shadow-elegant)]">
                <Plus className="h-4 w-4 mr-1" /> {t.shifts.newShift}
              </Button>
            </>
          ) : null
        }
      />

      <Tabs defaultValue={isAdmin ? "all" : "mine"} key={role + staffId} className="mb-6">
        {isAdmin && (
          <TabsList className="bg-muted">
            <TabsTrigger value="all">{t.common.all}</TabsTrigger>
            <TabsTrigger value="bokun">{t.shifts.fromBokun}</TabsTrigger>
            <TabsTrigger value="manual">{t.shifts.manual}</TabsTrigger>
            <TabsTrigger value="past">Past tours</TabsTrigger>
          </TabsList>
        )}
        {!isAdmin && (
          <TabsList className="bg-muted">
            <TabsTrigger value="mine">{t.shifts.myShifts}</TabsTrigger>
            <TabsTrigger value="past">Past tours</TabsTrigger>
          </TabsList>
        )}
        {isAdmin && (
          <TabsContent value="all" className="mt-5">
            <ShiftList shifts={upcomingShifts} allShifts={shifts} onAssign={assignStaff} onOpenAssignDialog={setAssignDialogShift} onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="bokun" className="mt-5">
            <ShiftList shifts={upcomingShifts.filter((s) => s.source === "bokun")} allShifts={shifts} onAssign={assignStaff} onOpenAssignDialog={setAssignDialogShift} onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="manual" className="mt-5">
            <ShiftList shifts={upcomingShifts.filter((s) => s.source === "manual")} allShifts={shifts} onAssign={assignStaff} onOpenAssignDialog={setAssignDialogShift} onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
          </TabsContent>
        )}
        <TabsContent value="mine" className="mt-5">
          <ShiftList shifts={upcomingShifts.filter((s) => s.assignedStaffId === staffId)} allShifts={shifts} guideView onAssign={assignStaff} onOpenAssignDialog={setAssignDialogShift} onAccept={(id) => updateStatus(id, "accepted")} onReject={(id) => updateStatus(id, "rejected")} onDuplicate={duplicate} />
        </TabsContent>
        <TabsContent value="past" className="mt-5">
          <ShiftList
            shifts={(isAdmin ? pastShifts : pastShifts.filter((s) => s.assignedStaffId === staffId)).sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))}
            allShifts={shifts}
            guideView={!isAdmin}
            pastView
            notesByShift={notesByShift}
            onLeaveNote={setNoteDialogShift}
            onAssign={assignStaff}
            onOpenAssignDialog={setAssignDialogShift}
            onAccept={(id) => updateStatus(id, "accepted")}
            onReject={(id) => updateStatus(id, "rejected")}
            onDuplicate={duplicate}
          />
        </TabsContent>
      </Tabs>

      <SmartAssignDialog
        shift={assignDialogShift}
        allShifts={shifts}
        open={!!assignDialogShift}
        onClose={() => setAssignDialogShift(null)}
        onAssign={assignStaff}
      />

      <LeaveNoteDialog
        shift={noteDialogShift}
        authorStaffId={staffId || "s1"}
        open={!!noteDialogShift}
        onClose={() => setNoteDialogShift(null)}
        onSubmit={handleNoteSubmit}
      />
    </AppShell>
  );
}

function ShiftList({ shifts, allShifts, onAssign, onOpenAssignDialog, onAccept, onReject, onDuplicate, guideView, pastView, notesByShift, onLeaveNote }: { shifts: Shift[]; allShifts: Shift[]; onAssign: (shiftId: string, staffId: string, staffName: string) => void; onOpenAssignDialog?: (s: Shift) => void; onAccept: (id: string) => void; onReject: (id: string) => void; onDuplicate: (s: Shift) => void; guideView?: boolean; pastView?: boolean; notesByShift?: Record<string, GuideNote[]>; onLeaveNote?: (s: Shift) => void }) {
  const { t } = useI18n();
  const { staff: allStaff } = useStaffStore();
  const { signatures: waiverSignatures } = useWaiverSignatures();
  if (shifts.length === 0) return <div className="text-muted-foreground text-sm py-12 text-center border border-dashed border-border rounded-xl">{pastView ? "No past tours yet." : "No shifts yet."}</div>;
  return (
    <div className="grid gap-4">
      {shifts.map((s) => {
        const guide = allStaff.find((p) => p.id === s.assignedStaffId);
        const suggestions: StaffSuggestion[] = !pastView && !guide ? suggestStaffForShift(s, allStaff, allShifts, 3) : [];
        const isUrgent = !pastView && (s.status === "unassigned" || s.status === "pending");
        const shiftNotes = notesByShift?.[s.id] || [];
        const shiftSignatures = signaturesForShift(waiverSignatures, s);

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
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusPill status={s.status} />
                    {!pastView && <WaiverStatusBadge signatures={shiftSignatures} />}
                  </div>
                </div>

                {!pastView && <WaiverSignersList signatures={shiftSignatures} />}

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
                    {s.rate !== undefined && !guideView && (
                      <div>
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">{t.common.rate}</div>
                        <div className="font-semibold text-foreground mt-0.5 flex items-center gap-0.5"><Euro className="h-3 w-3" />{s.rate}</div>
                      </div>
                    )}
                  </div>
                )}

                {s.notes && <div className="mt-3 text-xs text-foreground/70 italic flex gap-1.5"><span>📝</span>{s.notes}</div>}

                {/* AI suggestions panel for unassigned shifts */}
                {!guide && !guideView && !pastView && (
                  <div className="mt-4 p-3 rounded-lg bg-gradient-to-br from-primary/5 via-card to-card border border-primary/20">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] uppercase tracking-wider font-bold text-primary">AI suggestions</span>
                      <span className="text-[10px] text-muted-foreground">— top 3 by tags, languages, licenses & availability</span>
                      {onOpenAssignDialog && (
                        <button
                          onClick={() => onOpenAssignDialog(s)}
                          className="ml-auto text-[10px] font-semibold text-primary hover:underline"
                        >
                          See all candidates →
                        </button>
                      )}
                    </div>
                    {suggestions.length === 0 ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                          No matching guide currently free.
                        </div>
                        {onOpenAssignDialog && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpenAssignDialog(s)}>
                            Override manually
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {suggestions.map((sg, i) => (
                          <div key={sg.staff.id} className={`flex items-center gap-2.5 p-2 rounded-md border ${i === 0 ? "bg-primary/5 border-primary/30" : "bg-card border-border/40"}`}>
                            <Avatar name={sg.staff.name} initials={sg.staff.avatar} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-xs text-foreground">{sg.staff.name}</span>
                                {i === 0 && <Badge className="text-[8px] uppercase tracking-wider h-4 px-1.5 bg-primary text-primary-foreground">Best fit</Badge>}
                                <span className="text-[10px] text-muted-foreground tabular-nums">score {sg.score}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {sg.reasons.join(" · ")}
                                {sg.warnings.length > 0 && (
                                  <span className="text-warning-foreground"> · ⚠ {sg.warnings.join(", ")}</span>
                                )}
                              </div>
                            </div>
                            <Button size="sm" variant={i === 0 ? "default" : "outline"} className="h-7 text-xs px-2.5" onClick={() => onAssign(s.id, sg.staff.id, sg.staff.name)}>
                              Assign
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border/60 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    {guide ? (
                      <>
                        <Avatar name={guide.name} initials={guide.avatar} size="sm" />
                        <span className="font-medium">{guide.name}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">{t.common.unassigned}</span>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {pastView && (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Completed</Badge>
                    )}
                    {pastView && guideView && onLeaveNote && (
                      <Button size="sm" onClick={() => onLeaveNote(s)} className="shadow-[var(--shadow-elegant)]">
                        <MessageSquarePlus className="h-3.5 w-3.5 mr-1" /> {shiftNotes.length > 0 ? "Add another note" : "Leave a note"}
                      </Button>
                    )}
                    {!pastView && guideView && s.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => onReject(s.id)}>
                          <XCircle className="h-3.5 w-3.5 mr-1" /> {t.common.reject}
                        </Button>
                        <Button size="sm" onClick={() => onAccept(s.id)} className="shadow-[var(--shadow-elegant)]">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t.common.accept}
                        </Button>
                      </>
                    )}
                    {!pastView && !guideView && guide && onOpenAssignDialog && (
                      <Button size="sm" variant="outline" onClick={() => onOpenAssignDialog(s)}>
                        <Wand2 className="h-3.5 w-3.5 mr-1" /> Reassign
                      </Button>
                    )}
                    {!guideView && !pastView && (
                      <Button size="sm" variant="outline" onClick={() => onDuplicate(s)}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> {t.common.duplicate}
                      </Button>
                    )}
                  </div>
                </div>

                {pastView && shiftNotes.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" /> Guide notes ({shiftNotes.length})
                    </div>
                    {shiftNotes.map((n) => {
                      const author = allStaff.find((p) => p.id === n.authorStaffId);
                      const catMeta: Record<GuideNote["category"], { label: string; icon: typeof Wrench; cls: string }> = {
                        general: { label: "General", icon: MessageSquare, cls: "bg-muted/60 border-border/60" },
                        bike_issue: { label: "Bike issue", icon: Wrench, cls: "bg-warning/10 border-warning/30" },
                        customer: { label: "Customer", icon: User, cls: "bg-secondary/10 border-secondary/30" },
                        incident: { label: "Incident", icon: AlertTriangle, cls: "bg-destructive/10 border-destructive/30" },
                      };
                      const meta = catMeta[n.category];
                      const Icon = meta.icon;
                      return (
                        <div key={n.id} className={`p-3 rounded-lg border text-xs ${meta.cls}`}>
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[9px] uppercase tracking-wider h-4 px-1.5">
                              <Icon className="h-2.5 w-2.5 mr-1" /> {meta.label}
                            </Badge>
                            <span className="font-semibold text-foreground">{author?.name || "Guide"}</span>
                            <span className="text-muted-foreground">· {new Date(n.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                          </div>
                          <div className="text-foreground/85 leading-snug whitespace-pre-wrap">{n.message}</div>
                          {n.attachments && n.attachments.length > 0 && <AttachmentList attachments={n.attachments} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
