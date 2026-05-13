import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar } from "@/components/avatar";
import { Shift, Staff } from "@/lib/mock-data";
import { ChevronLeft, ChevronRight, MapPin, Users, Clock, Euro, User, CalendarDays, CheckCircle2, AlertTriangle, AlertCircle, XCircle, Circle } from "lucide-react";

type View = "day" | "week" | "month";

/**
 * Status color system: solid bar + tinted bg + strong foreground contrast.
 * `bar`   — solid 4-6px accent stripe
 * `chip`  — chip background (tinted but readable on dark/light)
 * `dot`   — dot color in month view
 * `text`  — accent text
 * `ring`  — focus/hover outline
 */
const STATUS = {
  accepted: {
    label: "Accepted",
    Icon: CheckCircle2,
    bar: "bg-success",
    chip: "bg-success/12 hover:bg-success/20 border-success/40",
    dot: "bg-success",
    text: "text-success",
    ring: "ring-success/40",
  },
  pending: {
    label: "Pending",
    Icon: AlertCircle,
    bar: "bg-warning",
    chip: "bg-warning/15 hover:bg-warning/25 border-warning/40",
    dot: "bg-warning",
    text: "text-warning",
    ring: "ring-warning/40",
  },
  unassigned: {
    label: "Unassigned",
    Icon: AlertTriangle,
    bar: "bg-destructive",
    chip: "bg-destructive/12 hover:bg-destructive/20 border-destructive/40",
    dot: "bg-destructive",
    text: "text-destructive",
    ring: "ring-destructive/40",
  },
  rejected: {
    label: "Rejected",
    Icon: XCircle,
    bar: "bg-muted-foreground/60",
    chip: "bg-muted hover:bg-muted/80 border-border",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    ring: "ring-muted-foreground/40",
  },
} as const;

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
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

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

  // stats for the visible range
  const visibleShifts = useMemo(() => {
    if (view === "day") return shiftsByDate[toISO(cursor)] || [];
    if (view === "week") {
      const start = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => shiftsByDate[toISO(addDays(start, i))] || []).flat();
    }
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const out: Shift[] = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      out.push(...(shiftsByDate[toISO(d)] || []));
    }
    return out;
  }, [view, cursor, shiftsByDate]);

  const stats = useMemo(() => {
    const s = { total: visibleShifts.length, accepted: 0, pending: 0, unassigned: 0, rejected: 0 };
    for (const x of visibleShifts) s[x.status] += 1;
    return s;
  }, [visibleShifts]);

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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
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

      {/* Stats + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-4 flex-wrap">
          <Stat label="Tours" value={stats.total} accent="text-foreground" />
          <Sep />
          <Stat label="Accepted" value={stats.accepted} accent={STATUS.accepted.text} dot={STATUS.accepted.dot} />
          <Stat label="Pending" value={stats.pending} accent={STATUS.pending.text} dot={STATUS.pending.dot} />
          <Stat label="Unassigned" value={stats.unassigned} accent={STATUS.unassigned.text} dot={STATUS.unassigned.dot} />
          {stats.rejected > 0 && <Stat label="Rejected" value={stats.rejected} accent={STATUS.rejected.text} dot={STATUS.rejected.dot} />}
        </div>
        <div className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground">
          {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STATUS[k].dot}`} /> {STATUS[k].label}
            </span>
          ))}
        </div>
      </div>

      {view === "day" && (
        <DayView dateISO={toISO(cursor)} shifts={shiftsByDate[toISO(cursor)] || []} staff={staff} onOpenShift={setSelectedShift} />
      )}
      {view === "week" && (
        <WeekView cursor={cursor} shiftsByDate={shiftsByDate} staff={staff} onOpenDay={setSelectedDay} onOpenShift={setSelectedShift} todayISO={todayISO} />
      )}
      {view === "month" && (
        <MonthView cursor={cursor} shiftsByDate={shiftsByDate} onOpenDay={setSelectedDay} onOpenShift={setSelectedShift} todayISO={todayISO} />
      )}

      <DayDetailsDialog
        dateISO={selectedDay}
        shifts={selectedDay ? shiftsByDate[selectedDay] || [] : []}
        staff={staff}
        onClose={() => setSelectedDay(null)}
        onOpenShift={(s) => { setSelectedDay(null); setSelectedShift(s); }}
      />
      <ShiftDetailsDialog shift={selectedShift} staff={staff} onClose={() => setSelectedShift(null)} />
    </Card>
  );
}

function Stat({ label, value, accent, dot }: { label: string; value: number; accent: string; dot?: string }) {
  return (
    <div className="flex items-center gap-2">
      {dot && <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />}
      <div>
        <div className={`text-base font-bold tabular-nums leading-none ${accent}`}>{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">{label}</div>
      </div>
    </div>
  );
}
function Sep() { return <span className="h-6 w-px bg-border" />; }

function ShiftChip({ s, staff, onClick, dense = false, hideTime = false }: { s: Shift; staff: Staff[]; onClick: () => void; dense?: boolean; hideTime?: boolean }) {
  const guide = staff.find((x) => x.id === s.assignedStaffId);
  const meta = STATUS[s.status];
  const pax = s.participants ? s.participants.adults + s.participants.teens + s.participants.infants : 0;
  return (
    <button
      onClick={onClick}
      title={`${s.startTime} ${s.tourName} — ${guide?.name || "Unassigned"}`}
      className={`group relative w-full text-left rounded-md border overflow-hidden ${meta.chip} transition focus:outline-none focus:ring-2 ${meta.ring}`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${meta.bar}`} />
      <div className={`pl-2 ${dense ? "py-1 pr-1.5" : "py-1.5 pr-2"}`}>
        {!hideTime && (
          <div className="flex items-center gap-1 text-[11px] font-bold text-foreground">
            <Clock className="h-2.5 w-2.5 opacity-70" />
            <span className="tabular-nums">{s.startTime}</span>
            <span className={`ml-auto h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          </div>
        )}
        <div className="text-[11px] text-foreground font-semibold leading-tight line-clamp-2">{s.tourName}</div>
        {pax > 0 && (
          <div className="text-[10px] text-foreground/80 font-medium tabular-nums flex items-center gap-1 mt-0.5">
            <Users className="h-2.5 w-2.5" /> {pax}
          </div>
        )}
        {s.meetingPoint && !dense && (
          <div className="text-[9px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
            <MapPin className="h-2.5 w-2.5 shrink-0" /> <span className="truncate">{s.meetingPoint}</span>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
          {guide ? (
            <>
              <Avatar name={guide.name} initials={guide.avatar} size="sm" className="!h-3.5 !w-3.5 text-[8px] !rounded-full" />
              <span className="truncate">{guide.name}</span>
            </>
          ) : (
            <><User className="h-2.5 w-2.5" /> <span className="italic">Unassigned</span></>
          )}
        </div>
      </div>
    </button>
  );
}

function DayView({ dateISO, shifts, staff, onOpenShift }: { dateISO: string; shifts: Shift[]; staff: Staff[]; onOpenShift: (s: Shift) => void }) {
  void dateISO;
  if (shifts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-12 text-center border border-dashed border-border rounded-lg">
        No tours scheduled for this day.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {shifts.map((s) => {
        const guide = staff.find((x) => x.id === s.assignedStaffId);
        const meta = STATUS[s.status];
        const Icon = meta.Icon;
        return (
          <button
            key={s.id}
            onClick={() => onOpenShift(s)}
            className={`w-full text-left rounded-lg border ${meta.chip} relative overflow-hidden flex items-stretch transition focus:outline-none focus:ring-2 ${meta.ring}`}
          >
            <span className={`w-1.5 ${meta.bar}`} />
            <div className="flex items-center gap-3 p-3 flex-1 min-w-0">
              <div className="text-center shrink-0 min-w-[64px] py-1 rounded-md bg-card border border-border/60">
                <div className="text-sm font-bold tabular-nums text-foreground">{s.startTime}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">{s.endTime}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-foreground truncate">{s.tourName}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{s.meetingPoint}</span>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-foreground/80 shrink-0">
                {guide ? (
                  <>
                    <Avatar name={guide.name} initials={guide.avatar} size="sm" className="!h-6 !w-6 text-[10px] !rounded-full" />
                    <span className="font-medium">{guide.name}</span>
                  </>
                ) : (
                  <span className="italic text-destructive flex items-center gap-1"><User className="h-3 w-3" /> Unassigned</span>
                )}
              </div>
              <Badge variant="outline" className={`shrink-0 capitalize text-[10px] gap-1 ${meta.text} border-current/30`}>
                <Icon className="h-2.5 w-2.5" /> {meta.label}
              </Badge>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function WeekView({ cursor, shiftsByDate, staff, onOpenDay, onOpenShift, todayISO }: { cursor: Date; shiftsByDate: Record<string, Shift[]>; staff: Staff[]; onOpenDay: (d: string) => void; onOpenShift: (s: Shift) => void; todayISO: string }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  // Build a sorted set of unique start times present this week
  const timeRows = useMemo(() => {
    const set = new Set<string>();
    for (const d of days) for (const s of shiftsByDate[toISO(d)] || []) set.add(s.startTime);
    return Array.from(set).sort();
  }, [days, shiftsByDate]);

  // Index by time -> day -> shifts
  const cellMap = useMemo(() => {
    const m: Record<string, Record<string, Shift[]>> = {};
    for (const t of timeRows) m[t] = {};
    for (const d of days) {
      const iso = toISO(d);
      for (const s of shiftsByDate[iso] || []) {
        (m[s.startTime][iso] = m[s.startTime][iso] || []).push(s);
      }
    }
    return m;
  }, [days, shiftsByDate, timeRows]);

  if (timeRows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-12 text-center border border-dashed border-border rounded-lg">
        No tours scheduled this week.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div className="min-w-[900px]">
        {/* Header row */}
        <div className="grid grid-cols-[88px_repeat(7,minmax(0,1fr))] gap-1 sticky top-0 z-10 bg-background pb-1">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground py-2 px-2 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Start
          </div>
          {days.map((d) => {
            const iso = toISO(d);
            const isToday = iso === todayISO;
            const list = shiftsByDate[iso] || [];
            return (
              <button
                key={iso}
                onClick={() => onOpenDay(iso)}
                className={`text-center py-2 px-1 rounded-md border transition hover:bg-muted/50 ${
                  isToday ? "border-primary bg-primary/5" : "border-transparent"
                }`}
              >
                <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </div>
                <div className={`text-base font-bold leading-tight tabular-nums ${isToday ? "text-primary" : "text-foreground"}`}>
                  {d.getDate()}
                </div>
                {list.length > 0 && (
                  <div className="text-[9px] text-muted-foreground tabular-nums mt-0.5">{list.length} tours</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Time rows */}
        <div className="space-y-1 mt-1">
          {timeRows.map((t) => (
            <div key={t} className="grid grid-cols-[88px_repeat(7,minmax(0,1fr))] gap-1">
              <div className="flex items-start justify-end pr-2 pt-2 text-sm font-bold tabular-nums text-foreground border-r border-border/60">
                {t}
              </div>
              {days.map((d) => {
                const iso = toISO(d);
                const cellShifts = cellMap[t]?.[iso] || [];
                const isToday = iso === todayISO;
                return (
                  <div
                    key={iso}
                    className={`min-h-[72px] rounded-md border p-1 space-y-1 transition ${
                      isToday ? "bg-primary/[0.03] border-border" : "bg-card border-border/60"
                    }`}
                  >
                    {cellShifts.map((s) => (
                      <ShiftChip key={s.id} s={s} staff={staff} onClick={() => onOpenShift(s)} hideTime />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthView({ cursor, shiftsByDate, onOpenDay, onOpenShift, todayISO }: { cursor: Date; shiftsByDate: Record<string, Shift[]>; onOpenDay: (d: string) => void; onOpenShift: (s: Shift) => void; todayISO: string }) {
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
          // status counts per day
          const counts = list.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {} as Record<Shift["status"], number>);
          return (
            <div
              key={iso}
              role="button"
              tabIndex={0}
              onClick={() => onOpenDay(iso)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDay(iso); } }}
              className={`min-h-[96px] rounded-md border p-1.5 text-left transition relative overflow-hidden hover:border-primary/60 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer ${
                isToday ? "border-primary bg-primary/5" : "border-border"
              } ${inMonth ? "bg-card" : "bg-muted/20 opacity-60"}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={`text-xs font-bold tabular-nums ${isToday ? "text-primary-foreground bg-primary rounded-full h-5 w-5 flex items-center justify-center" : "text-foreground"}`}>
                  {d.getDate()}
                </div>
                {list.length > 0 && (
                  <span className="text-[9px] font-bold text-muted-foreground tabular-nums">{list.length}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 2).map((s) => {
                  const meta = STATUS[s.status];
                  return (
                    <button
                      key={s.id}
                      onClick={(e) => { e.stopPropagation(); onOpenShift(s); }}
                      className={`block w-full text-left text-[9px] truncate px-1.5 py-0.5 rounded border-l-2 ${meta.bar.replace("bg-", "border-")} bg-card text-foreground font-medium hover:bg-muted transition`}
                    >
                      <span className="tabular-nums">{s.startTime}</span> {s.tourName}
                    </button>
                  );
                })}
                {list.length > 2 && (
                  <div className="flex items-center gap-1 mt-1">
                    {(Object.keys(counts) as (keyof typeof counts)[]).map((k) =>
                      counts[k] ? (
                        <span key={k} className="flex items-center gap-0.5 text-[9px] text-muted-foreground font-medium">
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS[k].dot}`} />
                          {counts[k]}
                        </span>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayDetailsDialog({ dateISO, shifts, staff, onClose, onOpenShift }: { dateISO: string | null; shifts: Shift[]; staff: Staff[]; onClose: () => void; onOpenShift: (s: Shift) => void }) {
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
              const meta = STATUS[s.status];
              const Icon = meta.Icon;
              return (
                <button key={s.id} type="button" onClick={() => onOpenShift(s)} className={`w-full text-left rounded-lg border ${meta.chip} relative overflow-hidden transition focus:outline-none focus:ring-2 ${meta.ring} hover:brightness-105`}>
                  <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${meta.bar}`} />
                  <div className="p-3 pl-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="font-semibold text-sm text-foreground">{s.tourName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" /> <span className="tabular-nums">{s.startTime}–{s.endTime}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className={`capitalize text-[10px] shrink-0 gap-1 ${meta.text} border-current/30`}>
                        <Icon className="h-2.5 w-2.5" /> {meta.label}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-foreground/85">
                      <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-muted-foreground" /> {s.meetingPoint}</div>
                      <div className="flex items-center gap-1.5">
                        {guide ? (
                          <>
                            <Avatar name={guide.name} initials={guide.avatar} size="sm" className="!h-5 !w-5 text-[9px] !rounded-full" />
                            <span className="font-medium">{guide.name}</span>
                          </>
                        ) : (
                          <span className="italic text-destructive flex items-center gap-1"><User className="h-3 w-3" /> Unassigned</span>
                        )}
                      </div>
                      {s.participants && (
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3 w-3 text-muted-foreground" /> {s.participants.adults + s.participants.teens + s.participants.infants} pax
                        </div>
                      )}
                      {s.rate !== undefined && (
                        <div className="flex items-center gap-1.5"><Euro className="h-3 w-3 text-muted-foreground" /> {s.rate}</div>
                      )}
                    </div>
                    {s.customer && (
                      <div className="mt-2 text-xs text-foreground/80">
                        Customer: <span className="font-medium">{s.customer.name}</span> · {s.customer.phone}
                      </div>
                    )}
                    {s.notes && <div className="mt-2 text-xs italic text-muted-foreground">📝 {s.notes}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// satisfy unused import linter for icons used only conditionally
void Circle;
