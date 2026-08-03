import { createFileRoute } from "@tanstack/react-router";
import { ShiftsCalendar } from "@/components/shifts-calendar";
import { parseCalendarSearch, useCalendarUrlState } from "@/lib/calendar-search";
import type { Shift } from "@/lib/mock-data";
import { useState } from "react";

export const Route = createFileRoute("/reset-password-cursorcheck")({
  validateSearch: parseCalendarSearch,
  component: Harness,
});

const shifts: Shift[] = [
  {
    id: "s1",
    tourName: "Colosseum Bike Tour",
    date: "2026-08-17",
    startTime: "09:00",
    endTime: "12:00",
    meetingPoint: "Piazza Venezia",
    status: "unassigned",
    source: "bokun",
    assignedStaffId: null,
    participants: { adults: 2, teens: 0, infants: 0 },
  } as unknown as Shift,
];

function Harness() {
  const cal = useCalendarUrlState(Route);
  const [gen, setGen] = useState(0);
  return (
    <div className="p-4">
      <button data-testid="remount" onClick={() => setGen((g) => g + 1)}>
        force remount
      </button>
      <ShiftsCalendar key={gen} shifts={shifts} staff={[]} {...cal} />
    </div>
  );
}
