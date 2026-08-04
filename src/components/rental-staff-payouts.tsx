import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, CheckCheck, ChevronDown, ChevronRight, Euro } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Rental-staff payouts. Unlike guide payouts (one payable line per shift),
 * the payable unit here is a DAY: a staff member working two shifts in one
 * day inside their double-shift season is one single day amount, not two
 * line items. The amount itself is computed in the database
 * (rental_staff_day_amounts) so the two pay models -- per-time-range rates
 * and flat/double-shift-season -- live in one place, and frozen into
 * rental_staff_day_payouts.amount when marked paid.
 */
type DayRow = {
  rental_staff_id: string;
  date: string;
  shift_count: number;
  amount: number | null;
  paid: boolean;
  paid_at: string | null;
  frozen_amount: number | null;
};

type StaffRow = { id: string; name: string; avatar: string };

export function RentalStaffPayouts({
  from,
  to,
  paidFilter,
}: {
  from: Date;
  to: Date;
  paidFilter: "unpaid" | "paid" | "all";
}) {
  const [rows, setRows] = useState<DayRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    const [r, s] = await Promise.all([
      supabase.rpc("rental_staff_day_amounts" as never, {
        _from: format(from, "yyyy-MM-dd"),
        _to: format(to, "yyyy-MM-dd"),
      } as never),
      supabase.from("rental_staff" as never).select("id, name, avatar").order("name"),
    ]);
    if (r.error) toast.error(r.error.message);
    if (s.error) toast.error(s.error.message);
    setRows((r.data ?? []) as unknown as DayRow[]);
    setStaff((s.data ?? []) as unknown as StaffRow[]);
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const amountOf = (d: DayRow) =>
    d.paid && d.frozen_amount != null ? Number(d.frozen_amount) : Number(d.amount ?? 0);

  const grouped = useMemo(() => {
    const filtered = rows.filter((d) =>
      paidFilter === "paid" ? d.paid : paidFilter === "unpaid" ? !d.paid : true,
    );
    const byStaff = new Map<string, DayRow[]>();
    for (const d of filtered) {
      byStaff.set(d.rental_staff_id, [...(byStaff.get(d.rental_staff_id) ?? []), d]);
    }
    return Array.from(byStaff.entries())
      .map(([id, list]) => ({
        id,
        person: staff.find((s) => s.id === id),
        list: list.slice().sort((a, b) => a.date.localeCompare(b.date)),
        total: list.reduce((acc, d) => acc + amountOf(d), 0),
      }))
      .sort((a, b) => (a.person?.name ?? "").localeCompare(b.person?.name ?? ""));
  }, [rows, staff, paidFilter]);

  const markPaid = async (days: DayRow[], paid: boolean) => {
    const prev = rows;
    setRows((rs) =>
      rs.map((x) =>
        days.some((d) => d.rental_staff_id === x.rental_staff_id && d.date === x.date)
          ? {
              ...x,
              paid,
              paid_at: paid ? new Date().toISOString() : null,
              frozen_amount: paid ? amountOf(x) : null,
            }
          : x,
      ),
    );
    const results = await Promise.all(
      days.map((d) =>
        supabase.rpc("set_rental_staff_day_payout" as never, {
          _rental_staff_id: d.rental_staff_id,
          _date: d.date,
          _paid: paid,
          _amount: paid ? amountOf(d) : null,
        } as never),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setRows(prev);
      toast.error(failed.error.message);
      return;
    }
    toast.success(paid ? `Marked ${days.length} day(s) paid` : `Reopened ${days.length} day(s)`);
  };

  const grandTotal = grouped.reduce((a, g) => a + g.total, 0);

  return (
    <div className="mt-8">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">Rental staff</h2>
          <p className="text-xs text-muted-foreground">
            Paid per day worked at a rental point. Double-shift days inside the season window pay
            the single day rate.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Total ({paidFilter})</div>
          <div className="text-2xl font-bold tabular-nums">€{grandTotal.toFixed(0)}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground p-8 text-center">Loading…</div>
      ) : grouped.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No rental-staff days in this range.
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => {
            const isOpen = expanded[g.id] ?? false;
            const unpaid = g.list.filter((d) => !d.paid);
            return (
              <Card key={g.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [g.id]: !isOpen }))}
                  className="w-full flex items-center gap-3 p-4 hover:bg-accent/40 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-sm">
                    {g.person?.avatar ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{g.person?.name ?? "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.list.length} day{g.list.length === 1 ? "" : "s"} · {unpaid.length} unpaid
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="text-lg font-bold tabular-nums">€{g.total.toFixed(0)}</div>
                  </div>
                  {unpaid.length > 0 && (
                    <Button
                      size="sm"
                      className="ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        void markPaid(unpaid, true);
                      }}
                    >
                      <CheckCheck className="h-4 w-4 mr-1" /> Mark all paid
                    </Button>
                  )}
                </button>

                {isOpen && (
                  <div className="border-t divide-y">
                    {g.list.map((d) => (
                      <div
                        key={`${d.rental_staff_id}-${d.date}`}
                        className="flex flex-wrap items-center gap-3 p-3 px-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm">
                            {format(parseISO(d.date), "EEE d MMM yyyy")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {d.shift_count} shift{d.shift_count === 1 ? "" : "s"}
                            {d.shift_count >= 2 && " · double-shift day"}
                          </div>
                        </div>
                        <div className="w-20 text-right tabular-nums font-semibold flex items-center justify-end gap-1">
                          <Euro className="h-3.5 w-3.5 text-muted-foreground" />
                          {amountOf(d).toFixed(0)}
                        </div>
                        {d.paid ? (
                          <Badge variant="secondary" className="gap-1">
                            <Check className="h-3 w-3" /> Paid
                            <button
                              type="button"
                              onClick={() => void markPaid([d], false)}
                              className="ml-1 text-xs underline opacity-70 hover:opacity-100"
                            >
                              undo
                            </button>
                          </Badge>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => void markPaid([d], true)}>
                            Mark paid
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
