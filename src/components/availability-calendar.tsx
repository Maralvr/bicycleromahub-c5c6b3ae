import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, Clock, CalendarOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Staff, Shift } from "@/lib/mock-data";
import { useStaffStore } from "@/lib/staff-store";

type Props = {
  staffMember: Staff;
  shifts: Shift[];
  readOnly?: boolean;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Build a 6-week grid (42 cells) starting on Monday for the given month.
 * Cells outside the active month are still returned, marked `outside: true`.
 */
function buildMonthGrid(month: Date) {
  const first = startOfMonth(month);
  // JS getDay(): Sun=0..Sat=6 → convert to Mon=0..Sun=6
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {
      date: d,
      iso: ymd(d),
      outside: d.getMonth() !== month.getMonth(),
    };
  });
}

export function AvailabilityCalendar({ staffMember, shifts, readOnly = false }: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const { toggleAllDay, setTimeWindow, clearDate, clearMonth } = useStaffStore();

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const yearMonth = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const today = ymd(new Date());

  // Index shifts and unavailability by ISO date for quick lookup
  const shiftsByDate = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) {
      if (s.assignedStaffId !== staffMember.id) continue;
      if (s.status === "rejected") continue;
      const arr = m.get(s.date) ?? [];
      arr.push(s);
      m.set(s.date, arr);
    }
    return m;
  }, [shifts, staffMember.id]);

  const unavailByDate = useMemo(() => {
    const m = new Map<string, Staff["unavailability"][number]>();
    for (const u of staffMember.unavailability) m.set(u.date, u);
    return m;
  }, [staffMember.unavailability]);

  const monthUnavailCount = staffMember.unavailability.filter((u) => u.date.startsWith(yearMonth)).length;

  const markWeekendsOff = () => {
    grid.forEach((cell) => {
      if (cell.outside) return;
      const dow = (cell.date.getDay() + 6) % 7; // 5=Sat,6=Sun
      if (dow >= 5 && !shiftsByDate.has(cell.iso)) {
        const existing = unavailByDate.get(cell.iso);
        if (!existing?.allDay) toggleAllDay(staffMember.id, cell.iso, "Weekend");
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* Header: month nav + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold text-foreground capitalize tabular-nums min-w-[140px] text-center">{monthLabel}</div>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setCursor(startOfMonth(new Date()))}>Today</Button>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={markWeekendsOff}>
              Mark weekends off
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={monthUnavailCount === 0}
              onClick={() => clearMonth(staffMember.id, yearMonth)}
            >
              Clear month
            </Button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success/30 border border-success/50" /> Available</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-destructive/25 border border-destructive/50" /> Off (all day)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warning/25 border border-warning/50" /> Partial</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/25 border border-primary/60" /> Assigned shift</span>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell) => {
          const cellShifts = shiftsByDate.get(cell.iso) ?? [];
          const unavail = unavailByDate.get(cell.iso);
          const isToday = cell.iso === today;
          const hasShift = cellShifts.length > 0;
          const isOff = unavail?.allDay;
          const isPartial = unavail && !unavail.allDay;

          const cellClasses = cn(
            "relative aspect-square rounded-md border text-xs p-1.5 flex flex-col items-start transition-all overflow-hidden",
            cell.outside ? "opacity-30" : "hover:border-primary/40",
            isToday && "ring-2 ring-primary/40",
            hasShift && "bg-primary/15 border-primary/40",
            isOff && "bg-destructive/15 border-destructive/40",
            isPartial && !isOff && "bg-warning/15 border-warning/40",
            !hasShift && !isOff && !isPartial && "bg-card border-border/60 hover:bg-success/5",
            readOnly && "cursor-default",
            !readOnly && !cell.outside && !hasShift && "cursor-pointer",
          );

          const dayContent = (
            <>
              <div className="flex items-center justify-between w-full">
                <span className={cn("font-semibold tabular-nums", isToday && "text-primary")}>{cell.date.getDate()}</span>
                {isOff && <CalendarOff className="h-2.5 w-2.5 text-destructive shrink-0" />}
                {isPartial && !isOff && <Clock className="h-2.5 w-2.5 text-warning-foreground shrink-0" />}
              </div>
              {hasShift && (
                <div className="text-[9px] text-primary font-medium mt-auto truncate w-full leading-tight">
                  {cellShifts[0].startTime}
                  {cellShifts.length > 1 && ` +${cellShifts.length - 1}`}
                </div>
              )}
              {isPartial && !hasShift && unavail?.from && (
                <div className="text-[9px] text-warning-foreground mt-auto truncate w-full leading-tight">
                  {unavail.from}–{unavail.to}
                </div>
              )}
              {isOff && !hasShift && (
                <div className="text-[9px] text-destructive font-medium mt-auto leading-tight">Off</div>
              )}
            </>
          );

          // Read-only OR shifts assigned → don't open the popover
          if (readOnly || hasShift || cell.outside) {
            return (
              <div key={cell.iso} className={cellClasses} title={hasShift ? cellShifts.map((s) => `${s.startTime} ${s.tourName}`).join("\n") : undefined}>
                {dayContent}
              </div>
            );
          }

          return (
            <Popover key={cell.iso}>
              <PopoverTrigger asChild>
                <button type="button" className={cellClasses}>{dayContent}</button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <DayEditor
                  staffId={staffMember.id}
                  date={cell.iso}
                  current={unavail}
                  onToggleAllDay={() => toggleAllDay(staffMember.id, cell.iso)}
                  onSetWindow={(from, to) => setTimeWindow(staffMember.id, cell.iso, from, to)}
                  onClear={() => clearDate(staffMember.id, cell.iso)}
                />
              </PopoverContent>
            </Popover>
          );
        })}
      </div>

      {/* Summary */}
      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
        {monthUnavailCount === 0 ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-success" />
            Fully available this month — {grid.filter((c) => !c.outside).length} days open.
          </>
        ) : (
          <>
            <CalendarOff className="h-3 w-3" />
            {monthUnavailCount} day{monthUnavailCount === 1 ? "" : "s"} marked unavailable in {monthLabel}.
          </>
        )}
      </div>
    </div>
  );
}

