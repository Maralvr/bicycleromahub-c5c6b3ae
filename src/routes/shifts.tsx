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
import { useAuth } from "@/lib/auth";
import { useStaffStore } from "@/lib/staff-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AttachmentPicker } from "@/components/attachment-picker";
import type { Attachment } from "@/lib/mock-data";
import type { Shift, GuideNote } from "@/lib/mock-data";
import { useShiftsStore } from "@/lib/shifts-store";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { startBokunImportFn, processBokunImportChunkFn } from "@/lib/bokun-import.functions";

import { suggestStaffForShift, StaffSuggestion } from "@/lib/staff-matcher";
import { SmartAssignDialog } from "@/components/smart-assign-dialog";
import { LeaveNoteDialog } from "@/components/leave-note-dialog";
import { useNotesStore } from "@/lib/notes-store";
import { useWaiverSignatures, signaturesForShift } from "@/lib/waivers-store";
import { WaiverStatusBadge, WaiverSignersList } from "@/components/waiver-status-badge";
import { InvoiceDialog } from "@/components/invoice-dialog";
import { ManualShiftDialog } from "@/components/manual-shift-dialog";

import { AttachmentList } from "@/components/attachment-picker";
import { BookingNotesThread } from "@/components/booking-notes-thread";
import { DispatchHistory } from "@/components/dispatch-history";
import { Plus, Copy, MapPin, Users, Sparkles, Clock, CheckCircle2, XCircle, ExternalLink, Euro, Webhook, AlertTriangle, Wand2, MessageSquarePlus, Wrench, User, UserX, MessageSquare, FileSignature, FileText, CalendarDays, List as ListIcon, Trash2, Hourglass } from "lucide-react";
import { ShiftsCalendar, type CalendarShift } from "@/components/shifts-calendar";
import { ShiftFilters, matchesShiftFilter, EMPTY_FILTERS, type ShiftFiltersValue } from "@/components/shift-filters";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type ShiftsTab = "calendar" | "all" | "bokun" | "manual" | "mine" | "past";
type ShiftStatusFilter = "pending" | "unassigned" | "accepted" | "rejected";

export const Route = createFileRoute("/shifts")({
  validateSearch: (search: Record<string, unknown>): { tab?: ShiftsTab; status?: ShiftStatusFilter } => {
    const tab = search.tab as string | undefined;
    const status = search.status as string | undefined;
    const validTabs: ShiftsTab[] = ["calendar", "all", "bokun", "manual", "mine", "past"];
    const validStatuses: ShiftStatusFilter[] = ["pending", "unassigned", "accepted", "rejected"];
    return {
      tab: tab && validTabs.includes(tab as ShiftsTab) ? (tab as ShiftsTab) : undefined,
      status: status && validStatuses.includes(status as ShiftStatusFilter) ? (status as ShiftStatusFilter) : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Shifts — Bicycle Roma" },
      { name: "description", content: "Bokun-synced bookings and manual shift assignments." },
    ],
  }),
  component: ShiftsPage,
});

