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

export const Route = createFileRoute("/calendar")({
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
  const { shifts, assignShift, updateShift } = useShiftsStore();
  const { notifyGuide } = useNotesStore();

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

  return (
    <AppShell>
      <PageHeader
        title={t.nav.calendar}
        subtitle="All scheduled tours across day, week and month."
      />
      <ShiftsCalendar shifts={shifts} staff={staff} onAssign={handleAssign} onUpdateDeparture={handleUpdateDeparture} />
    </AppShell>
  );
}
