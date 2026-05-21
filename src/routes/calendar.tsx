import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/current-user";
import { useStaffStore } from "@/lib/staff-store";
import { useShiftsStore } from "@/lib/shifts-store";
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

  // Guides have their own /shifts view; the all-tours calendar is admin-only.
  if (role !== "admin") {
    return <Navigate to="/shifts" />;
  }

  const handleAssign = async (shiftId: string, staffId: string) => {
    await assignShift(shiftId, staffId);
  };

  const handleUpdateDeparture = async (
    shiftId: string,
    patch: { startTime?: string; endTime?: string; meetingPoint?: string },
  ) => {
    await updateShift(shiftId, patch);
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
