import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { RateTitleField } from "@/components/rate-title-field";
import { AssignGuideCombobox } from "@/components/assign-guide-combobox";
import { Shift, Staff } from "@/lib/mock-data";
import { cleanNoteText } from "@/lib/notes-format";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Users,
  Clock,
  Euro,
  User,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Circle,
  UserPlus,
  UserMinus,
  Search,
  Trash2,
  ChevronDown,
} from "lucide-react";

type AssignFn = (shiftId: string, staffId: string, staffName: string) => void | Promise<void>;
type DeparturePatch = { date?: string; startTime?: string; endTime?: string; meetingPoint?: string; rate?: number | null; rateTitle?: string | null };
type UpdateDepartureFn = (shiftId: string, patch: DeparturePatch) => void | Promise<void>;

type View = "day" | "week" | "month";
export type CalendarShift = Shift & { groupedShifts?: Shift[] };

// Bokun sync stores the literal string "TBD" when no pickup/meeting-point
// field is set on the booking (see bokun-import.server.ts). It's cheap to
// show or hide -- it's already-synced table data, not a live fetch -- but
// showing the raw placeholder as if it were a real address is confusing on
// the compact calendar cards. Hide it there instead; the full shift detail
// dialog still shows/edits it since that's where an admin would fix it.
const hasRealMeetingPoint = (mp?: string | null): boolean =>
  !!mp && mp.trim().toUpperCase() !== "TBD";

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

/**
 * Manual bookings get a distinct purple chip background, but the status
 * stripe (bar), dot and icon stay in the assignment-status color so you can
 * tell unassigned / pending / accepted / rejected at a glance.
 */
function metaOf(s: { source: Shift["source"]; status: Shift["status"] }) {
  const status = STATUS[s.status];
  if (s.source !== "manual") return status;
  return {
    label: `Manual · ${status.label}`,
    Icon: status.Icon,
    bar: status.bar, // status color stripe stays
    chip: "bg-manual/15 hover:bg-manual/25 border-manual/50",
    dot: status.dot, // status color dot stays
    text: status.text,
    ring: "ring-manual/50",
  } as const;
}

const MANUAL_LEGEND = {
  label: "Manual",
  dot: "bg-manual",
} as const;



function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function paxOf(s: Shift) {
  return s.participants ? s.participants.adults + s.participants.teens + s.participants.infants : 0;
}

function capacityForTitle(title: string) {
  const t = title.toLowerCase();
  if (t.includes("rome by e-bike")) return 15;
  if (t.includes("appian way bike rental")) return 15;
  if (t.includes("electric bike rental at appia") || t.includes("noleggio biciclette elettriche"))
    return 70;
  if (t.includes("regular bikes at appia")) return 50;
  return null;
}

function groupedStatus(items: Shift[]): Shift["status"] {
  if (items.some((s) => s.status === "unassigned")) return "unassigned";
  if (items.some((s) => s.status === "pending")) return "pending";
  if (items.every((s) => s.status === "accepted")) return "accepted";
  return "rejected";
}

