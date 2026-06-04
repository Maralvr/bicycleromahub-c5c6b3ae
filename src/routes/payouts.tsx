import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { CalendarIcon, Check, CheckCheck, Euro, ChevronDown, ChevronRight } from "lucide-react";
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

type Rate = { product_id: string; title: string; tier1: number; tier2: number };

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
  adults: number | null;
  teens: number | null;
  infants: number | null;
};

const LARGE_GROUP_BONUS = 20;
const LARGE_GROUP_THRESHOLD = 8;
const paxOf = (s: PayoutShift) => (s.adults ?? 0) + (s.teens ?? 0) + (s.infants ?? 0);


function PayoutsPage() {
  const { role } = useCurrentUser();
  const { user } = useAuth();
  const { staff } = useStaffStore();

  const [from, setFrom] = useState<Date>(startOfMonth(new Date()));
  const [to, setTo] = useState<Date>(endOfMonth(new Date()));
  const [rates, setRates] = useState<Rate[]>([]);
  const [shifts, setShifts] = useState<PayoutShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [paidFilter, setPaidFilter] = useState<"unpaid" | "paid" | "all">("unpaid");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Load rates once
  useEffect(() => {
    void supabase
      .from("guide_payout_rates")
      .select("product_id, title, tier1, tier2")
      .then(({ data }) => setRates((data ?? []) as Rate[]));
  }, []);

  // Load shifts in range
  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("shifts")
      .select("id, tour_name, date, start_time, assigned_staff_id, bokun_product_id, payout_tier, payout_paid, payout_paid_at")
      .gte("date", format(from, "yyyy-MM-dd"))
      .lte("date", format(to, "yyyy-MM-dd"))
      .not("assigned_staff_id", "is", null)
      .is("rental_point_id", null)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) toast.error(error.message);
    setShifts(((data ?? []) as PayoutShift[]));
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

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

  const findRate = (s: PayoutShift): Rate | undefined => {
    if (s.bokun_product_id) return ratesByProduct.get(s.bokun_product_id);
    return ratesByTitle.get(s.tour_name.trim().toLowerCase());
  };
  const amountFor = (s: PayoutShift): number => {
    const r = findRate(s);
    if (!r) return 0;
    return s.payout_tier === 2 ? Number(r.tier2) : Number(r.tier1);
  };

  // Guide-grouped + filtered
  const grouped = useMemo(() => {
    const filtered = shifts.filter((s) => {
      if (paidFilter === "paid") return s.payout_paid;
      if (paidFilter === "unpaid") return !s.payout_paid;
      return true;
    });
    const byGuide = new Map<string, PayoutShift[]>();
    for (const s of filtered) {
      const arr = byGuide.get(s.assigned_staff_id) ?? [];
      arr.push(s);
      byGuide.set(s.assigned_staff_id, arr);
    }
    return Array.from(byGuide.entries())
      .map(([guideId, list]) => {
        const guide = staff.find((g) => g.id === guideId);
        const total = list.reduce((acc, s) => acc + amountFor(s), 0);
        return { guideId, guide, list, total };
      })
      .sort((a, b) => (a.guide?.name ?? "").localeCompare(b.guide?.name ?? ""));
  }, [shifts, staff, paidFilter, ratesByProduct, ratesByTitle]);

  const setTier = async (id: string, tier: 1 | 2) => {
    const prev = shifts;
    setShifts((s) => s.map((x) => (x.id === id ? { ...x, payout_tier: tier } : x)));
    const { error } = await supabase.from("shifts").update({ payout_tier: tier }).eq("id", id);
    if (error) {
      setShifts(prev);
      toast.error(error.message);
    }
  };

  const markPaid = async (ids: string[], paid: boolean) => {
    const patch = paid
      ? { payout_paid: true, payout_paid_at: new Date().toISOString(), payout_paid_by: user?.id ?? null }
      : { payout_paid: false, payout_paid_at: null, payout_paid_by: null };
    const prev = shifts;
    setShifts((s) =>
      s.map((x) =>
        ids.includes(x.id)
          ? { ...x, payout_paid: paid, payout_paid_at: paid ? new Date().toISOString() : null }
          : x,
      ),
    );
    const { error } = await supabase.from("shifts").update(patch).in("id", ids);
    if (error) {
      setShifts(prev);
      toast.error(error.message);
    } else {
      toast.success(paid ? `Marked ${ids.length} as paid` : `Reopened ${ids.length}`);
    }
  };

  if (role !== "admin") return <Navigate to="/" />;

  const grandTotal = grouped.reduce((a, g) => a + g.total, 0);

  return (
    <AppShell>
      <PageHeader
        title="Guide Payouts"
        subtitle="Track what's owed to each guide. Pick the rate tier for each shift, then mark as paid."
      />

      <Card className="p-4 mb-4 flex flex-wrap items-end gap-3">
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Quick range</span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => { const d = new Date(); setFrom(startOfMonth(d)); setTo(endOfMonth(d)); }}>This month</Button>
            <Button size="sm" variant="outline" onClick={() => { const d = new Date(); d.setMonth(d.getMonth() - 1); setFrom(startOfMonth(d)); setTo(endOfMonth(d)); }}>Last month</Button>
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
            const isOpen = expanded[g.guideId] ?? true;
            const unpaidIds = g.list.filter((s) => !s.payout_paid).map((s) => s.id);
            return (
              <Card key={g.guideId} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [g.guideId]: !isOpen }))}
                  className="w-full flex items-center gap-3 p-4 hover:bg-accent/40 text-left"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-sm">
                    {g.guide?.avatar ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{g.guide?.name ?? "Unknown guide"}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.list.length} shift{g.list.length === 1 ? "" : "s"} · {g.list.filter((s) => !s.payout_paid).length} unpaid
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="text-lg font-bold tabular-nums">€{g.total.toFixed(0)}</div>
                  </div>
                  {unpaidIds.length > 0 && (
                    <Button
                      size="sm"
                      className="ml-2"
                      onClick={(e) => { e.stopPropagation(); void markPaid(unpaidIds, true); }}
                    >
                      <CheckCheck className="h-4 w-4 mr-1" /> Mark all paid
                    </Button>
                  )}
                </button>

                {isOpen && (
                  <div className="border-t divide-y">
                    {g.list.map((s) => {
                      const rate = findRate(s);
                      const tier = (s.payout_tier ?? 1) as 1 | 2;
                      const amt = amountFor(s);
                      return (
                        <div key={s.id} className="flex flex-wrap items-center gap-3 p-3 px-4">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">{s.tour_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(parseISO(s.date), "EEE d MMM yyyy")} · {s.start_time.slice(0, 5)}
                              {!rate && <span className="ml-2 text-warning">· no rate matched</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
                            <Button
                              size="sm"
                              variant={tier === 1 ? "default" : "ghost"}
                              className="h-7 px-2 text-xs"
                              onClick={() => setTier(s.id, 1)}
                              disabled={s.payout_paid}
                            >
                              T1 {rate ? `€${Number(rate.tier1)}` : ""}
                            </Button>
                            <Button
                              size="sm"
                              variant={tier === 2 ? "default" : "ghost"}
                              className="h-7 px-2 text-xs"
                              onClick={() => setTier(s.id, 2)}
                              disabled={s.payout_paid}
                            >
                              T2 {rate ? `€${Number(rate.tier2)}` : ""}
                            </Button>
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
                                onClick={() => void markPaid([s.id], false)}
                                className="ml-1 text-xs underline opacity-70 hover:opacity-100"
                              >
                                undo
                              </button>
                            </Badge>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => void markPaid([s.id], true)}>
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

function DateField({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
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