function DayEditor({
  date,
  current,
  onToggleAllDay,
  onSetWindow,
  onClear,
}: {
  staffId: string;
  date: string;
  current: Staff["unavailability"][number] | undefined;
  onToggleAllDay: () => void;
  onSetWindow: (from: string, to: string) => void;
  onClear: () => void;
}) {
  const [from, setFrom] = useState(current?.from ?? "09:00");
  const [to, setTo] = useState(current?.to ?? "13:00");
  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Edit availability</div>
        <div className="text-sm font-semibold text-foreground capitalize">{dateLabel}</div>
      </div>

      <Button
        variant={current?.allDay ? "default" : "outline"}
        size="sm"
        className="w-full justify-start h-9 text-xs"
        onClick={onToggleAllDay}
      >
        <CalendarOff className="h-3.5 w-3.5 mr-2" />
        {current?.allDay ? "Off all day · click to clear" : "Mark off all day"}
      </Button>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Or busy during</div>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="flex-1 h-9 text-xs rounded-md bg-card border border-border px-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 tabular-nums"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="time"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 h-9 text-xs rounded-md bg-card border border-border px-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 tabular-nums"
          />
        </div>
        <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => onSetWindow(from, to)}>
          <Clock className="h-3.5 w-3.5 mr-1.5" /> Save time window
        </Button>
      </div>

      {current && (
        <Button variant="ghost" size="sm" className="w-full h-8 text-xs text-destructive hover:text-destructive" onClick={onClear}>
          <X className="h-3.5 w-3.5 mr-1" /> Remove unavailability
        </Button>
      )}
    </div>
  );
}