function ShiftsPage() {
  const { t } = useI18n();
  const { role, staffId } = useCurrentUser();
  const { user } = useAuth();
  const { staff } = useStaffStore();
  const { shifts, addShift, updateShift, setStatus, assignShift, deleteShift, refresh: refreshShifts } = useShiftsStore();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const isAdminRole = role === "admin";
  const defaultTab: ShiftsTab = search.tab ?? (isAdminRole ? (search.status ? "all" : "calendar") : "mine");
  const [activeTab, setActiveTab] = useState<ShiftsTab>(defaultTab);
  useEffect(() => {
    if (search.tab && search.tab !== activeTab) setActiveTab(search.tab);
    else if (search.status && activeTab === "calendar" && isAdminRole) setActiveTab("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.tab, search.status]);
  const statusFilter = search.status ?? null;
  const clearStatusFilter = () => navigate({ search: (prev: { tab?: ShiftsTab; status?: ShiftStatusFilter }) => ({ ...prev, status: undefined }), replace: true });
  const [rejectDialogShift, setRejectDialogShift] = useState<Shift | null>(null);


  const handleDelete = async (s: Shift) => {
    const label = s.source === "bokun" ? `Bokun booking ${s.bookingId ?? ""}` : "manual shift";
    if (!confirm(`Delete this ${label}?\n\n${s.tourName} — ${s.date} ${s.startTime}\n\nThis cannot be undone.`)) return;
    try {
      await deleteShift(s.id);
      toast.success("Shift deleted");
    } catch (e) {
      toast.error("Couldn't delete shift", { description: String(e) });
    }
  };
  const isAdmin = role === "admin";
  const [assignDialogShift, setAssignDialogShift] = useState<Shift | null>(null);
  const [noteDialogShift, setNoteDialogShift] = useState<Shift | null>(null);
  const [invoiceDialogShift, setInvoiceDialogShift] = useState<Shift | null>(null);
  const [cardDialogShifts, setCardDialogShifts] = useState<Shift[] | null>(null);
  const handleCalendarShiftClick = (s: CalendarShift) => {
    setCardDialogShifts(s.groupedShifts && s.groupedShifts.length > 0 ? s.groupedShifts : [s]);
  };
  const handleUpdateDeparture = async (id: string, patch: { startTime?: string; endTime?: string; meetingPoint?: string; rate?: number | null; rateTitle?: string | null }) => {
    const { rate, ...rest } = patch;
    await updateShift(id, { ...rest, ...(rate !== undefined ? { rate: rate ?? undefined } : {}) });
    toast.success("Booking updated");
  };
  const [importing, setImporting] = useState(false);
  const startImport = useServerFn(startBokunImportFn);
  const processChunk = useServerFn(processBokunImportChunkFn);

  const handleImportBokun = async () => {
    const fromDate = prompt("Import Bokun bookings FROM date (YYYY-MM-DD):", "2026-05-01");
    if (!fromDate) return;
    const toDate = prompt("Import Bokun bookings TO date (YYYY-MM-DD):", "2026-06-30");
    if (!toDate) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      toast.error("Invalid date format. Use YYYY-MM-DD.");
      return;
    }
    setImporting(true);
    const tid = toast.loading(`Starting Bokun import (${fromDate} → ${toDate})…`, {
      description: "Track live progress on the Bokun runs page.",
    });
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const { runId } = await startImport({ data: { accessToken: token, fromDate, toDate } });

      // Loop chunks one page at a time so each request stays small and progress is committed after every page.
      let done = false;
      let pages = 0;
      let consecutiveFailures = 0;
      let last: Awaited<ReturnType<typeof processChunk>> | null = null;
      while (!done) {
        let res: Awaited<ReturnType<typeof processChunk>>;
        try {
          res = await processChunk({ data: { accessToken: token, runId } });
          consecutiveFailures = 0;
        } catch (err) {
          consecutiveFailures++;
          const msg = (err as Error).message ?? "";
          // Retry transient gateway/timeout errors so a single slow page doesn't abort the whole import.
          if (consecutiveFailures < 5 && /timeout|502|503|504|fetch|network/i.test(msg)) {
            toast.loading(`Retrying page ${pages + 1}…`, {
              id: tid,
              description: `Attempt ${consecutiveFailures + 1} of 5`,
            });
            await new Promise((r) => setTimeout(r, 1500 * consecutiveFailures));
            continue;
          }
          throw err;
        }
        last = res;
        done = res.done;
        pages++;
        if (res.totalHits && res.totalSeen != null) {
          const pct = Math.min(99, Math.round((res.totalSeen / res.totalHits) * 100));
          toast.loading(`Importing… ${pct}%`, {
            id: tid,
            description: `${res.totalSeen}/${res.totalHits} bookings · page ${pages}`,
          });
        } else {
          toast.loading(`Importing… page ${pages}`, { id: tid });
        }
        if (pages > 1000) break; // safety cap
      }

      toast.success(`Imported ${last?.created ?? 0} new, updated ${last?.updated ?? 0}`, {
        id: tid,
        description: `${last?.totalSeen ?? 0} bookings seen, ${last?.skipped ?? 0} skipped${last?.errors?.length ? `, ${last.errors.length} errors` : ""}`,
      });
      if (last?.errors?.length) console.warn("Bokun import errors:", last.errors);
      await refreshShifts?.();
    } catch (e) {
      toast.error("Import failed", { id: tid, description: (e as Error).message });
    } finally {
      setImporting(false);
    }
  };
  const [newShiftOpen, setNewShiftOpen] = useState(false);
  const { notesByShift, addNote, notifyGuide, notifyGuides } = useNotesStore();
  const { signatures: waiverSignatures } = useWaiverSignatures();

  const handleNoteSubmit = (note: GuideNote) => {
    const sh = shifts.find((s) => s.id === note.shiftId);
    if (!sh) return;
    addNote(note, sh.tourName);
    toast.success("Note sent to admins", { description: "They've been notified in the activity feed." });
  };

  const [filters, setFilters] = useState<ShiftFiltersValue>(EMPTY_FILTERS);
  const todayStr = new Date().toISOString().slice(0, 10);
  const isPast = (s: Shift) => s.date < todayStr;
  const filteredShifts = shifts.filter((s) => matchesShiftFilter(s, filters));
  const byStatus = (s: Shift) => !statusFilter || s.status === statusFilter;
  const upcomingShifts = filteredShifts.filter((s) => !isPast(s) && byStatus(s));
  const pastShifts = filteredShifts.filter((s) => isPast(s) && byStatus(s));
  // For guides: include every assigned shift that still needs their response (pending),
  // even if the date already passed, so notifications never point to an empty list.
  // Pinned at the top, then upcoming chronologically.
  const myShifts = !isAdmin && staffId
    ? (() => {
        const mine = filteredShifts.filter((s) => s.assignedStaffId === staffId && byStatus(s));
        const pendingAny = mine.filter((s) => s.status === "pending");
        const upcomingNonPending = mine.filter((s) => s.status !== "pending" && !isPast(s));
        const seen = new Set<string>();
        return [...pendingAny, ...upcomingNonPending].filter((s) => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
      })()
    : [];
  const myPendingCount = myShifts.filter((s) => s.status === "pending").length;

  const shiftSummary = (s: Shift) => `${s.tourName} · ${s.date} ${s.startTime}–${s.endTime} · ${s.meetingPoint}`;

  const adminStaffIds = staff.filter((s) => s.role === "admin").map((s) => s.id);
  const notifyAdmins = (
    n: { type: "shift_accepted" | "shift_rejected"; title: string; body: string; shiftId?: string },
  ) => {
    if (adminStaffIds.length === 0) return;
    notifyGuides(adminStaffIds, { ...n, link: "/shifts" });
  };

  const handleAccept = async (id: string) => {
    const sh = shifts.find((s) => s.id === id);
    const { error } = await supabase.rpc("accept_shift" as never, { _shift_id: id } as never);
    if (error) {
      toast.error("Couldn't accept shift", { description: error.message });
      return;
    }
    toast.success("Shift accepted");
    if (sh) {
      const guide = staff.find((m) => m.id === sh.assignedStaffId);
      notifyAdmins({
        type: "shift_accepted",
        title: `${guide?.name ?? "Guide"} accepted a shift`,
        body: shiftSummary(sh),
        shiftId: id,
      });
    }
  };

  const handleRejectConfirm = async (reason: string, attachments: Attachment[]) => {
    const sh = rejectDialogShift;
    if (!sh) return;
    const guide = staff.find((m) => m.id === sh.assignedStaffId);
    const trimmed = reason.trim();

    // 1. Save reason + attachments to the booking notes thread (preserves authorship + timestamp).
    if ((trimmed || attachments.length > 0) && user) {
      const { error: noteErr } = await supabase.from("booking_notes").insert({
        shift_id: sh.id,
        author_profile_id: user.id,
        author_name: guide?.name ?? "Guide",
        author_role: "guide",
        message: `Rejected this shift${trimmed ? `: ${trimmed}` : "."}`,
        attachments,
      });
      if (noteErr) {
        toast.error("Couldn't save rejection note", { description: noteErr.message });
        return;
      }
    }

    // 2. Release the shift back to the unassigned pool.
    const { error } = await supabase.rpc("reject_shift" as never, { _shift_id: sh.id, _reason: trimmed || null } as never);
    if (error) {
      toast.error("Couldn't reject shift", { description: error.message });
      return;
    }

    // 3. Notify every admin.
    const reasonSnippet = trimmed ? ` — “${trimmed.slice(0, 120)}${trimmed.length > 120 ? "…" : ""}”` : "";
    notifyAdmins({
      type: "shift_rejected",
      title: `${guide?.name ?? "Guide"} rejected a shift`,
      body: `${shiftSummary(sh)}${reasonSnippet}`,
      shiftId: sh.id,
    });

    setRejectDialogShift(null);
    toast.success("Shift released", { description: "Admin notified — back in the unassigned pool." });
  };

  const openReject = (id: string) => {
    const sh = shifts.find((s) => s.id === id);
    if (sh) setRejectDialogShift(sh);
  };


  const assignStaff = async (shiftId: string, assignedStaffId: string, staffName: string, note?: string) => {
    const prevShift = shifts.find((s) => s.id === shiftId);
    // Soft cooldown warning: this guide previously rejected this shift.
    if (prevShift?.rejectedByStaffIds?.includes(assignedStaffId)) {
      const proceed = window.confirm(
        `${staffName} already rejected this shift. Send it to them again?`,
      );
      if (!proceed) return;
    }
    await assignShift(shiftId, assignedStaffId);
    if (prevShift) {
      const updated = { ...prevShift, assignedStaffId };
      const reassigning = !!prevShift.assignedStaffId && prevShift.assignedStaffId !== assignedStaffId;
      const baseBody = shiftSummary(updated);
      const body = note ? `${baseBody}\n\n📝 Note: ${note}` : baseBody;
      // Notify the newly assigned guide
      await notifyGuide({
        staffId: assignedStaffId,
        type: reassigning ? "reassigned" : "assigned",
        title: reassigning ? "Shift reassigned to you" : "New shift assigned",
        body,
        shiftId,
        link: "/shifts",
      });
      // If reassigned away from previous guide, notify them too
      if (reassigning && prevShift.assignedStaffId) {
        await notifyGuide({
          staffId: prevShift.assignedStaffId,
          type: "unassigned",
          title: "Shift removed from your schedule",
          body: `${shiftSummary(prevShift)} — reassigned to ${staffName}.`,
          shiftId,
          link: "/shifts",
        });
      }
    }
    toast.success(`Assigned to ${staffName}`, {
      description: note ? "Note sent to guide — awaiting accept/reject." : "Notified in-app — awaiting accept/reject.",
    });
  };

  const handleUnassign = async (id: string) => {
    const prev = shifts.find((s) => s.id === id);
    await assignShift(id, null);
    toast.success("Guide unassigned", { description: "Shift is back in the unassigned pool." });
    if (prev?.assignedStaffId) {
      await notifyGuide({
        staffId: prev.assignedStaffId,
        type: "unassigned",
        title: "Shift removed from your schedule",
        body: `${shiftSummary({ ...prev, assignedStaffId: null })} — unassigned by admin.`,
        shiftId: id,
        link: "/shifts",
      });
    }
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
        await notifyGuide({
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
              <Button variant="outline" onClick={handleImportBokun} disabled={importing}>
                <Webhook className="h-4 w-4 mr-1" /> {importing ? "Importing…" : "Import from Bokun"}
              </Button>


              <Button variant="outline" onClick={simulateWaiverSigned}>
                <FileSignature className="h-4 w-4 mr-1" /> Simulate waiver signed
              </Button>
              <Button variant="outline" onClick={autoAssignAll}>
                <Wand2 className="h-4 w-4 mr-1" /> Auto-assign all
              </Button>
              <Button onClick={() => setNewShiftOpen(true)} className="shadow-[var(--shadow-elegant)]">
                <Plus className="h-4 w-4 mr-1" /> {t.shifts.newShift}
              </Button>
            </>
          ) : null
        }
      />

      <ShiftFilters
        value={filters}
        onChange={setFilters}
        resultCount={filteredShifts.length}
        totalCount={shifts.length}
      />

      {statusFilter && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>
            Showing only <span className="font-semibold capitalize">{statusFilter}</span> shifts
          </span>
          <Button size="sm" variant="ghost" onClick={clearStatusFilter}>Clear filter</Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ShiftsTab)} key={role + staffId} className="mb-6">
        {isAdmin && (
          <TabsList className="bg-muted">
            <TabsTrigger value="calendar"><CalendarDays className="h-3.5 w-3.5 mr-1.5" />Calendar</TabsTrigger>
            <TabsTrigger value="all"><ListIcon className="h-3.5 w-3.5 mr-1.5" />{t.common.all}</TabsTrigger>
            <TabsTrigger value="bokun">{t.shifts.fromBokun}</TabsTrigger>
            <TabsTrigger value="manual">{t.shifts.manual}</TabsTrigger>
            <TabsTrigger value="past">Past tours</TabsTrigger>
          </TabsList>
        )}
        {!isAdmin && (
          <TabsList className="bg-muted">
            <TabsTrigger value="calendar"><CalendarDays className="h-3.5 w-3.5 mr-1.5" />Calendar</TabsTrigger>
            <TabsTrigger value="mine" className="relative">
              <ListIcon className="h-3.5 w-3.5 mr-1.5" />{t.shifts.myShifts}
              {myPendingCount > 0 && (
                <Badge variant="default" className="ml-2 h-4 min-w-4 px-1 text-[10px] font-bold bg-primary text-primary-foreground">
                  {myPendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="past">Past tours</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="calendar" className="mt-5">
          <ShiftsCalendar
            shifts={isAdmin ? filteredShifts : filteredShifts.filter((s) => s.assignedStaffId === staffId)}
            staff={staff}
            showRates={isAdmin}
            onAssign={isAdmin ? assignStaff : undefined}
            onUpdateDeparture={isAdmin ? handleUpdateDeparture : undefined}
            onShiftClick={handleCalendarShiftClick}
          />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="all" className="mt-5">
            <ShiftList shifts={upcomingShifts} allShifts={shifts} onAssign={assignStaff} onOpenAssignDialog={setAssignDialogShift} onAccept={handleAccept} onReject={openReject} onUnassign={handleUnassign} onDuplicate={duplicate} onDelete={handleDelete} onGenerateInvoice={setInvoiceDialogShift} onUpdateDeparture={handleUpdateDeparture} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="bokun" className="mt-5">
            <ShiftList shifts={upcomingShifts.filter((s) => s.source === "bokun")} allShifts={shifts} onAssign={assignStaff} onOpenAssignDialog={setAssignDialogShift} onAccept={handleAccept} onReject={openReject} onUnassign={handleUnassign} onDuplicate={duplicate} onDelete={handleDelete} onGenerateInvoice={setInvoiceDialogShift} onUpdateDeparture={handleUpdateDeparture} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="manual" className="mt-5">
            <ShiftList shifts={upcomingShifts.filter((s) => s.source === "manual")} allShifts={shifts} onAssign={assignStaff} onOpenAssignDialog={setAssignDialogShift} onAccept={handleAccept} onReject={openReject} onUnassign={handleUnassign} onDuplicate={duplicate} onDelete={handleDelete} onGenerateInvoice={setInvoiceDialogShift} onUpdateDeparture={handleUpdateDeparture} />
          </TabsContent>
        )}
        <TabsContent value="mine" className="mt-5">
          <ShiftList shifts={myShifts} allShifts={shifts} guideView onAssign={assignStaff} onOpenAssignDialog={setAssignDialogShift} onAccept={handleAccept} onReject={openReject} onDuplicate={duplicate} />
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
            onAccept={handleAccept}
            onReject={openReject}
            onDuplicate={duplicate}
            onDelete={isAdmin ? handleDelete : undefined}
            onGenerateInvoice={isAdmin ? setInvoiceDialogShift : undefined}
            onUpdateDeparture={isAdmin ? handleUpdateDeparture : undefined}
          />
        </TabsContent>
      </Tabs>

      <SmartAssignDialog
        shift={assignDialogShift}
        allShifts={shifts}
        open={!!assignDialogShift}
        onClose={() => setAssignDialogShift(null)}
        onAssign={assignStaff}
        onOverride={isAdmin ? (id, patch) => handleUpdateDeparture(id, patch) : undefined}
      />

      <LeaveNoteDialog
        shift={noteDialogShift}
        authorStaffId={staffId || "s1"}
        open={!!noteDialogShift}
        onClose={() => setNoteDialogShift(null)}
        onSubmit={handleNoteSubmit}
      />

      <InvoiceDialog
        shift={invoiceDialogShift}
        open={!!invoiceDialogShift}
        onClose={() => setInvoiceDialogShift(null)}
      />

      <ManualShiftDialog
        open={newShiftOpen}
        onOpenChange={setNewShiftOpen}
        onSubmit={async (input) => {
          try {
            const created = await addShift(input);
            if (created) toast.success("Shift created");
            else toast.error("Couldn't create shift");
          } catch (e) {
            toast.error("Couldn't create shift", { description: String(e) });
          }
        }}
      />

      <RejectShiftDialog
        shift={rejectDialogShift}
        open={!!rejectDialogShift}
        onClose={() => setRejectDialogShift(null)}
        onConfirm={handleRejectConfirm}
      />

      <Dialog open={!!cardDialogShifts} onOpenChange={(o) => !o && setCardDialogShifts(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>
              {cardDialogShifts && cardDialogShifts.length > 1
                ? `${cardDialogShifts.length} bookings`
                : "Booking details"}
            </DialogTitle>
          </DialogHeader>
          {cardDialogShifts && (
            <ShiftList
              shifts={cardDialogShifts}
              allShifts={shifts}
              guideView={!isAdmin}
              onAssign={assignStaff}
              onOpenAssignDialog={isAdmin ? setAssignDialogShift : undefined}
              onAccept={handleAccept}
              onReject={openReject}
              onUnassign={isAdmin ? handleUnassign : undefined}
              onDuplicate={duplicate}
              onDelete={isAdmin ? handleDelete : undefined}
              onGenerateInvoice={isAdmin ? setInvoiceDialogShift : undefined}
              onUpdateDeparture={isAdmin ? handleUpdateDeparture : undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ShiftOverrideDeparture({ shift, onUpdateDeparture }: { shift: Shift; onUpdateDeparture: (id: string, patch: { startTime?: string; endTime?: string; meetingPoint?: string; rate?: number | null; rateTitle?: string | null }) => Promise<void> | void }) {
  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [meetingPoint, setMeetingPoint] = useState(shift.meetingPoint ?? "");
  const [rate, setRate] = useState<string>(shift.rate != null ? String(shift.rate) : "");
  const [rateTitle, setRateTitle] = useState<string>(shift.rateTitle ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setStartTime(shift.startTime);
    setEndTime(shift.endTime);
    setMeetingPoint(shift.meetingPoint ?? "");
    setRate(shift.rate != null ? String(shift.rate) : "");
    setRateTitle(shift.rateTitle ?? "");
  }, [shift.id, shift.startTime, shift.endTime, shift.meetingPoint, shift.rate, shift.rateTitle]);
  const origRate = shift.rate != null ? String(shift.rate) : "";
  const origRateTitle = shift.rateTitle ?? "";
  const changed =
    startTime !== shift.startTime ||
    endTime !== shift.endTime ||
    meetingPoint !== (shift.meetingPoint ?? "") ||
    rate !== origRate ||
    rateTitle !== origRateTitle;
  const save = async () => {
    if (!changed) return;
    setSaving(true);
    try {
      const patch: { startTime?: string; endTime?: string; meetingPoint?: string; rate?: number | null; rateTitle?: string | null } = {};
      if (startTime !== shift.startTime) patch.startTime = startTime;
      if (endTime !== shift.endTime) patch.endTime = endTime;
      if (meetingPoint !== (shift.meetingPoint ?? "")) patch.meetingPoint = meetingPoint;
      if (rate !== origRate) patch.rate = rate === "" ? null : Number(rate);
      if (rateTitle !== origRateTitle) patch.rateTitle = rateTitle.trim() || null;
      await onUpdateDeparture(shift.id, patch);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-4 p-3 rounded-lg border border-border/60 bg-muted/30">
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
        <Clock className="h-3 w-3 text-primary" /> Admin overrides
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`ov-start-${shift.id}`} className="text-[10px] uppercase tracking-wide text-muted-foreground">Start</Label>
          <Input id={`ov-start-${shift.id}`} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9 w-28 text-xs" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ov-end-${shift.id}`} className="text-[10px] uppercase tracking-wide text-muted-foreground">End</Label>
          <Input id={`ov-end-${shift.id}`} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9 w-28 text-xs" />
        </div>
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label htmlFor={`ov-meet-${shift.id}`} className="text-[10px] uppercase tracking-wide text-muted-foreground">Meeting point</Label>
          <Input id={`ov-meet-${shift.id}`} value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} placeholder="e.g. Piazza del Popolo, fountain side" className="h-9 text-xs" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ov-rate-${shift.id}`} className="text-[10px] uppercase tracking-wide text-muted-foreground">Rate (€)</Label>
          <Input id={`ov-rate-${shift.id}`} type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="h-9 w-24 text-xs" />
        </div>
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label htmlFor={`ov-lang-${shift.id}`} className="text-[10px] uppercase tracking-wide text-muted-foreground">Tour language / rate name</Label>
          <Input id={`ov-lang-${shift.id}`} value={rateTitle} onChange={(e) => setRateTitle(e.target.value)} placeholder="e.g. Public tour in Spanish" className="h-9 text-xs" />
        </div>
        <Button size="sm" variant="outline" className="h-9 text-xs" disabled={!changed || saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function ShiftList({ shifts, allShifts, onAssign, onOpenAssignDialog, onAccept, onReject, onUnassign, onDuplicate, onDelete, guideView, pastView, notesByShift, onLeaveNote, onGenerateInvoice, onUpdateDeparture }: { shifts: Shift[]; allShifts: Shift[]; onAssign: (shiftId: string, staffId: string, staffName: string) => void; onOpenAssignDialog?: (s: Shift) => void; onAccept: (id: string) => void; onReject: (id: string) => void; onUnassign?: (id: string) => void; onDuplicate: (s: Shift) => void; onDelete?: (s: Shift) => void; guideView?: boolean; pastView?: boolean; notesByShift?: Record<string, GuideNote[]>; onLeaveNote?: (s: Shift) => void; onGenerateInvoice?: (s: Shift) => void; onUpdateDeparture?: (id: string, patch: { startTime?: string; endTime?: string; meetingPoint?: string; rate?: number | null; rateTitle?: string | null }) => Promise<void> | void }) {
  const { t } = useI18n();
  const { staff: allStaff } = useStaffStore();
  const { role: currentRole, staffId: currentStaffId } = useCurrentUser();
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
                    {!pastView && s.status === "pending" && s.pendingExpiresAt && (
                      <PendingCountdown expiresAt={s.pendingExpiresAt} />
                    )}
                    {!pastView && <WaiverStatusBadge signatures={shiftSignatures} />}
                  </div>
                </div>

                {!pastView && s.status === "unassigned" && s.rejectionReason && (
                  <div className="mt-3 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20 text-xs">
                    <div className="flex items-center gap-1.5 text-destructive font-semibold text-[10px] uppercase tracking-wider mb-0.5">
                      <XCircle className="h-3 w-3" /> Last rejection reason
                    </div>
                    <div className="text-foreground/80 italic break-words">“{s.rejectionReason}”</div>
                  </div>
                )}

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

                {/* Booking notes thread — admin & assigned guide */}
                {(currentRole === "admin" || s.assignedStaffId === currentStaffId) && (
                  <div className="mt-4">
                    <BookingNotesThread
                      shiftId={s.id}
                      canPost={currentRole === "admin" || s.assignedStaffId === currentStaffId}
                    />
                  </div>
                )}

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

                {onUpdateDeparture && !guideView && !pastView && (
                  <ShiftOverrideDeparture shift={s} onUpdateDeparture={onUpdateDeparture} />
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
                    {!pastView && !guideView && guide && onUnassign && (
                      <Button size="sm" variant="outline" onClick={() => onUnassign(s.id)} className="border-destructive/40 text-destructive hover:bg-destructive/5">
                        <UserX className="h-3.5 w-3.5 mr-1" /> Unassign
                      </Button>
                    )}
                    {!guideView && !pastView && (
                      <Button size="sm" variant="outline" onClick={() => onDuplicate(s)}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> {t.common.duplicate}
                      </Button>
                    )}
                    {!guideView && onGenerateInvoice && (
                      <Button size="sm" variant="outline" onClick={() => onGenerateInvoice(s)} className="border-primary/40 text-primary hover:bg-primary/5">
                        <FileText className="h-3.5 w-3.5 mr-1" /> Generate invoice
                      </Button>
                    )}
                    {!guideView && onDelete && (
                      <Button size="sm" variant="outline" onClick={() => onDelete(s)} className="border-destructive/40 text-destructive hover:bg-destructive/5">
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    )}
                  </div>
                </div>

                {currentRole === "admin" && <DispatchHistory shiftId={s.id} />}



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

function RejectShiftDialog({
  shift,
  open,
  onClose,
  onConfirm,
}: {
  shift: Shift | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, attachments: Attachment[]) => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason("");
    setAttachments([]);
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onConfirm(reason, attachments);
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this shift?</DialogTitle>
          <DialogDescription>
            {shift ? (
              <>
                <span className="font-medium">{shift.tourName}</span> · {shift.date} {shift.startTime}–{shift.endTime}
              </>
            ) : null}
            <div className="mt-1">The shift will go back to the unassigned pool and admins will be notified.</div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              placeholder="Sick today, double-booked, vehicle issue…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Visible to admins (and the next guide) in the booking notes thread.
            </p>
          </div>
          <AttachmentPicker attachments={attachments} onChange={setAttachments} maxFiles={3} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            {submitting ? "Rejecting…" : "Reject shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const expiresMs = new Date(expiresAt).getTime();
  const remaining = expiresMs - now;
  const expired = remaining <= 0;
  const mins = Math.max(0, Math.floor(remaining / 60_000));
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  const label = expired ? "Expired" : hours > 0 ? `${hours}h ${rem}m left` : `${rem}m left`;
  const urgent = !expired && remaining < 30 * 60_000;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md border ${
        expired
          ? "bg-destructive/10 border-destructive/30 text-destructive"
          : urgent
          ? "bg-warning/10 border-warning/40 text-warning-foreground"
          : "bg-muted border-border/60 text-muted-foreground"
      }`}
      title={`Auto-expires at ${new Date(expiresAt).toLocaleString()}`}
    >
      <Hourglass className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
