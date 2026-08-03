import { createFileRoute } from "@tanstack/react-router";
import { ShiftsCalendar } from "@/components/shifts-calendar";
import type { Shift } from "@/lib/mock-data";

export const Route = createFileRoute("/reset-password-pvcheck")({
  component: Check,
});

const base = {
  id: "1",
  bookingId: "BIC-T140301039",
  tourName: "Appia Antica, Aqueduct Park and Catacombs",
  date: new Date().toISOString().slice(0, 10),
  startTime: "09:00",
  endTime: "13:00",
  meetingPoint: "Circus Maximus",
  participants: 2,
  adults: 2,
  children: 0,
  status: "accepted",
  source: "bokun",
  assignedStaffId: null,
  rate: 100,
} as unknown as Shift;

const shifts: Shift[] = [
  { ...base, id: "1", rateTitle: "Private tour in English" } as Shift,
  { ...base, id: "2", rateTitle: "Public tour in English", startTime: "15:00" } as Shift,
];

function Check() {
  return (
    <div className="p-4">
      <ShiftsCalendar shifts={shifts} staff={[]} onAssign={async () => {}} />
    </div>
  );
}
