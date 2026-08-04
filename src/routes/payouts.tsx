import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import {
  CalendarIcon,
  Check,
  CheckCheck,
  Euro,
  ChevronDown,
  ChevronRight,
  Settings,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/lib/current-user";
import { supabase } from "@/integrations/supabase/client";
import { useStaffStore } from "@/lib/staff-store";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/payouts")({
  head: () => ({
    meta: [
      { title: "Guide Payouts — Bicycle Roma" },
      { name: "description", content: "Track and pay out amounts owed to guides." },
    ],
  }),
  component: PayoutsPage,
});

type Rate = {
  product_id: string;
  title: string;
  tier1: number;
  tier2: number;
  private_rate: number | null;
};

type PayoutShift = {
  id: string;
  tour_name: string;
  date: string;
  start_time: string;
  assigned_staff_id: string;
  bokun_product_id: string | null;
  payout_tier: number | null;
  payout_paid: boolean;
  payout_paid_at: string | null;
  payout_amount: number | null;
  adults: number | null;
  teens: number | null;
  infants: number | null;
};

type AdditionalPayoutRow = {
  id: string;
  staff_id: string;
  payout_tier: number | null;
  payout_paid: boolean;
  payout_paid_at: string | null;
  payout_amount: number | null;
  shifts: {
    tour_name: string;
    date: string;
    start_time: string;
    bokun_product_id: string | null;
    adults: number | null;
    teens: number | null;
    infants: number | null;
  } | null;
};

// Unified shape for a single payable line, whether it's the primary guide
// on a booking (from `shifts`) or an additional guide (from
// `shift_additional_guides`). Each additional guide is paid independently
// at the full rate, same as the primary -- so a booking with 2 guides
// produces 2 separate PayoutLines, one per guide, each individually
// tier-able / mark-paid-able.
type PayoutLine = {
  id: string;
  kind: "primary" | "additional";
  guideId: string;
  tour_name: string;
  date: string;
  start_time: string;
  bokun_product_id: string | null;
  payout_tier: number | null;
  payout_paid: boolean;
  payout_paid_at: string | null;
  payout_amount: number | null;
  adults: number | null;
  teens: number | null;
  infants: number | null;
};

const LARGE_GROUP_BONUS = 20;
const LARGE_GROUP_THRESHOLD = 8;
const paxOf = (s: { adults: number | null; teens: number | null; infants: number | null }) =>
  (s.adults ?? 0) + (s.teens ?? 0) + (s.infants ?? 0);

