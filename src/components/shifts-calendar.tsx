import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar } from "@/components/avatar";
import { Shift, Staff } from "@/lib/mock-data";
import { ChevronLeft, ChevronRight, MapPin, Users, Clock, Euro, User, CalendarDays } from "lucide-react";

type View = "day" | "week" | "month";

const STATUS_COLOR: Record<Shift["status"], string> = {
  accepted: "bg-success/15 border-success/40 text-success-foreground",
  pending: "bg-warning/15 border-warning/40 text-warning-foreground",
  unassigned: "bg-destructive/15 border-destructive/40 text-destructive-foreground",
  rejected: "bg-muted border-border text-muted-foreground",
};

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday-first
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function ShiftsCalendar({ shifts, staff }: { shifts: Shift[]; staff: Staff[] }) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const shiftsByDate = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    for (const s of shifts) {
      (map[s.date] = map[s.date] || []).push(s);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [shifts]);

  const navigate = (dir: -1 | 1) => {
    if (view === "day") setCursor(addDays(cursor, dir));
    else if (view === "week") setCursor(addDays(cursor, dir * 7));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
  };

  const title = useMemo(() => {
    if (view === "day") return cursor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${e.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
    }
    return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [view, cursor]);

  const todayISO = toISO(new Date());

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
          <h3 className="font-semibold text-base ml-2 capitalize">{title}</h3>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList className="bg-muted">
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === "day" && (
        <DayView dateISO={toISO(cursor)} shifts={shiftsByDate[toISO(cursor)] || []} staff={staff} onOpen={setSelectedDay} todayISO={todayISO} />
      )}
      {view === "week" && (
        <WeekView cursor={cursor} shiftsByDate={shiftsByDate} staff={staff} onOpen={setSelectedDay} todayISO={todayISO} />
      )}
      {view === "month" && (
        <MonthView cursor={cursor} shiftsByDate={shiftsByDate} onOpen={setSelectedDay} todayISO={todayISO} />
      )}

      <DayDetailsDialog
        dateISO={selectedDay}
        shifts={selectedDay ? shiftsByDate[selectedDay] || [] : []}
        staff={staff}
        onClose={() => setSelectedDay(null)}
      />
    </Card>
  );
}

