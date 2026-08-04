import { useEffect, useMemo, useState } from "react";
import { PartnerTag, isPartnerTour } from "@/components/partner-tour-badge";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";
import { Input } from "@/components/ui/input";
import { CalendarDays, MapPin, Phone, Users, Clock, Users2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getAllRentalDays, type RentalCoverageDay } from "@/lib/rental-staff.functions";
import { useRentalShifts } from "@/lib/rental-shifts";
import { useRentalPoints } from "@/lib/rental-points";
import { buildRentalPointIndex, effectiveRentalPointId } from "@/lib/rental-point-match";

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

const PAGE_SIZE = 7;

/**
 * Same at-a-glance coverage language as the rental-point calendar grid:
 * green = someone accepted, amber = assigned but unanswered, red = bookings
 * with nobody assigned, nothing = no bookings to cover.
 */
function CoverageDot({
  bookings,
  staff,
}: {
  bookings: number;
  staff: { name: string; status: string }[];
}) {
  if (bookings === 0) return null;
  const active = staff.filter((s) => s.status !== "rejected" && s.status !== "cancelled");
  const accepted = active.filter((s) => s.status === "accepted");
  const pending = active.filter((s) => s.status !== "accepted");
  const state = accepted.length > 0 ? "covered" : active.length > 0 ? "pending" : "uncovered";
  const dot =
    state === "covered" ? "bg-success" : state === "pending" ? "bg-warning" : "bg-destructive";
  const label =
    state === "covered"
      ? `Covered — accepted: ${accepted.map((s) => s.name).join(", ")}${
          pending.length ? ` · awaiting: ${pending.map((s) => s.name).join(", ")}` : ""
        }`
      : state === "pending"
        ? `Awaiting response — ${pending.map((s) => s.name).join(", ")}`
        : "Uncovered — no rental staff assigned";
  return (
    <span
      className={cn("h-2 w-2 rounded-full shrink-0", dot)}
      title={label}
      aria-label={label}
    />
  );
}


/**
 * Cross-point view for rental staff: every rental point's coverage (who's on
 * duty) plus the bookings scheduled there, for all points -- not just the
 * caller's own days.
 *
 * Privacy note: this view intentionally shows NO customer PII (no name,
 * phone or email) even though shifts_rental_staff_select technically allows
 * reading it. It's a planning/coverage overview, so it sticks to tour name,
 * time, pax counts and which rental point. Customer details stay in "My
 * rental days", where the person actually handling the booking needs them.
 */