function groupDepartures(shifts: Shift[]): CalendarShift[] {
  const groups = new Map<string, Shift[]>();
  const singles: CalendarShift[] = [];

  for (const shift of shifts) {
    const rate = (shift.rateTitle ?? "").trim();
    const isPrivate = /private/i.test(rate);
    if (shift.source !== "bokun" || isPrivate) {
      // Private tours and manual shifts never merge with other bookings.
      singles.push(shift);
      continue;
    }
    // Group only when the tour, date, start time AND rate (language) all match.
    const key = `${shift.date}|${shift.startTime}|${shift.tourName.trim().toLowerCase()}|${rate.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), shift]);
  }

  const departures = Array.from(groups.values()).map((items) => {
    const first = items[0];
    const assigned = Array.from(new Set(items.map((s) => s.assignedStaffId).filter(Boolean)));
    const total = items.reduce((sum, s) => sum + paxOf(s), 0);
    const trailers = items.reduce((sum, s) => sum + (s.participants?.trailers ?? 0), 0);
    const rate = items.reduce((sum, s) => sum + (s.rate ?? 0), 0);

    return {
      ...first,
      id: `departure:${first.date}:${first.startTime}:${first.tourName}:${(first.rateTitle ?? "").toLowerCase()}`,
      bookingId: items.length === 1 ? first.bookingId : `${items.length} bookings`,
      assignedStaffId: assigned.length === 1 ? assigned[0] : null,
      status: groupedStatus(items),
      participants: { adults: total, teens: 0, infants: 0, trailers },
      rate: rate || undefined,
      groupedShifts: items.sort((a, b) =>
        (a.customer?.name ?? "").localeCompare(b.customer?.name ?? ""),
      ),
    } satisfies CalendarShift;
  });

  return [...singles, ...departures].sort((a, b) =>
    (a.startTime + a.tourName).localeCompare(b.startTime + b.tourName),
  );
}

export function ShiftsCalendar({
  shifts,
  staff,
  onAssign,
  onUnassign,
  onDelete,
  onUpdateDeparture,
  showRates = true,
  onShiftClick,
  renderDayOverlay,
  renderDayDialogSection,
  onVisibleRangeChange,
  onLoadShiftDetails,
}: {
  shifts: Shift[];
  staff: Staff[];
  onAssign?: AssignFn;
  onUnassign?: (shiftId: string) => void | Promise<void>;
  onDelete?: (shift: Shift) => void | Promise<void>;
  onUpdateDeparture?: UpdateDepartureFn;
  showRates?: boolean;
  onShiftClick?: (s: CalendarShift) => void;
  renderDayOverlay?: (iso: string) => React.ReactNode;
  renderDayDialogSection?: (iso: string) => React.ReactNode;
  // Fires whenever day/week/month navigation moves the visible window,
  // with the ISO bounds of whatever's currently on screen. Lets a parent
  // that fetches shifts for a limited date range (for load-time
  // performance) know it needs to widen that range -- otherwise paging
  // this calendar forward just shows an empty month once you page past
  // whatever the parent already fetched.
  onVisibleRangeChange?: (range: { from: string; to: string }) => void;
  // Called with the ids of the booking(s) being opened, so a parent backed by a
  // column-limited list query can lazily fetch the heavy detail columns
  // (participant list, ops notes) only for what's actually being viewed.
  onLoadShiftDetails?: (ids: string[]) => void;
}) {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1023px)").matches : false,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setIsNarrow(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const [view, setView] = useState<View>(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches ? "day" : "week"
  ));
  // (Month view has a mobile-friendly variant below.)
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedShift, setSelectedShift] = useState<CalendarShift | null>(null);
  const openShift = (s: CalendarShift) => {
    if (onShiftClick) onShiftClick(s);
    else setSelectedShift(s);
  };
  const [platform, setPlatform] = useState<"all" | "bokun" | "manual">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "unassigned" | "pending" | "accepted" | "rejected"
  >("all");

  const filteredShifts = useMemo(() => {
    const byPlatform = shifts.filter((s) => platform === "all" || s.source === platform);
    return groupDepartures(byPlatform).filter(
      (s) => statusFilter === "all" || s.status === statusFilter,
    );
  }, [shifts, platform, statusFilter]);

  const shiftsByDate = useMemo(() => {
    const map: Record<string, CalendarShift[]> = {};
    for (const s of filteredShifts) {
      (map[s.date] = map[s.date] || []).push(s);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [filteredShifts]);

  // stats for the visible range
  const visibleShifts = useMemo(() => {
    if (view === "day") return shiftsByDate[toISO(cursor)] || [];
    if (view === "week") {
      const start = startOfWeek(cursor);
      return Array.from(
        { length: 7 },
        (_, i) => shiftsByDate[toISO(addDays(start, i))] || [],
      ).flat();
    }
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const out: CalendarShift[] = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      out.push(...(shiftsByDate[toISO(d)] || []));
    }
    return out;
  }, [view, cursor, shiftsByDate]);

  // Tell the parent what date window is actually on screen right now, so it
  // can widen its fetch range if navigation just paged past what it loaded.
  // Padded a day on each side to be safe with local/UTC boundary rounding.
  useEffect(() => {
    if (!onVisibleRangeChange) return;
    let start: Date;
    let end: Date;
    if (view === "day") {
      start = cursor;
      end = cursor;
    } else if (view === "week") {
      start = startOfWeek(cursor);
      end = addDays(start, 6);
    } else {
      start = startOfMonth(cursor);
      end = endOfMonth(cursor);
    }
    onVisibleRangeChange({ from: toISO(addDays(start, -1)), to: toISO(addDays(end, 1)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursor]);

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
    if (view === "day")
      return cursor.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${e.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
    }
    return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [view, cursor]);

  const todayISO = toISO(new Date());

  return (
    <Card className="overflow-hidden border-border/70 bg-card p-0 shadow-sm">
      <div className="border-b border-border/70 bg-muted/20 p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border border-border bg-background p-1 shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                aria-label="Previous"
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCursor(new Date())}
                className="h-8 px-3 text-xs font-semibold"
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(1)}
                aria-label="Next"
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold capitalize tracking-tight text-foreground">
                {title}
              </h3>
              <p className="text-xs text-muted-foreground">
                {stats.total} tours in this {view}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterMenu
              label="Source"
              value={platform}
              onChange={(v) => setPlatform(v as "all" | "bokun" | "manual")}
              options={[
                { value: "all", label: "All sources" },
                { value: "bokun", label: "Bokun" },
                { value: "manual", label: "Manual" },
              ]}
            />
            <FilterMenu
              label="Status"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as typeof statusFilter)}
              options={[
                { value: "all", label: "All statuses" },
                { value: "unassigned", label: "Unassigned", dot: STATUS.unassigned.dot },
                { value: "pending", label: "Pending", dot: STATUS.pending.dot },
                { value: "accepted", label: "Accepted", dot: STATUS.accepted.dot },
                { value: "rejected", label: "Rejected", dot: STATUS.rejected.dot },
              ]}
            />
            <Tabs value={view} onValueChange={(v) => setView(v as View)}>
              <TabsList className="h-9 bg-background shadow-sm">
                <TabsTrigger value="day" className="text-xs">
                  Day
                </TabsTrigger>
                <TabsTrigger value="week" className="text-xs">
                  Week
                </TabsTrigger>
                <TabsTrigger value="month" className="text-xs">
                  Month
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="hidden items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-[11px] text-muted-foreground shadow-sm md:flex">
            {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${STATUS[k].dot}`} /> {STATUS[k].label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${MANUAL_LEGEND.dot}`} /> {MANUAL_LEGEND.label}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-border/70 bg-background p-4 sm:grid-cols-2 lg:grid-cols-4 lg:p-5">
        <Stat label="Tours" value={stats.total} accent="text-foreground" helper="Total scheduled" />
        <Stat
          label="Accepted"
          value={stats.accepted}
          accent={STATUS.accepted.text}
          dot={STATUS.accepted.dot}
          helper="Confirmed ops"
          active={statusFilter === "accepted"}
          onClick={() => setStatusFilter(statusFilter === "accepted" ? "all" : "accepted")}
        />
        <Stat
          label="Pending"
          value={stats.pending}
          accent={STATUS.pending.text}
          dot={STATUS.pending.dot}
          helper="Awaiting guide"
          active={statusFilter === "pending"}
          onClick={() => setStatusFilter(statusFilter === "pending" ? "all" : "pending")}
        />
        <Stat
          label="Unassigned"
          value={stats.unassigned}
          accent={STATUS.unassigned.text}
          dot={STATUS.unassigned.dot}
          helper="Needs attention"
          active={statusFilter === "unassigned"}
          onClick={() => setStatusFilter(statusFilter === "unassigned" ? "all" : "unassigned")}
        />
      </div>

      <div className="p-4 sm:p-5">
        {view === "day" && (
          <DayView
            dateISO={toISO(cursor)}
            shifts={shiftsByDate[toISO(cursor)] || []}
            staff={staff}
            onOpenShift={openShift}
          />
        )}
        {view === "week" && !isNarrow && (
          <WeekView
            cursor={cursor}
            shiftsByDate={shiftsByDate}
            staff={staff}
            onOpenDay={setSelectedDay}
            onOpenShift={openShift}
            todayISO={todayISO}
          />
        )}
        {view === "week" && isNarrow && (
          <WeekViewMobile
            cursor={cursor}
            shiftsByDate={shiftsByDate}
            staff={staff}
            onOpenDay={setSelectedDay}
            onOpenShift={openShift}
            todayISO={todayISO}
          />
        )}
        {view === "month" && !isNarrow && (
          <MonthView
            cursor={cursor}
            shiftsByDate={shiftsByDate}
            onOpenDay={setSelectedDay}
            onOpenShift={openShift}
            todayISO={todayISO}
            renderDayOverlay={renderDayOverlay}
          />
        )}
        {view === "month" && isNarrow && (
          <MonthViewMobile
            cursor={cursor}
            shiftsByDate={shiftsByDate}
            staff={staff}
            onOpenDay={setSelectedDay}
            onOpenShift={openShift}
            todayISO={todayISO}
          />
        )}
      </div>

      <DayDetailsDialog
        dateISO={selectedDay}
        shifts={selectedDay ? shiftsByDate[selectedDay] || [] : []}
        staff={staff}
        showRates={showRates}
        onClose={() => setSelectedDay(null)}
        onOpenShift={(s) => {
          setSelectedDay(null);
          openShift(s);
        }}
        renderDayDialogSection={renderDayDialogSection}
      />
      <ShiftDetailsDialog
        shift={selectedShift}
        staff={staff}
        allShifts={shifts}
        showRates={showRates}
        onClose={() => setSelectedShift(null)}
        onAssign={onAssign}
        onUnassign={onUnassign}
        onDelete={onDelete}
        onUpdateDeparture={onUpdateDeparture}
      />
    </Card>
  );
}

function FilterMenu<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; dot?: string }[];
}) {
  const isDefault = value === options[0]?.value;
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-1.5 bg-background px-3 text-xs shadow-sm",
            !isDefault && "border-primary/50 bg-primary/5 text-primary",
          )}
        >
          {current?.dot && <span className={cn("h-2 w-2 rounded-full", current.dot)} />}
          <span className="max-w-[92px] truncate sm:max-w-none">
            {isDefault ? label : (current?.label ?? label)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="gap-2 text-xs">
              {o.dot && <span className={cn("h-2 w-2 rounded-full", o.dot)} />}
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Stat({
  label,
  value,
  accent,
  dot,
  helper,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent: string;
  dot?: string;
  helper?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  const base =
    "rounded-lg border bg-muted/20 p-3 shadow-sm text-left w-full transition-colors";
  const interactiveCls = interactive
    ? "cursor-pointer hover:bg-muted/40 hover:border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
    : "";
  const activeCls = active ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30" : "border-border/70";
  const Comp = interactive ? "button" : "div";
  return (
    <Comp
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={`${base} ${activeCls} ${interactiveCls}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          {helper && <div className="mt-0.5 text-xs text-muted-foreground">{helper}</div>}
        </div>
        {dot && <span className={`mt-1 h-2.5 w-2.5 rounded-full ${dot}`} />}
      </div>
      <div className={`mt-3 text-2xl font-bold tabular-nums leading-none ${accent}`}>{value}</div>
      {interactive && (
        <div className="mt-1 text-[10px] text-muted-foreground/80">
          {active ? "Filter active — click to clear" : "Click to filter"}
        </div>
      )}
    </Comp>
  );
}
function ShiftChip({
  s,
  staff,
  onClick,
  dense = false,
  hideTime = false,
}: {
  s: CalendarShift;
  staff: Staff[];
  onClick: () => void;
  dense?: boolean;
  hideTime?: boolean;
}) {
  const guide = staff.find((x) => x.id === s.assignedStaffId);
  const meta = metaOf(s);
  const pax = paxOf(s);
  const bookings = s.groupedShifts?.length ?? 1;
  const capacity = capacityForTitle(s.tourName);
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
        <div className="text-[11px] text-foreground font-semibold leading-tight break-words">
          {s.tourName}
        </div>
        {s.rateTitle && (
          <div className="mt-0.5 inline-flex items-center rounded-sm bg-primary/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
            {s.rateTitle}
          </div>
        )}
        {pax > 0 && (
          <div className="text-[10px] text-foreground/80 font-medium tabular-nums flex items-center gap-1 mt-0.5">
            <Users className="h-2.5 w-2.5" /> {capacity ? `${pax} / ${capacity}` : `${pax} pax`}
            {bookings > 1 ? ` · ${bookings} bookings` : ""}
          </div>
        )}
        {hasRealMeetingPoint(s.meetingPoint) && !dense && (
          <div className="text-[9px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
            <MapPin className="h-2.5 w-2.5 shrink-0" />{" "}
            <span className="truncate">{s.meetingPoint}</span>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
          {guide ? (
            <>
              <Avatar
                name={guide.name}
                initials={guide.avatar}
                size="sm"
                className="!h-3.5 !w-3.5 text-[8px] !rounded-full"
              />
              <span className="truncate">{guide.name}</span>
            </>
          ) : (
            <>
              <User className="h-2.5 w-2.5" /> <span className="italic">Unassigned</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

function DayView({
  dateISO,
  shifts,
  staff,
  onOpenShift,
}: {
  dateISO: string;
  shifts: CalendarShift[];
  staff: Staff[];
  onOpenShift: (s: CalendarShift) => void;
}) {
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
        const meta = metaOf(s);
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
                {hasRealMeetingPoint(s.meetingPoint) && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <MapPin className="h-3 w-3 shrink-0" />{" "}
                    <span className="truncate">{s.meetingPoint}</span>
                  </div>
                )}
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-foreground/80 shrink-0">
                {guide ? (
                  <>
                    <Avatar
                      name={guide.name}
                      initials={guide.avatar}
                      size="sm"
                      className="!h-6 !w-6 text-[10px] !rounded-full"
                    />
                    <span className="font-medium">{guide.name}</span>
                  </>
                ) : (
                  <span className="italic text-destructive flex items-center gap-1">
                    <User className="h-3 w-3" /> Unassigned
                  </span>
                )}
              </div>
              <Badge
                variant="outline"
                className={`shrink-0 capitalize text-[10px] gap-1 ${meta.text} border-current/30`}
              >
                <Icon className="h-2.5 w-2.5" /> {meta.label}
              </Badge>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function WeekView({
  cursor,
  shiftsByDate,
  staff,
  onOpenDay,
  onOpenShift,
  todayISO,
}: {
  cursor: Date;
  shiftsByDate: Record<string, CalendarShift[]>;
  staff: Staff[];
  onOpenDay: (d: string) => void;
  onOpenShift: (s: CalendarShift) => void;
  todayISO: string;
}) {
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
    const m: Record<string, Record<string, CalendarShift[]>> = {};
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
    <div className="overflow-auto -mx-2 px-2 max-h-[calc(100vh-12rem)] sm:max-h-[calc(100vh-14rem)]">
      <div className="min-w-[760px] sm:min-w-[900px]">
        {/* Header row */}
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] sm:grid-cols-[88px_repeat(7,minmax(0,1fr))] gap-1 sticky top-0 z-20 bg-background pb-1 pt-1 border-b border-border/70">
          <div className="sticky left-0 z-30 bg-background text-[10px] uppercase tracking-wider font-bold text-muted-foreground py-2 px-2 flex items-center gap-1 border-r border-border/60">
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
                <div
                  className={`text-base font-bold leading-tight tabular-nums ${isToday ? "text-primary" : "text-foreground"}`}
                >
                  {d.getDate()}
                </div>
                {list.length > 0 && (
                  <div className="text-[9px] text-muted-foreground tabular-nums mt-0.5">
                    {list.length} tours
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Time rows */}
        <div className="space-y-1 mt-1">
          {timeRows.map((t) => (
            <div key={t} className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] sm:grid-cols-[88px_repeat(7,minmax(0,1fr))] gap-1">
              <div className="sticky left-0 z-10 bg-background flex items-start justify-end pr-2 pt-2 text-sm font-bold tabular-nums text-foreground border-r border-border/60">
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
                      <ShiftChip
                        key={s.id}
                        s={s}
                        staff={staff}
                        onClick={() => onOpenShift(s)}
                        hideTime
                      />
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

function WeekViewMobile({
  cursor,
  shiftsByDate,
  staff,
  onOpenDay,
  onOpenShift,
  todayISO,
}: {
  cursor: Date;
  shiftsByDate: Record<string, CalendarShift[]>;
  staff: Staff[];
  onOpenDay: (d: string) => void;
  onOpenShift: (s: CalendarShift) => void;
  todayISO: string;
}) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const hasAny = days.some((d) => (shiftsByDate[toISO(d)] || []).length > 0);

  if (!hasAny) {
    return (
      <div className="text-sm text-muted-foreground italic py-12 text-center border border-dashed border-border rounded-lg">
        No tours scheduled this week.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map((d) => {
        const iso = toISO(d);
        const list = shiftsByDate[iso] || [];
        const isToday = iso === todayISO;
        const label = d.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "short",
        });
        return (
          <section key={iso} className="space-y-2">
            <button
              type="button"
              onClick={() => onOpenDay(iso)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-left transition ${
                isToday ? "bg-primary/5 border-primary/40" : "bg-card border-border/60"
              }`}
            >
              <span className={`text-sm font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
                {label}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {list.length} {list.length === 1 ? "tour" : "tours"}
              </span>
            </button>
            {list.length === 0 ? (
              <div className="text-xs text-muted-foreground italic px-3 py-3 border border-dashed border-border/60 rounded-md">
                No tours.
              </div>
            ) : (
              <DayView dateISO={iso} shifts={list} staff={staff} onOpenShift={onOpenShift} />
            )}
          </section>
        );
      })}
    </div>
  );
}

function MonthViewMobile({
  cursor,
  shiftsByDate,
  staff,
  onOpenDay,
  onOpenShift,
  todayISO,
}: {
  cursor: Date;
  shiftsByDate: Record<string, CalendarShift[]>;
  staff: Staff[];
  onOpenDay: (d: string) => void;
  onOpenShift: (s: CalendarShift) => void;
  todayISO: string;
}) {
  const first = startOfMonth(cursor);
  const last = endOfMonth(cursor);
  const days: Date[] = [];
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) days.push(new Date(d));
  const hasAny = days.some((d) => (shiftsByDate[toISO(d)] || []).length > 0);

  if (!hasAny) {
    return (
      <div className="text-sm text-muted-foreground italic py-12 text-center border border-dashed border-border rounded-lg">
        No tours scheduled this month.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map((d) => {
        const iso = toISO(d);
        const list = shiftsByDate[iso] || [];
        if (list.length === 0) return null;
        const isToday = iso === todayISO;
        const label = d.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "short",
        });
        return (
          <section key={iso} className="space-y-2">
            <button
              type="button"
              onClick={() => onOpenDay(iso)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-left transition ${
                isToday ? "bg-primary/5 border-primary/40" : "bg-card border-border/60"
              }`}
            >
              <span className={`text-sm font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
                {label}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {list.length} {list.length === 1 ? "tour" : "tours"}
              </span>
            </button>
            <DayView dateISO={iso} shifts={list} staff={staff} onOpenShift={onOpenShift} />
          </section>
        );
      })}
    </div>
  );
}


function MonthView({
  cursor,
  shiftsByDate,
  onOpenDay,
  onOpenShift,
  todayISO,
  renderDayOverlay,
}: {
  cursor: Date;
  shiftsByDate: Record<string, CalendarShift[]>;
  onOpenDay: (d: string) => void;
  onOpenShift: (s: CalendarShift) => void;
  todayISO: string;
  renderDayOverlay?: (iso: string) => React.ReactNode;
}) {
  const first = startOfMonth(cursor);
  const last = endOfMonth(cursor);
  const gridStart = startOfWeek(first);
  const totalDays = Math.ceil((last.getTime() - gridStart.getTime()) / 86400000) + 1;
  const cells = Math.ceil(totalDays / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => addDays(gridStart, i));
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="overflow-auto -mx-2 px-2 max-h-[calc(100vh-12rem)] sm:max-h-[calc(100vh-14rem)]">
      <div className="grid grid-cols-7 gap-1 mb-1 sticky top-0 z-20 bg-background pt-1 pb-1 border-b border-border/70">
        {weekdays.map((w) => (
          <div
            key={w}
            className="text-[10px] uppercase font-semibold text-muted-foreground text-center py-1"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = toISO(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const list = shiftsByDate[iso] || [];
          const isToday = iso === todayISO;
          // status counts per day
          const counts = list.reduce(
            (acc, s) => {
              acc[s.status] = (acc[s.status] || 0) + 1;
              return acc;
            },
            {} as Record<Shift["status"], number>,
          );
          return (
            <div
              key={iso}
              role="button"
              tabIndex={0}
              onClick={() => onOpenDay(iso)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenDay(iso);
                }
              }}
              className={`min-h-[96px] rounded-md border p-1.5 text-left transition relative overflow-hidden hover:border-primary/60 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer ${
                isToday ? "border-primary bg-primary/5" : "border-border"
              } ${inMonth ? "bg-card" : "bg-muted/20 opacity-60"}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div
                  className={`text-xs font-bold tabular-nums ${isToday ? "text-primary-foreground bg-primary rounded-full h-5 w-5 flex items-center justify-center" : "text-foreground"}`}
                >
                  {d.getDate()}
                </div>
                {list.length > 0 && (
                  <span className="text-[9px] font-bold text-muted-foreground tabular-nums">
                    {list.length}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 2).map((s) => {
                  const meta = metaOf(s);
                  return (
                    <button
                      key={s.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenShift(s);
                      }}
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
                        <span
                          key={k}
                          className="flex items-center gap-0.5 text-[9px] text-muted-foreground font-medium"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS[k].dot}`} />
                          {counts[k]}
                        </span>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
              {renderDayOverlay && (
                <div
                  className="mt-1.5 pt-1.5 border-t border-border/60"
                  onClick={(e) => e.stopPropagation()}
                >
                  {renderDayOverlay(iso)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayDetailsDialog({
  dateISO,
  shifts,
  staff,
  onClose,
  onOpenShift,
  showRates = true,
  renderDayDialogSection,
}: {
  dateISO: string | null;
  shifts: CalendarShift[];
  staff: Staff[];
  onClose: () => void;
  onOpenShift: (s: CalendarShift) => void;
  showRates?: boolean;
  renderDayDialogSection?: (iso: string) => React.ReactNode;
}) {
  const open = !!dateISO;
  const dateLabel = dateISO
    ? new Date(dateISO).toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
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
        {dateISO && renderDayDialogSection && (
          <div>{renderDayDialogSection(dateISO)}</div>
        )}
        {shifts.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-8 text-center">
            No tours scheduled.
          </div>
        ) : (
          <div className="space-y-3">
            {shifts.map((s) => {
              const guide = staff.find((x) => x.id === s.assignedStaffId);
              const meta = metaOf(s);
              const Icon = meta.Icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenShift(s)}
                  className={`w-full text-left rounded-lg border ${meta.chip} relative overflow-hidden transition focus:outline-none focus:ring-2 ${meta.ring} hover:brightness-105`}
                >
                  <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${meta.bar}`} />
                  <div className="p-3 pl-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="font-semibold text-sm text-foreground">{s.tourName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />{" "}
                          <span className="tabular-nums">
                            {s.startTime}–{s.endTime}
                          </span>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`capitalize text-[10px] shrink-0 gap-1 ${meta.text} border-current/30`}
                      >
                        <Icon className="h-2.5 w-2.5" /> {meta.label}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-foreground/85">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-muted-foreground" /> {s.meetingPoint}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {guide ? (
                          <>
                            <Avatar
                              name={guide.name}
                              initials={guide.avatar}
                              size="sm"
                              className="!h-5 !w-5 text-[9px] !rounded-full"
                            />
                            <span className="font-medium">{guide.name}</span>
                          </>
                        ) : (
                          <span className="italic text-destructive flex items-center gap-1">
                            <User className="h-3 w-3" /> Unassigned
                          </span>
                        )}
                      </div>
                      {s.participants && (
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3 w-3 text-muted-foreground" />{" "}
                          {s.participants.adults + s.participants.teens + s.participants.infants}{" "}
                          pax
                        </div>
                      )}
                      {showRates && s.rate !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <Euro className="h-3 w-3 text-muted-foreground" /> {s.rate}
                        </div>
                      )}
                    </div>
                    {s.customer && (
                      <div className="mt-2 text-xs text-foreground/80">
                        Customer: <span className="font-medium">{s.customer.name}</span> ·{" "}
                        {s.customer.phone}
                      </div>
                    )}
                    {cleanNoteText(s.notes) && (
                      <div className="mt-2 text-xs italic text-muted-foreground">📝 {cleanNoteText(s.notes)}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShiftDetailsDialog({
  shift,
  staff,
  allShifts,
  onClose,
  onAssign,
  onUnassign,
  onDelete,
  onUpdateDeparture,
  showRates = true,
}: {
  shift: CalendarShift | null;
  staff: Staff[];
  allShifts: Shift[];
  onClose: () => void;
  onAssign?: AssignFn;
  onUnassign?: (shiftId: string) => void | Promise<void>;
  onDelete?: (shift: Shift) => void | Promise<void>;
  onUpdateDeparture?: UpdateDepartureFn;
  showRates?: boolean;
}) {
  const open = !!shift;
  const [date, setDate] = useState(shift?.date ?? "");
  const [startTime, setStartTime] = useState(shift?.startTime ?? "");
  const [endTime, setEndTime] = useState(shift?.endTime ?? "");
  const [meetingPoint, setMeetingPoint] = useState(shift?.meetingPoint ?? "");
  const [rate, setRate] = useState<string>(shift?.rate != null ? String(shift.rate) : "");
  const [rateTitle, setRateTitle] = useState<string>(shift?.rateTitle ?? "");
  const [pendingStaffId, setPendingStaffId] = useState<string | null>(shift?.assignedStaffId ?? null);
  const [saving, setSaving] = useState(false);
  const [guideSearch, setGuideSearch] = useState("");
  useEffect(() => {
    setDate(shift?.date ?? "");
    setStartTime(shift?.startTime ?? "");
    setEndTime(shift?.endTime ?? "");
    setMeetingPoint(shift?.meetingPoint ?? "");
    setRate(shift?.rate != null ? String(shift.rate) : "");
    setRateTitle(shift?.rateTitle ?? "");
    setPendingStaffId(shift?.assignedStaffId ?? null);
    setGuideSearch("");
  }, [shift?.id, shift?.date, shift?.startTime, shift?.endTime, shift?.meetingPoint, shift?.rate, shift?.rateTitle, shift?.assignedStaffId]);

  if (!shift) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent />
      </Dialog>
    );
  }
  const s = shift;
  const guide = staff.find((x) => x.id === s.assignedStaffId);
  const meta = metaOf(s);
  const Icon = meta.Icon;
  const dateLabel = new Date(s.date).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const pax = paxOf(s);
  const bookingRows = s.groupedShifts ?? [s];
  const assignableStaff = staff.filter((m) => m.role === "guide" || m.role === "admin");
  const q = guideSearch.trim().toLowerCase();
  const filteredStaff = q
    ? assignableStaff.filter((m) => m.name.toLowerCase().includes(q))
    : assignableStaff;
  const dateChanged = !!date && date !== s.date;
  const timeChanged = startTime !== s.startTime || endTime !== s.endTime;
  const meetingChanged = meetingPoint !== (s.meetingPoint ?? "");
  const origRate = s.rate != null ? String(s.rate) : "";
  const origRateTitle = s.rateTitle ?? "";
  const rateChanged = rate !== origRate;
  const rateTitleChanged = rateTitle !== origRateTitle;
  const departureChanged = dateChanged || timeChanged || meetingChanged || rateChanged || rateTitleChanged;
  const buildPatch = (): DeparturePatch => {
    const patch: DeparturePatch = {};
    if (dateChanged) patch.date = date;
    if (timeChanged) {
      patch.startTime = startTime;
      patch.endTime = endTime;
    }
    if (meetingChanged) patch.meetingPoint = meetingPoint;
    if (rateChanged) patch.rate = rate === "" ? null : Number(rate);
    if (rateTitleChanged) patch.rateTitle = rateTitle.trim() || null;
    return patch;
  };
  const persistDepartureIfChanged = async () => {
    if (!onUpdateDeparture || !departureChanged) return;
    const patch = buildPatch();
    for (const row of bookingRows) {
      await onUpdateDeparture(row.id, patch);
    }
  };
  const assignmentChanged =
    !!pendingStaffId && pendingStaffId !== (s.assignedStaffId ?? null);
  const hasChanges = departureChanged || assignmentChanged;
  const persistAssignmentIfChanged = async () => {
    if (!onAssign || !assignmentChanged || !pendingStaffId) return;
    const member = staff.find((m) => m.id === pendingStaffId);
    if (!member) return;
    for (const row of bookingRows) {
      await onAssign(row.id, pendingStaffId, member.name);
    }
  };
  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      await persistDepartureIfChanged();
      await persistAssignmentIfChanged();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{s.tourName}</span>
            {s.rateTitle && (
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                {s.rateTitle}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="capitalize">
            {dateLabel}
            {bookingRows.length > 1 ? ` · ${bookingRows.length} Bokun bookings grouped` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className={`rounded-lg border ${meta.chip} relative overflow-hidden`}>
          <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${meta.bar}`} />
          <div className="p-4 pl-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />{" "}
                <span className="tabular-nums">
                  {s.startTime}–{s.endTime}
                </span>
              </div>
              <Badge
                variant="outline"
                className={`capitalize text-[10px] gap-1 ${meta.text} border-current/30`}
              >
                <Icon className="h-2.5 w-2.5" /> {meta.label}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-foreground/85">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-muted-foreground" /> {s.meetingPoint}
              </div>
              <div className="flex items-center gap-1.5">
                {guide ? (
                  <>
                    <Avatar
                      name={guide.name}
                      initials={guide.avatar}
                      size="sm"
                      className="!h-5 !w-5 text-[9px] !rounded-full"
                    />
                    <span className="font-medium">{guide.name}</span>
                  </>
                ) : (
                  <span className="italic text-destructive flex items-center gap-1">
                    <User className="h-3 w-3" /> Unassigned
                  </span>
                )}
              </div>
              {pax > 0 && (
                <div className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-muted-foreground" /> {pax} pax
                </div>
              )}
              {showRates && s.rate !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Euro className="h-3 w-3 text-muted-foreground" /> {s.rate}
                </div>
              )}
            </div>
            {s.customer && (
              <div className="text-xs text-foreground/80">
                Customer: <span className="font-medium">{s.customer.name}</span> ·{" "}
                {s.customer.phone}
              </div>
            )}
            {cleanNoteText(s.notes) && <div className="text-xs italic text-muted-foreground">📝 {cleanNoteText(s.notes)}</div>}
          </div>
        </div>
        {bookingRows.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 text-xs font-semibold text-foreground">Bookings</div>
            <div className="space-y-2">
              {bookingRows.map((b) => {
                const bpax = paxOf(b);
                const payment = b.operationsNotes
                  ?.replace(/^Payment:\s*/i, "")
                  .replaceAll("_", " ");
                return (
                  <div
                    key={b.id}
                    className="rounded-md border border-border/70 bg-muted/20 p-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-foreground">
                        {b.customer?.name ?? "Unknown customer"}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {b.bookingId}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                      <span>{bpax} pax</span>
                      {payment && <span className="capitalize">{payment.toLowerCase()}</span>}
                      {showRates && b.rate !== undefined && <span>€ {b.rate}</span>}
                      {b.customer?.phone && b.customer.phone !== "—" && (
                        <span>{b.customer.phone}</span>
                      )}
                    </div>
                    {(b.participantList?.length ?? 0) > 0 && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {b.participantList!.map((p) => `${p.name} (${p.category})`).join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {onUpdateDeparture && (
          <div className="mt-3 rounded-lg border border-border bg-card p-3">
            <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Admin overrides
              {bookingRows.length > 1 && (
                <span className="font-normal text-muted-foreground">
                  (applies to all {bookingRows.length} bookings)
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="ov-date" className="text-[10px] uppercase tracking-wide text-muted-foreground">Date</Label>
                <Input id="ov-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40 text-xs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ov-start" className="text-[10px] uppercase tracking-wide text-muted-foreground">Start</Label>
                <Input id="ov-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9 w-28 text-xs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ov-end" className="text-[10px] uppercase tracking-wide text-muted-foreground">End</Label>
                <Input id="ov-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9 w-28 text-xs" />
              </div>
              {showRates && (
                <div className="space-y-1">
                  <Label htmlFor="ov-rate" className="text-[10px] uppercase tracking-wide text-muted-foreground">Rate (€)</Label>
                  <Input id="ov-rate" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="h-9 w-24 text-xs" />
                </div>
              )}
            </div>
            <div className="mt-2 space-y-1">
              <Label htmlFor="ov-meet" className="text-[10px] uppercase tracking-wide text-muted-foreground">Meeting point</Label>
              <Input
                id="ov-meet"
                value={meetingPoint}
                onChange={(e) => setMeetingPoint(e.target.value)}
                placeholder="e.g. Piazza del Popolo, fountain side"
                className="h-9 text-xs"
              />
            </div>
            <div className="mt-2 space-y-1">
              <Label htmlFor="ov-lang" className="text-[10px] uppercase tracking-wide text-muted-foreground">Tour language / rate name</Label>
              <RateTitleField
                id="ov-lang"
                value={rateTitle}
                onChange={setRateTitle}
                className="h-9 text-xs"
              />
            </div>
          </div>
        )}

        {onAssign && (
          <div className="mt-3 space-y-2">
            <AssignGuideCombobox
              shift={bookingRows[0] ?? s}
              allStaff={staff}
              allShifts={allShifts}
              currentStaffId={pendingStaffId}
              onSelect={async (m) => {
                setPendingStaffId(m.id);
                setSaving(true);
                try {
                  for (const row of bookingRows) {
                    await onAssign(row.id, m.id, m.name);
                  }
                } finally {
                  setSaving(false);
                }
              }}
            />
            {guide && onUnassign && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={saving}
                  onClick={async () => {
                    if (!confirm(`Remove ${guide.name} from this booking?`)) return;
                    setSaving(true);
                    try {
                      for (const row of bookingRows) {
                        await onUnassign(row.id);
                      }
                      onClose();
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <UserMinus className="h-3.5 w-3.5 mr-1" />
                  Unassign current guide
                </Button>
              </div>
            )}
          </div>
        )}
        {onDelete && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs">
                <div className="font-semibold text-destructive flex items-center gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" />
                  {bookingRows.length > 1 ? `Delete ${bookingRows.length} bookings` : "Delete booking"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  This permanently removes the booking. Cannot be undone.
                </div>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                disabled={saving}
                onClick={async () => {
                  const label = bookingRows.length > 1
                    ? `Delete all ${bookingRows.length} bookings for ${s.tourName} on ${s.date} at ${s.startTime}?`
                    : `Delete this booking?\n\n${s.tourName} — ${s.date} ${s.startTime}`;
                  if (!confirm(`${label}\n\nThis cannot be undone.`)) return;
                  setSaving(true);
                  try {
                    for (const row of bookingRows) {
                      await onDelete(row);
                    }
                    onClose();
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        )}
        {(onUpdateDeparture || onAssign) && (
          <DialogFooter className="mt-3 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// satisfy unused import linter for icons used only conditionally
void Circle;