function PayoutsPage() {
  const { role } = useCurrentUser();
  const { isRentalStaff, rolesLoaded } = useAuth();
  const { staff } = useStaffStore();
  const navigate = useNavigate();

  const [from, setFrom] = useState<Date>(startOfMonth(new Date()));
  const [to, setTo] = useState<Date>(endOfMonth(new Date()));
  const [rates, setRates] = useState<Rate[]>([]);
  const [shifts, setShifts] = useState<PayoutShift[]>([]);
  const [additionalRows, setAdditionalRows] = useState<AdditionalPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paidFilter, setPaidFilter] = useState<"unpaid" | "paid" | "all">("unpaid");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Load rates once
  useEffect(() => {
    void supabase
      .from("guide_payout_rates")
      .select("product_id, title, tier1, tier2, private_rate")
      .then(({ data }) => setRates((data ?? []) as Rate[]));
  }, []);

  // Load shifts in range (primary-guide payouts)
  const reload = async () => {
    setLoading(true);
    const fromStr = format(from, "yyyy-MM-dd");
    const toStr = format(to, "yyyy-MM-dd");
    const { data, error } = await supabase
      .from("shifts")
      .select(
        "id, tour_name, date, start_time, assigned_staff_id, bokun_product_id, payout_tier, payout_paid, payout_paid_at, payout_amount, adults, teens, infants",
      )
      .gte("date", fromStr)
      .lte("date", toStr)
      // Cancelled bookings drop out unless the payout was already paid.
      .or("cancelled_at.is.null,payout_paid.eq.true")
      .not("assigned_staff_id", "is", null)
      .is("rental_point_id", null)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) toast.error(error.message);
    setShifts((data ?? []) as PayoutShift[]);

    // Load additional-guide payouts in the same range. Each additional
    // guide is paid independently at the full rate (product decision), so
    // these become their own payout lines below, not folded into the
    // primary guide's total.
    const { data: addlData, error: addlErr } = await supabase
      .from("shift_additional_guides" as never)
      .select(
        "id, staff_id, payout_tier, payout_paid, payout_paid_at, payout_amount, shifts!inner(tour_name, date, start_time, bokun_product_id, adults, teens, infants, rental_point_id, cancelled_at)" as never,
      )
      .gte("shifts.date" as never, fromStr)
      .lte("shifts.date" as never, toStr)
      .is("shifts.rental_point_id" as never, null);
    if (addlErr) toast.error(addlErr.message);
    // Cancelled bookings drop out of payouts unless the line was already paid
    // (same rule as the primary-guide query above).
    setAdditionalRows(
      ((addlData ?? []) as unknown as AdditionalPayoutRow[]).filter(
        (r) => !(r.shifts as { cancelled_at?: string | null } | null)?.cancelled_at || r.payout_paid,
      ),
    );

    setLoading(false);
  };
  useEffect(() => {
    void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [from, to]);

  const ratesByProduct = useMemo(() => {
    const m = new Map<string, Rate>();
    for (const r of rates) m.set(r.product_id, r);
    return m;
  }, [rates]);
  const ratesByTitle = useMemo(() => {
    const m = new Map<string, Rate>();
    for (const r of rates) m.set(r.title.trim().toLowerCase(), r);
    return m;
  }, [rates]);

  const findRate = (s: {
    bokun_product_id: string | null;
    tour_name: string;
  }): Rate | undefined => {
    if (s.bokun_product_id) return ratesByProduct.get(s.bokun_product_id);
    return ratesByTitle.get(s.tour_name.trim().toLowerCase());
  };
  // Once a line is marked paid, its amount is frozen (payout_amount, set at
  // the moment it was marked paid) rather than recomputed from the current
  // rate table -- so editing a rate later never silently changes what a
  // past payout displays as having been paid. Only still-unpaid lines are
  // computed live.
  const amountFor = (s: PayoutLine): number => {
    if (s.payout_paid && s.payout_amount != null) return Number(s.payout_amount);
    const r = findRate(s);
    if (!r) return 0;
    const base =
      s.payout_tier === 3 && r.private_rate != null
        ? Number(r.private_rate)
        : s.payout_tier === 2
          ? Number(r.tier2)
          : Number(r.tier1);
    return base + (paxOf(s) >= LARGE_GROUP_THRESHOLD ? LARGE_GROUP_BONUS : 0);
  };

  // Merge primary-guide shifts and additional-guide assignments into one
  // list of payable lines. A booking with 2 assigned guides shows up
  // twice here -- once per guide -- each independently tier-able and
  // payable, per the "each guide gets the full rate" decision.
  const allLines: PayoutLine[] = useMemo(() => {
    const primary: PayoutLine[] = shifts.map((s) => ({
      id: s.id,
      kind: "primary",
      guideId: s.assigned_staff_id,
      tour_name: s.tour_name,
      date: s.date,
      start_time: s.start_time,
      bokun_product_id: s.bokun_product_id,
      payout_tier: s.payout_tier,
      payout_paid: s.payout_paid,
      payout_paid_at: s.payout_paid_at,
      payout_amount: s.payout_amount,
      adults: s.adults,
      teens: s.teens,
      infants: s.infants,
    }));
    const additional: PayoutLine[] = additionalRows
      .filter(
        (r): r is AdditionalPayoutRow & { shifts: NonNullable<AdditionalPayoutRow["shifts"]> } =>
          !!r.shifts,
      )
      .map((r) => ({
        id: r.id,
        kind: "additional",
        guideId: r.staff_id,
        tour_name: r.shifts.tour_name,
        date: r.shifts.date,
        start_time: r.shifts.start_time,
        bokun_product_id: r.shifts.bokun_product_id,
        payout_tier: r.payout_tier,
        payout_paid: r.payout_paid,
        payout_paid_at: r.payout_paid_at,
        payout_amount: r.payout_amount,
        adults: r.shifts.adults,
        teens: r.shifts.teens,
        infants: r.shifts.infants,
      }));
    return [...primary, ...additional];
  }, [shifts, additionalRows]);

  // Guide-grouped + filtered
  const grouped = useMemo(() => {
    const filtered = allLines.filter((s) => {
      if (paidFilter === "paid") return s.payout_paid;
      if (paidFilter === "unpaid") return !s.payout_paid;
      return true;
    });
    const byGuide = new Map<string, PayoutLine[]>();
    for (const s of filtered) {
      const arr = byGuide.get(s.guideId) ?? [];
      arr.push(s);
      byGuide.set(s.guideId, arr);
    }
    return Array.from(byGuide.entries())
      .map(([guideId, list]) => {
        const guide = staff.find((g) => g.id === guideId);
        const total = list.reduce((acc, s) => acc + amountFor(s), 0);
        return { guideId, guide, list, total };
      })
      .sort((a, b) => (a.guide?.name ?? "").localeCompare(b.guide?.name ?? ""));
  }, [allLines, staff, paidFilter, ratesByProduct, ratesByTitle]);

  // Payout writes go through the payout-only RPCs (set_shift_payout /
  // set_additional_guide_payout) rather than raw table updates: rental staff
  // have payout parity with admins, but must not be able to touch any other
  // column on shifts (customer data, dates, assignment, rate).
  const setTier = async (line: { id: string; kind: "primary" | "additional" }, tier: 1 | 2 | 3) => {
    if (line.kind === "primary") {
      const prev = shifts;
      setShifts((s) => s.map((x) => (x.id === line.id ? { ...x, payout_tier: tier } : x)));
      const { error } = await supabase.rpc("set_shift_payout" as never, {
        _shift_id: line.id,
        _tier: tier,
      } as never);
      if (error) {
        setShifts(prev);
        toast.error(error.message);
      }
    } else {
      const prev = additionalRows;
      setAdditionalRows((rows) =>
        rows.map((x) => (x.id === line.id ? { ...x, payout_tier: tier } : x)),
      );
      const { error } = await supabase.rpc("set_additional_guide_payout" as never, {
        _row_id: line.id,
        _tier: tier,
      } as never);
      if (error) {
        setAdditionalRows(prev);
        toast.error(error.message);
      }
    }
  };

  // Marking paid freezes each line's amount (payout_amount) at whatever
  // amountFor() computes right now -- while the line is still unpaid, i.e.
  // still reading live off the current rate table. Different lines can
  // have different tiers/rates/large-group bonuses, so this can't be one
  // shared patch the way the plain paid/paid_at fields can; each line gets
  // its own update carrying its own frozen amount. Unmarking (undo) clears
  // the freeze back to null, since a reopened line is an active/pending
  // payout again and should go back to tracking the live rate.
  const markPaid = async (lines: PayoutLine[], paid: boolean) => {
    const primaryLines = lines.filter((l) => l.kind === "primary");
    const additionalLines = lines.filter((l) => l.kind === "additional");
    const nowIso = new Date().toISOString();

    if (primaryLines.length > 0) {
      const prev = shifts;
      if (paid) {
        const amounts = new Map(primaryLines.map((l) => [l.id, amountFor(l)]));
        setShifts((s) =>
          s.map((x) =>
            amounts.has(x.id)
              ? {
                  ...x,
                  payout_paid: true,
                  payout_paid_at: nowIso,
                  payout_amount: amounts.get(x.id)!,
                }
              : x,
          ),
        );
        const results = await Promise.all(
          primaryLines.map((l) =>
            supabase.rpc("set_shift_payout" as never, {
              _shift_id: l.id,
              _paid: true,
              _amount: amounts.get(l.id) ?? null,
            } as never),
          ),
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) {
          setShifts(prev);
          toast.error(failed.error.message);
          return;
        }
      } else {
        const ids = primaryLines.map((l) => l.id);
        setShifts((s) =>
          s.map((x) =>
            ids.includes(x.id)
              ? { ...x, payout_paid: false, payout_paid_at: null, payout_amount: null }
              : x,
          ),
        );
        const unpaidResults = await Promise.all(
          ids.map((id) =>
            supabase.rpc("set_shift_payout" as never, {
              _shift_id: id,
              _paid: false,
            } as never),
          ),
        );
        const unpaidFailed = unpaidResults.find((r) => r.error);
        if (unpaidFailed?.error) {
          setShifts(prev);
          toast.error(unpaidFailed.error.message);
          return;
        }
      }
    }

    if (additionalLines.length > 0) {
      const prev = additionalRows;
      if (paid) {
        const amounts = new Map(additionalLines.map((l) => [l.id, amountFor(l)]));
        setAdditionalRows((rows) =>
          rows.map((x) =>
            amounts.has(x.id)
              ? {
                  ...x,
                  payout_paid: true,
                  payout_paid_at: nowIso,
                  payout_amount: amounts.get(x.id)!,
                }
              : x,
          ),
        );
        const results = await Promise.all(
          additionalLines.map((l) =>
            supabase.rpc("set_additional_guide_payout" as never, {
              _row_id: l.id,
              _paid: true,
              _amount: amounts.get(l.id) ?? null,
            } as never),
          ),
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) {
          setAdditionalRows(prev);
          toast.error(failed.error.message);
          return;
        }
      } else {
        const ids = additionalLines.map((l) => l.id);
        setAdditionalRows((rows) =>
          rows.map((x) =>
            ids.includes(x.id)
              ? { ...x, payout_paid: false, payout_paid_at: null, payout_amount: null }
              : x,
          ),
        );
        const unpaidResults = await Promise.all(
          ids.map((id) =>
            supabase.rpc("set_additional_guide_payout" as never, {
              _row_id: id,
              _paid: false,
            } as never),
          ),
        );
        const unpaidFailed = unpaidResults.find((r) => r.error);
        if (unpaidFailed?.error) {
          setAdditionalRows(prev);
          toast.error(unpaidFailed.error.message);
          return;
        }
      }
    }

    toast.success(paid ? `Marked ${lines.length} as paid` : `Reopened ${lines.length}`);
  };

  if (!rolesLoaded) return null;
  if (role !== "admin" && !isRentalStaff) return <Navigate to="/" />;

  const grandTotal = grouped.reduce((a, g) => a + g.total, 0);

  return (
    <AppShell>
      <PageHeader
        title="Guide Payouts"
        subtitle="Track what's owed to each guide. Pick the rate tier for each shift, then mark as paid."
        actions={
          <Button
            variant="outline"
            size="icon"
            onClick={() => void navigate({ to: "/payout-rates" })}
            title="Edit payout tier rates"
          >
            <Settings className="h-4 w-4" />
          </Button>
        }
      />

      <Card className="p-4 mb-4 flex flex-wrap items-end gap-3">
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Quick range</span>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date();
                setFrom(startOfMonth(d));
                setTo(endOfMonth(d));
              }}
            >
              This month
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date();
                d.setMonth(d.getMonth() - 1);
                setFrom(startOfMonth(d));
                setTo(endOfMonth(d));
              }}
            >
              Last month
            </Button>
          </div>
        </div>
        <div className="flex-1" />
        <Tabs value={paidFilter} onValueChange={(v) => setPaidFilter(v as typeof paidFilter)}>
          <TabsList>
            <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Total ({paidFilter})</div>
          <div className="text-2xl font-bold tabular-nums">€{grandTotal.toFixed(0)}</div>
        </div>
      </Card>

      {loading ? (
        <div className="text-muted-foreground p-8 text-center">Loading…</div>
      ) : grouped.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No shifts in this range.</Card>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => {
            const isOpen = expanded[g.guideId] ?? false;
            const unpaidLines = g.list.filter((s) => !s.payout_paid);
            return (
              <Card key={g.guideId} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [g.guideId]: !isOpen }))}
                  className="w-full flex items-center gap-3 p-4 hover:bg-accent/40 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-sm">
                    {g.guide?.avatar ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{g.guide?.name ?? "Unknown guide"}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.list.length} shift{g.list.length === 1 ? "" : "s"} ·{" "}
                      {g.list.filter((s) => !s.payout_paid).length} unpaid
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="text-lg font-bold tabular-nums">€{g.total.toFixed(0)}</div>
                  </div>
                  {unpaidLines.length > 0 && (
                    <Button
                      size="sm"
                      className="ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        void markPaid(unpaidLines, true);
                      }}
                    >
                      <CheckCheck className="h-4 w-4 mr-1" /> Mark all paid
                    </Button>
                  )}
                </button>

                {isOpen && (
                  <div className="border-t divide-y">
                    {g.list.map((s) => {
                      const rate = findRate(s);
                      const tier = (s.payout_tier ?? 1) as 1 | 2 | 3;
                      const amt = amountFor(s);
                      return (
                        <div key={s.id} className="flex flex-wrap items-center gap-3 p-3 px-4">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate flex items-center gap-1.5">
                              {s.tour_name}
                              {s.kind === "additional" && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] uppercase tracking-wider h-4 px-1.5 border-secondary/40 text-secondary-foreground bg-secondary/20"
                                >
                                  Co-guide
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(parseISO(s.date), "EEE d MMM yyyy")} ·{" "}
                              {s.start_time.slice(0, 5)} · {paxOf(s)} pax
                              {paxOf(s) >= LARGE_GROUP_THRESHOLD && (
                                <span className="ml-2 text-primary font-medium">
                                  +€{LARGE_GROUP_BONUS} large group
                                </span>
                              )}
                              {!rate && (
                                <span className="ml-2 text-warning">· no rate matched</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
                            <Button
                              size="sm"
                              variant={tier === 1 ? "default" : "ghost"}
                              className="h-7 px-2 text-xs"
                              onClick={() => setTier(s, 1)}
                              disabled={s.payout_paid}
                            >
                              T1 {rate ? `€${Number(rate.tier1)}` : ""}
                            </Button>
                            <Button
                              size="sm"
                              variant={tier === 2 ? "default" : "ghost"}
                              className="h-7 px-2 text-xs"
                              onClick={() => setTier(s, 2)}
                              disabled={s.payout_paid}
                            >
                              T2 {rate ? `€${Number(rate.tier2)}` : ""}
                            </Button>
                            {rate?.private_rate != null && (
                              <Button
                                size="sm"
                                variant={tier === 3 ? "default" : "ghost"}
                                className="h-7 px-2 text-xs"
                                onClick={() => setTier(s, 3)}
                                disabled={s.payout_paid}
                              >
                                Private €{Number(rate.private_rate)}
                              </Button>
                            )}
                          </div>

                          <div className="w-20 text-right tabular-nums font-semibold flex items-center justify-end gap-1">
                            <Euro className="h-3.5 w-3.5 text-muted-foreground" />
                            {amt.toFixed(0)}
                          </div>

                          {s.payout_paid ? (
                            <Badge variant="secondary" className="gap-1">
                              <Check className="h-3 w-3" /> Paid
                              <button
                                type="button"
                                onClick={() => void markPaid([s], false)}
                                className="ml-1 text-xs underline opacity-70 hover:opacity-100"
                              >
                                undo
                              </button>
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void markPaid([s], true)}
                            >
                              Mark paid
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(value, "PPP")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => d && onChange(d)}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
