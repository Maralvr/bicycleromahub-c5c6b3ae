import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/avatar";
import { MapPin, Phone, Users, Clock, User as UserIcon, CalendarDays } from "lucide-react";
import { getMyRentalDays, type MyRentalDay } from "@/lib/rental-staff.functions";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RentalStaffShiftsView() {
  const fetch = useServerFn(getMyRentalDays);
  const [days, setDays] = useState<MyRentalDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch({ data: {} });
        if (!cancelled) setDays(res.days);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetch]);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = days.filter((d) => d.date >= today);
  const past = days.filter((d) => d.date < today);

  return (
    <AppShell>
      <PageHeader
        title="My rental days"
        subtitle="Days you're scheduled at a rental point and the bookings you'll handle."
      />

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Upcoming
            </h2>
            {upcoming.length === 0 ? (
              <Card className="p-6 border-dashed text-sm text-muted-foreground text-center">
                Nothing scheduled. An admin will assign you to rental-point days here.
              </Card>
            ) : (
              <div className="grid gap-4">
                {upcoming.map((d) => (
                  <RentalDayCard key={d.assignmentId} day={d} />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Past
              </h2>
              <div className="grid gap-4 opacity-75">
                {past.slice(0, 10).map((d) => (
                  <RentalDayCard key={d.assignmentId} day={d} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}

function RentalDayCard({ day }: { day: MyRentalDay }) {
  const totalPax = day.bookings.reduce((sum, b) => sum + b.pax, 0);
  return (
    <Card className="overflow-hidden border-border/60">
      <div className="p-4 bg-muted/30 border-b border-border/40">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {fmtDate(day.date)}
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
            <Badge variant="secondary" className="text-xs">
              {day.bookings.length} booking{day.bookings.length === 1 ? "" : "s"}
            </Badge>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 justify-end">
              <Users className="h-3 w-3" /> {totalPax} pax total
            </div>
          </div>
        </div>
        {day.notes && (
          <div className="mt-3 text-xs text-foreground bg-background/60 rounded-md p-2 border border-border/40">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground mr-1">Notes:</span>
            {day.notes}
          </div>
        )}
      </div>

      <div className="divide-y divide-border/40">
        {day.bookings.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No bookings scheduled at this point on this date yet.
          </div>
        ) : (
          day.bookings.map((b) => (
            <div key={b.id} className="p-3.5 space-y-2.5">
              {/* Header row: time + tour + booking ref */}
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

              {/* Pax breakdown + meeting point */}
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

              {/* Customer + guide row */}
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