export function AllRentalPointsView() {
  const fetchAll = useServerFn(getAllRentalDays);
  const { shifts, loading: shiftsLoading } = useRentalShifts();
  const { points } = useRentalPoints();

  const [days, setDays] = useState<RentalCoverageDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchAll({ data: {} });
        if (!cancelled) setDays(res.days);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  const today = new Date().toISOString().slice(0, 10);
  const index = useMemo(() => buildRentalPointIndex(points), [points]);
  const pointById = useMemo(
    () => new Map(points.map((p) => [p.id, { name: p.name, address: p.address, phone: p.phone }])),
    [points],
  );

  // date -> pointId -> { point, staff[], bookings[] }
  const grouped = useMemo(() => {
    type Entry = {
      pointId: string;
      pointName: string;
      address: string | null;
      phone: string | null;
      staff: { name: string; avatar: string; status: string }[];
      bookings: { id: string; tourName: string; startTime: string; pax: number; isTour: boolean }[];
    };
    const byDate = new Map<string, Map<string, Entry>>();

    const ensure = (
      date: string,
      pointId: string,
      point?: { name: string; address: string | null; phone: string | null },
    ) => {
      if (!byDate.has(date)) byDate.set(date, new Map());
      const pts = byDate.get(date)!;
      if (!pts.has(pointId)) {
        pts.set(pointId, {
          pointId,
          pointName: point?.name ?? "Rental point",
          address: point?.address ?? null,
          phone: point?.phone ?? null,
          staff: [],
          bookings: [],
        });
      }
      const e = pts.get(pointId)!;
      if (point?.name && !e.pointName) e.pointName = point.name;
      return e;
    };

    for (const d of days) {
      if (d.date < today) continue;
      const e = ensure(d.date, d.rentalPoint.id, d.rentalPoint);
      if (d.staff) e.staff.push({ name: d.staff.name, avatar: d.staff.avatar, status: d.status });
    }

    for (const s of shifts) {
      if (s.date < today) continue;
      // Additive association: explicit rental_point_id (bike rentals) OR a
      // meeting-point match (guided tours departing from that location).
      const matchedId = effectiveRentalPointId(s, index);
      if (!matchedId) continue;
      const point = pointById.get(matchedId);
      const e = ensure(s.date, matchedId, point);
      const p = s.participants;
      e.bookings.push({
        id: s.id,
        tourName: s.tourName,
        startTime: s.startTime,
        pax: (p?.adults ?? 0) + (p?.teens ?? 0) + (p?.infants ?? 0),
        isTour: !s.rentalPointId,
      });
    }

    const q = query.trim().toLowerCase();
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, pts]) => ({
        date,
        points: Array.from(pts.values())
          .filter((p) => !q || p.pointName.toLowerCase().includes(q))
          .sort((a, b) => a.pointName.localeCompare(b.pointName))
          .map((p) => ({
            ...p,
            bookings: p.bookings.sort((x, y) => x.startTime.localeCompare(y.startTime)),
          })),
      }))
      .filter((g) => g.points.length > 0);
  }, [days, shifts, today, query, index, pointById]);

  if (loading || shiftsLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE_SIZE);
          }}
          placeholder="Filter by rental point…"
          className="pl-8 h-9"
        />
      </div>

      {grouped.length === 0 ? (
        <Card className="p-6 border-dashed text-sm text-muted-foreground text-center">
          No upcoming rental-point days.
        </Card>
      ) : (
        <>
          {grouped.slice(0, limit).map((g) => (
            <section key={g.date}>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-primary" />
                {fmtDate(g.date)}
              </h3>
              <div className="grid gap-3">
                {g.points.map((p) => (
                  <Card key={p.pointId} className="p-3 border-border/60">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <CoverageDot
                            bookings={p.bookings.length}
                            staff={p.staff}
                          />
                          {p.pointName}
                        </div>

                        {p.address && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <MapPin className="h-3 w-3" /> {p.address}
                          </div>
                        )}
                        {p.phone && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Phone className="h-3 w-3" /> {p.phone}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {p.bookings.length} booking{p.bookings.length === 1 ? "" : "s"}
                        </Badge>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {p.bookings.reduce((s, b) => s + b.pax, 0)} pax
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.staff.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">No staff assigned</span>
                      ) : (
                        p.staff.map((s, i) => (
                          <span
                            key={`${s.name}-${i}`}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                              s.status === "accepted"
                                ? "border-success/40 bg-success/10"
                                : s.status === "rejected"
                                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                                  : "border-warning/40 bg-warning/10",
                            )}
                          >
                            <Avatar
                              name={s.name}
                              initials={s.avatar}
                              size="sm"
                              className="!h-4 !w-4 text-[8px]"
                            />
                            {s.name}
                            {s.status !== "accepted" && (
                              <span className="text-[9px] uppercase tracking-wide font-bold">
                                {s.status}
                              </span>
                            )}
                          </span>
                        ))
                      )}
                    </div>

                    {p.bookings.length > 0 && (
                      <div className="mt-2 border-t border-border/40 pt-2 space-y-1">
                        {p.bookings.map((b) => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                          >
                            <span className="flex items-center gap-1 min-w-0">
                              <Clock className="h-3 w-3 shrink-0" />
                              <span className="font-medium text-foreground">{b.startTime}</span>
                              <span className="truncate">{b.tourName}</span>
                              {isPartnerTour(b.tourName) && <PartnerTag className="shrink-0" />}
                              {b.isTour && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] uppercase tracking-wider font-bold border-primary/40 text-primary bg-primary/5 shrink-0"
                                  title="Guided tour departing from this location (not a bike rental)"
                                >
                                  Tour
                                </Badge>
                              )}
                            </span>
                            <span className="shrink-0">{b.pax} pax</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          ))}
          {grouped.length > limit && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                Load more ({grouped.length - limit} more days)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
