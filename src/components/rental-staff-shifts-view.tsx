import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";
import {
  MapPin,
  Phone,
  Users,
  Clock,
  User as UserIcon,
  CalendarDays,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import {
  getMyRentalDays,
  acceptRentalDay,
  rejectRentalDay,
  type MyRentalDay,
} from "@/lib/rental-staff.functions";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeLeft(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m left`;
}

export function RentalStaffShiftsView({
  deepLinkAssignmentId,
  onConsumeDeepLink,
}: {
  /** Assignment id to jump to on load, e.g. from a notification link
   *  (/shifts?rental_day=<id>) or the admin's "reassign" link. */
  deepLinkAssignmentId?: string;
  onConsumeDeepLink?: () => void;
} = {}) {
  const fetch = useServerFn(getMyRentalDays);
  const acceptFn = useServerFn(acceptRentalDay);
  const rejectFn = useServerFn(rejectRentalDay);

  const [days, setDays] = useState<MyRentalDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<MyRentalDay | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Day cards are collapsed by default (bookings hidden) so the list doesn't
  // turn into a long scroll once a staff member has many days assigned --
  // only the day header (date, point, booking count, pax) shows until
  // expanded. Pending days are always shown expanded since they need a
  // decision. Upcoming/Past are also paginated in fixed pages for the same
  // reason.
  const PAGE_SIZE = 10;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [upcomingLimit, setUpcomingLimit] = useState(PAGE_SIZE);
  const [pastLimit, setPastLimit] = useState(PAGE_SIZE);
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Which sub-tab (List/Calendar) is active -- needs to be controlled so a
  // deep link or a calendar-day click can force it to "list" to reveal the
  // day card being jumped to.
  const [innerTab, setInnerTab] = useState<"list" | "calendar">("list");
  // Briefly ring-highlight whichever day card was just jumped to, so it's
  // obvious which one the click/link was about.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const consumedDeepLinkRef = useRef<string | null>(null);

  // Shared by both calendar-day clicks and the ?rental_day= deep link:
  // switches to the list tab, expands the target day, makes sure it's
  // within the current pagination window, scrolls it into view and
  // highlights it briefly.
  const openDay = useCallback(
    (assignmentId: string) => {
      const target = days.find((d) => d.assignmentId === assignmentId);
      if (!target) return;
      const todayStr = new Date().toISOString().slice(0, 10);
      setInnerTab("list");
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(assignmentId);
        return next;
      });
      if (target.status === "accepted" && target.date >= todayStr) {
        const list = days.filter((d) => d.status === "accepted" && d.date >= todayStr);
        const idx = list.findIndex((d) => d.assignmentId === assignmentId);
        if (idx >= 0) setUpcomingLimit((n) => Math.max(n, idx + 1));
      } else if (target.date < todayStr) {
        const list = days.filter((d) => d.date < todayStr);
        const idx = list.findIndex((d) => d.assignmentId === assignmentId);
        if (idx >= 0) setPastLimit((n) => Math.max(n, idx + 1));
      }
      setHighlightId(assignmentId);
      setTimeout(() => {
        document
          .getElementById(`rental-day-${assignmentId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
      setTimeout(() => setHighlightId((cur) => (cur === assignmentId ? null : cur)), 2500);
    },
    [days],
  );

  // Deep link on load: /shifts?rental_day=<assignment id>, sent by
  // rental_staff_notifications / guide_notifications links (assignment
  // created, rental day rejected, etc). Previously this query param was
  // parsed nowhere -- the page just landed on the generic list, ignoring it.
  useEffect(() => {
    if (!deepLinkAssignmentId || loading) return;
    if (consumedDeepLinkRef.current === deepLinkAssignmentId) return;
    if (!days.some((d) => d.assignmentId === deepLinkAssignmentId)) return;
    consumedDeepLinkRef.current = deepLinkAssignmentId;
    openDay(deepLinkAssignmentId);
    onConsumeDeepLink?.();
  }, [deepLinkAssignmentId, days, loading, openDay, onConsumeDeepLink]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch({ data: {} });
      setDays(res.days);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [fetch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const today = new Date().toISOString().slice(0, 10);
  const pending = days.filter((d) => d.status === "pending" && d.date >= today);
  const accepted = days.filter((d) => d.status === "accepted" && d.date >= today);
  const past = days.filter((d) => d.date < today);

  const handleAccept = async (d: MyRentalDay) => {
    setBusyId(d.assignmentId);
    try {
      await acceptFn({ data: { assignmentId: d.assignmentId } });
      toast.success("Accepted");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept");
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.assignmentId);
    try {
      await rejectFn({
        data: { assignmentId: rejectTarget.assignmentId, reason: rejectReason },
      });
      toast.success("Rejected");
      setRejectTarget(null);
      setRejectReason("");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="My rental days"
        subtitle="Days you're scheduled at a rental point and the bookings you'll handle."
      />

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                Awaiting your response ({pending.length})
              </h2>
              <div className="grid gap-4">
                {pending.map((d) => (
                  <RentalDayCard
                    key={d.assignmentId}
                    id={`rental-day-${d.assignmentId}`}
                    highlighted={highlightId === d.assignmentId}
                    day={d}
                    busy={busyId === d.assignmentId}
                    onAccept={() => handleAccept(d)}
                    onReject={() => {
                      setRejectTarget(d);
                      setRejectReason("");
                    }}
                    expanded
                  />
                ))}
              </div>
            </section>
          )}

          <Tabs value={innerTab} onValueChange={(v) => setInnerTab(v as "list" | "calendar")}>
            <TabsList>
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="space-y-6 mt-4">
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Upcoming
                </h2>
                {accepted.length === 0 ? (
                  <Card className="p-6 border-dashed text-sm text-muted-foreground text-center">
                    Nothing scheduled. An admin will assign you to rental-point days here.
                  </Card>
                ) : (
                  <>
                    <div className="grid gap-4">
                      {accepted.slice(0, upcomingLimit).map((d) => (
                        <RentalDayCard
                          key={d.assignmentId}
                          id={`rental-day-${d.assignmentId}`}
                          highlighted={highlightId === d.assignmentId}
                          day={d}
                          expanded={expanded.has(d.assignmentId)}
                          onToggleExpand={() => toggleExpand(d.assignmentId)}
                        />
                      ))}
                    </div>
                    {accepted.length > upcomingLimit && (
                      <div className="flex justify-center mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setUpcomingLimit((n) => n + PAGE_SIZE)}
                        >
                          Load more ({accepted.length - upcomingLimit} more)
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </section>

              {past.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    Past
                  </h2>
                  <div className="grid gap-4 opacity-75">
                    {past.slice(0, pastLimit).map((d) => (
                      <RentalDayCard
                        key={d.assignmentId}
                        id={`rental-day-${d.assignmentId}`}
                        highlighted={highlightId === d.assignmentId}
                        day={d}
                        expanded={expanded.has(d.assignmentId)}
                        onToggleExpand={() => toggleExpand(d.assignmentId)}
                      />
                    ))}
                  </div>
                  {past.length > pastLimit && (
                    <div className="flex justify-center mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPastLimit((n) => n + PAGE_SIZE)}
                      >
                        Load more ({past.length - pastLimit} more)
                      </Button>
                    </div>
                  )}
                </section>
              )}
            </TabsContent>
            <TabsContent value="calendar" className="mt-4">
              <RentalCalendar days={days} onSelectDay={openDay} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <AlertDialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this rental day?</AlertDialogTitle>
            <AlertDialogDescription>
              {rejectTarget && (
                <>
                  {rejectTarget.rentalPoint.name} on {fmtDate(rejectTarget.date)}. An admin will be
                  notified so they can reassign it.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Optional reason (e.g. 'I'm not available that day')"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="min-h-[80px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function RentalDayCard({
  day,
  busy,
  onAccept,
  onReject,
  expanded = true,
  onToggleExpand,
  id,
  highlighted,
}: {
  day: MyRentalDay;
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  id?: string;
  highlighted?: boolean;
}) {
  const totalPax = day.bookings.reduce((sum, b) => sum + b.pax, 0);
  const isPending = day.status === "pending";
  return (
    <Card
      id={id}
      className={cn(
        "overflow-hidden border-border/60 scroll-mt-20 transition-shadow",
        isPending && "border-amber-500/60 ring-1 ring-amber-500/20",
        highlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg",
      )}
    >
      <div className="p-4 bg-muted/30 border-b border-border/40">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {fmtDate(day.date)}
              {isPending && (
                <Badge
                  variant="outline"
                  className="border-amber-500/60 text-amber-600 dark:text-amber-400 text-[10px]"
                >
                  Pending · {timeLeft(day.pendingExpiresAt)}
                </Badge>
              )}
            </div>
            <h3 className="text-lg font-bold text-foreground mt-1">{day.rentalPoint.name}</h3>
            {day.rentalPoint.address && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <MapPin className="h-3 w-3" /> {day.rentalPoint.address}
              </div>
            )}
            {day.rentalPoint.phone && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <Phone className="h-3 w-3" /> {day.rentalPoint.phone}
              </div>
            )}
          </div>
          <div className="text-right">
            {onToggleExpand ? (
              <button
                type="button"
                onClick={onToggleExpand}
                className="inline-flex items-center gap-1 rounded-md hover:bg-muted/60 px-1.5 py-0.5 -mr-1.5"
                aria-expanded={expanded}
              >
                <Badge variant="secondary" className="text-xs">
                  {day.bookings.length} booking{day.bookings.length === 1 ? "" : "s"}
                </Badge>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform",
                    expanded && "rotate-180",
                  )}
                />
              </button>
            ) : (
              <Badge variant="secondary" className="text-xs">
                {day.bookings.length} booking{day.bookings.length === 1 ? "" : "s"}
              </Badge>
            )}
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 justify-end">
              <Users className="h-3 w-3" /> {totalPax} pax total
            </div>
          </div>
        </div>
        {day.notes && (
          <div className="mt-3 text-xs text-foreground bg-background/60 rounded-md p-2 border border-border/40">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground mr-1">
              Notes:
            </span>
            {day.notes}
          </div>
        )}
        {isPending && onAccept && onReject && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-10"
              disabled={busy}
              onClick={onAccept}
            >
              <Check className="h-4 w-4 mr-1.5" /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-10 border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={onReject}
            >
              <X className="h-4 w-4 mr-1.5" /> Reject
            </Button>
          </div>
        )}
      </div>

      <div className="divide-y divide-border/40">
        {!expanded ? null : day.bookings.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No bookings scheduled at this point on this date yet.
          </div>
        ) : (
          day.bookings.map((b) => (
            <div key={b.id} className="p-3.5 space-y-2.5">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex flex-col items-center justify-center bg-primary/10 rounded-md px-2.5 py-1.5 shrink-0">
                  <div className="flex items-center gap-1 text-sm font-bold tabular-nums text-primary">
                    <Clock className="h-3.5 w-3.5" />
                    {b.startTime}
                  </div>
                  {b.endTime && (
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      → {b.endTime}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{b.tourName}</div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {b.rateTitle && (
                      <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {b.rateTitle}
                      </span>
                    )}
                    {b.bookingRef && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        #{b.bookingRef}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-foreground/85 pl-1">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-semibold">{b.pax}</span>
                  <span className="text-muted-foreground">
                    ({b.adults}A
                    {b.teens > 0 && ` · ${b.teens}T`}
                    {b.infants > 0 && ` · ${b.infants}I`}
                    {b.trailers > 0 && ` · ${b.trailers} trailer${b.trailers === 1 ? "" : "s"}`}
                    )
                  </span>
                </div>
                {b.meetingPoint && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate" title={b.meetingPoint}>
                      {b.meetingPoint}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs pl-1">
                {b.customerName && (
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground">{b.customerName}</span>
                    {b.customerPhone && (
                      <a
                        href={`tel:${b.customerPhone}`}
                        className="text-primary hover:underline inline-flex items-center gap-0.5"
                      >
                        <Phone className="h-3 w-3" /> {b.customerPhone}
                      </a>
                    )}
                  </div>
                )}
                {b.guide ? (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Avatar
                      name={b.guide.name}
                      initials={b.guide.avatar}
                      size="sm"
                      className="!h-5 !w-5 text-[9px]"
                    />
                    <span className="font-medium text-foreground">{b.guide.name}</span>
                    {b.guide.phone && (
                      <a
                        href={`tel:${b.guide.phone}`}
                        className="text-primary hover:underline"
                        title={`Call ${b.guide.name}`}
                      >
                        <Phone className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ) : (
                  <span className="ml-auto text-muted-foreground italic flex items-center gap-1">
                    <UserIcon className="h-3 w-3" /> No guide assigned yet
                  </span>
                )}
              </div>

              {b.notes && (
                <div className="text-xs italic text-muted-foreground bg-muted/40 rounded p-2 border border-border/30">
                  📝 {b.notes}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function RentalCalendar({
  days,
  onSelectDay,
}: {
  days: MyRentalDay[];
  /** Called with an assignmentId when a day cell with at least one
   *  assignment is clicked, so the caller can jump to it in the List tab. */
  onSelectDay?: (assignmentId: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const byDate = useMemo(() => {
    const m = new Map<string, MyRentalDay[]>();
    for (const d of days) {
      const arr = m.get(d.date) ?? [];
      arr.push(d);
      m.set(d.date, arr);
    }
    return m;
  }, [days]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: ({ date: string; day: number } | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, day: d });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date().toISOString().slice(0, 10);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="h-9 w-9"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold capitalize">{monthLabel}</div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="h-9 w-9"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="aspect-square" />;
          const items = byDate.get(c.date) ?? [];
          const pendingItems = items.filter((x) => x.status === "pending");
          const acceptedItems = items.filter((x) => x.status === "accepted");
          const rejectedItems = items.filter((x) => x.status === "rejected");
          const hasPending = pendingItems.length > 0;
          const hasAccepted = acceptedItems.length > 0;
          const hasRejected = rejectedItems.length > 0;
          const isToday = c.date === today;
          const isClickable = items.length > 0 && !!onSelectDay;
          const totalBookings = acceptedItems.reduce((sum, x) => sum + x.bookings.length, 0);
          const totalPax = acceptedItems.reduce(
            (sum, x) => sum + x.bookings.reduce((s, b) => s + b.pax, 0),
            0,
          );

          const cellContent = (
            <>
              <div className="flex items-center justify-between gap-0.5">
                <span className={cn("font-semibold tabular-nums", isToday && "text-primary")}>
                  {c.day}
                </span>
                {isToday && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
              </div>
              {hasPending && (
                <div className="text-[9px] truncate rounded-sm bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1 py-px font-medium">
                  Pending
                </div>
              )}
              {hasRejected && (
                <div
                  className="text-[9px] truncate rounded-sm bg-destructive/15 text-destructive px-1 py-px font-medium"
                  title={rejectedItems.map((x) => x.rentalPoint.name).join(", ")}
                >
                  Rejected
                </div>
              )}
              {acceptedItems.slice(0, 2).map((x) => (
                <div
                  key={x.assignmentId}
                  className="text-[9px] truncate rounded-sm bg-primary/15 text-primary px-1 py-px font-medium"
                  title={x.rentalPoint.name}
                >
                  {x.rentalPoint.name}
                </div>
              ))}
              {acceptedItems.length > 2 && (
                <div className="text-[9px] text-muted-foreground px-1">
                  +{acceptedItems.length - 2} more
                </div>
              )}
              {hasAccepted && (totalBookings > 0 || totalPax > 0) && (
                <div className="mt-auto text-[9px] text-muted-foreground/80 px-1 flex items-center gap-0.5 truncate">
                  <Users className="h-2.5 w-2.5 shrink-0" />
                  {totalBookings} bkg · {totalPax} pax
                </div>
              )}
            </>
          );

          const cellClassName = cn(
            "aspect-square rounded-md border text-[11px] p-1 flex flex-col gap-0.5 overflow-hidden text-left transition-colors",
            isToday ? "border-primary/60 bg-primary/5" : "border-border/40",
            items.length === 0 && "opacity-50",
            hasRejected && "bg-destructive/5 border-destructive/30",
            !hasRejected && hasPending && "bg-amber-500/5 border-amber-500/30",
            !hasRejected && !hasPending && hasAccepted && "bg-primary/[0.03]",
            isClickable && "cursor-pointer hover:border-primary/50 hover:shadow-sm hover:bg-primary/5",
          );

          if (!isClickable) {
            return (
              <div key={i} className={cellClassName}>
                {cellContent}
              </div>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay!(items[0].assignmentId)}
              className={cellClassName}
              aria-label={`View ${items.length} assignment${items.length === 1 ? "" : "s"} on ${c.date}`}
            >
              {cellContent}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t border-border/40 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/30 border border-amber-500/50" /> Pending
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/20 border border-primary/40" /> Accepted
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-destructive/20 border border-destructive/40" /> Rejected
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Today
        </div>
      </div>
    </Card>
  );
}
