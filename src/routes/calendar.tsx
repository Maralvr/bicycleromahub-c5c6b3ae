import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/current-user";
import { useStaffStore } from "@/lib/staff-store";
import { useShiftsStore } from "@/lib/shifts-store";
import { useNotesStore } from "@/lib/notes-store";
import { ShiftsCalendar } from "@/components/shifts-calendar";
import { Navigate } from "@tanstack/react-router";
import { parseCalendarSearch, useCalendarUrlState } from "@/lib/calendar-search";

export const Route = createFileRoute("/calendar")({
  validateSearch: parseCalendarSearch,
  head: () => ({
    meta: [
      { title: "Calendar — Bicycle Roma" },
      { name: "description", content: "Day, week and month overview of all scheduled tours." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { t } = useI18n();
  const { role } = useCurrentUser();
  const { staff } = useStaffStore();
  const { shifts, dateRange, setDateRange, assignShift, updateShift, loadShiftDetails } = useShiftsStore();
  const { notifyGuide } = useNotesStore();
  const calendarUrlState = useCalendarUrlState(Route);

  // Guides have their own /shifts view; the all-tours calendar is admin-only.
  if (role !== "admin") {
    return <Navigate to="/shifts" />;
  }

  const handleAssign = async (shiftId: string, staffId: string) => {
    const prev = shifts.find((s) => s.id === shiftId);
    await assignShift(shiftId, staffId);
    if (staffId) {
      const sh = prev ?? shifts.find((s) => s.id === shiftId);
      const reassigning = !!prev?.assignedStaffId && prev.assignedStaffId !== staffId;
      await notifyGuide({
        staffId,
        type: reassigning ? "reassigned" : "assigned",
        title: reassigning ? "Shift reassigned to you" : "New shift assigned",
        body: sh ? `${sh.tourName} on ${sh.date} at ${sh.startTime}` : "You've been assigned a new shift.",
        shiftId,
        link: "/shifts",
      });
    }
  };

  const handleUpdateDeparture = async (
    shiftId: string,
    patch: { date?: string; startTime?: string; endTime?: string; meetingPoint?: string; rate?: number | null; rateTitle?: string | null },
  ) => {
    const { rate, ...rest } = patch;
    await updateShift(shiftId, { ...rest, ...(rate !== undefined ? { rate: rate ?? undefined } : {}) });
  };

  // The store only fetches this month -> +30 days by default (fast initial
  // load). Paging the calendar forward/back past that window would
  // otherwise just show an empty month -- widen (never shrink) the fetch
  // range to cover whatever's actually on screen.
  const widenDateRange = (want: { from: string; to: string }) => {
    if (want.from < dateRange.from || want.to > dateRange.to) {
      setDateRange({
        from: want.from < dateRange.from ? want.from : dateRange.from,
        to: want.to > dateRange.to ? want.to : dateRange.to,
      });
    }
  };

  return (
    <AppShell>
      <PageHeader
        title={t.nav.calendar}
        subtitle="All scheduled tours across day, week and month."
      />
      <ShiftsCalendar shifts={shifts} staff={staff} onAssign={handleAssign} onUpdateDeparture={handleUpdateDeparture} onVisibleRangeChange={widenDateRange} onLoadShiftDetails={(ids) => void loadShiftDetails(ids)} {...calendarUrlState} />
    </AppShell>
  );
}