function ShiftChip({ s, staff, onClick }: { s: Shift; staff: Staff[]; onClick: () => void }) {
  const guide = staff.find((x) => x.id === s.assignedStaffId);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-[11px] leading-tight p-1.5 rounded border ${STATUS_COLOR[s.status]} hover:brightness-110 transition`}
    >
      <div className="font-semibold flex items-center gap-1">
        <Clock className="h-2.5 w-2.5" />
        {s.startTime}
      </div>
      <div className="truncate font-medium">{s.tourName}</div>
      <div className="truncate opacity-80">{guide ? guide.name : "Unassigned"}</div>
    </button>
  );
}

function DayView({ dateISO, shifts, staff, onOpen, todayISO }: { dateISO: string; shifts: Shift[]; staff: Staff[]; onOpen: (d: string) => void; todayISO: string }) {
  if (shifts.length === 0) {
    return <div className="text-sm text-muted-foreground italic py-12 text-center">No tours scheduled for this day.</div>;
  }
  return (
    <div className="space-y-2">
      {shifts.map((s) => {
        const guide = staff.find((x) => x.id === s.assignedStaffId);
        return (
          <button
            key={s.id}
            onClick={() => onOpen(dateISO)}
            className={`w-full text-left p-3 rounded-lg border ${STATUS_COLOR[s.status]} hover:brightness-105 transition flex items-center gap-3`}
          >
            <div className="text-center shrink-0 min-w-[60px]">
              <div className="text-xs font-semibold">{s.startTime}</div>
              <div className="text-[10px] opacity-70">{s.endTime}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{s.tourName}</div>
              <div className="text-xs opacity-80 flex items-center gap-2 mt-0.5">
                <MapPin className="h-3 w-3" /> <span className="truncate">{s.meetingPoint}</span>
              </div>
            </div>
            <div className="text-xs flex items-center gap-1.5 shrink-0">
              <User className="h-3 w-3" /> {guide?.name || "Unassigned"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function WeekView({ cursor, shiftsByDate, staff, onOpen, todayISO }: { cursor: Date; shiftsByDate: Record<string, Shift[]>; staff: Staff[]; onOpen: (d: string) => void; todayISO: string }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const iso = toISO(d);
        const list = shiftsByDate[iso] || [];
        const isToday = iso === todayISO;
        return (
          <div key={iso} className={`rounded-lg border ${isToday ? "border-primary bg-primary/5" : "border-border bg-card"} p-2 min-h-[180px]`}>
            <button onClick={() => onOpen(iso)} className="w-full text-left mb-2 hover:opacity-70 transition">
              <div className="text-[10px] uppercase text-muted-foreground font-semibold">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className={`text-lg font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{d.getDate()}</div>
            </button>
            <div className="space-y-1">
              {list.slice(0, 4).map((s) => (
                <ShiftChip key={s.id} s={s} staff={staff} onClick={() => onOpen(iso)} />
              ))}
              {list.length > 4 && (
                <button onClick={() => onOpen(iso)} className="text-[10px] text-primary hover:underline w-full text-left">
                  + {list.length - 4} more
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ cursor, shiftsByDate, onOpen, todayISO }: { cursor: Date; shiftsByDate: Record<string, Shift[]>; onOpen: (d: string) => void; todayISO: string }) {
  const first = startOfMonth(cursor);
  const last = endOfMonth(cursor);
  const gridStart = startOfWeek(first);
  const totalDays = Math.ceil((last.getTime() - gridStart.getTime()) / 86400000) + 1;
  const cells = Math.ceil(totalDays / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => addDays(gridStart, i));
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((w) => (
          <div key={w} className="text-[10px] uppercase font-semibold text-muted-foreground text-center py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = toISO(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const list = shiftsByDate[iso] || [];
          const isToday = iso === todayISO;
          return (
            <button
              key={iso}
              onClick={() => onOpen(iso)}
              className={`min-h-[88px] rounded-md border p-1.5 text-left transition hover:border-primary/60 ${
                isToday ? "border-primary bg-primary/5" : "border-border"
              } ${inMonth ? "bg-card" : "bg-muted/30 opacity-60"}`}
            >
              <div className={`text-xs font-semibold mb-1 ${isToday ? "text-primary" : "text-foreground"}`}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {list.slice(0, 2).map((s) => (
                  <div key={s.id} className={`text-[9px] truncate px-1 py-0.5 rounded border ${STATUS_COLOR[s.status]}`}>
                    {s.startTime} {s.tourName}
                  </div>
                ))}
                {list.length > 2 && (
                  <div className="text-[9px] text-muted-foreground font-medium">+{list.length - 2} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayDetailsDialog({ dateISO, shifts, staff, onClose }: { dateISO: string | null; shifts: Shift[]; staff: Staff[]; onClose: () => void }) {
  const open = !!dateISO;
  const dateLabel = dateISO ? new Date(dateISO).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 capitalize">
            <CalendarDays className="h-5 w-5 text-primary" /> {dateLabel}
          </DialogTitle>
          <DialogDescription>
            {shifts.length} {shifts.length === 1 ? "tour" : "tours"} scheduled
          </DialogDescription>
        </DialogHeader>
        {shifts.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-8 text-center">No tours scheduled.</div>
        ) : (
          <div className="space-y-3">
            {shifts.map((s) => {
              const guide = staff.find((x) => x.id === s.assignedStaffId);
              return (
                <div key={s.id} className={`p-3 rounded-lg border ${STATUS_COLOR[s.status]}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-semibold text-sm">{s.tourName}</div>
                      <div className="text-xs opacity-80 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" /> {s.startTime}–{s.endTime}
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize text-[10px] shrink-0">{s.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {s.meetingPoint}</div>
                    <div className="flex items-center gap-1.5">
                      {guide ? <Avatar name={guide.name} initials={guide.avatar} size="sm" /> : <User className="h-3 w-3" />}
                      {guide?.name || "Unassigned"}
                    </div>
                    {s.participants && (
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3 w-3" /> {s.participants.adults + s.participants.teens + s.participants.infants} pax
                      </div>
                    )}
                    {s.rate !== undefined && (
                      <div className="flex items-center gap-1.5"><Euro className="h-3 w-3" /> {s.rate}</div>
                    )}
                  </div>
                  {s.customer && (
                    <div className="mt-2 text-xs opacity-80">
                      Customer: <span className="font-medium">{s.customer.name}</span> · {s.customer.phone}
                    </div>
                  )}
                  {s.notes && <div className="mt-2 text-xs italic opacity-80">📝 {s.notes}</div>}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
