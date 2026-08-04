import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Euro, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/lib/current-user";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/rental-staff-rates")({
  head: () => ({
    meta: [
      { title: "Rental Staff Pay Rates — Bicycle Roma" },
      {
        name: "description",
        content:
          "Set what each rental-point staff member is paid: flat per-shift amounts, double-shift season rates, or per-time-range rates.",
      },
      { property: "og:title", content: "Rental Staff Pay Rates — Bicycle Roma" },
      {
        property: "og:description",
        content: "Flat per-shift, double-shift season and per-time-range pay rates for rental staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RentalStaffRatesPage,
});

type StaffRow = {
  id: string;
  name: string;
  avatar: string;
  active: boolean;
  default_shift_rate: number | null;
  double_shift_rate: number | null;
  double_shift_season_start: string | null;
  double_shift_season_end: string | null;
};

type ShiftRate = {
  id: string;
  rental_staff_id: string;
  shift_start_time: string;
  shift_end_time: string;
  amount: number;
};

const hhmm = (t: string) => t.slice(0, 5);

function RentalStaffRatesPage() {
  const { role } = useCurrentUser();
  const { isRentalStaff, rolesLoaded } = useAuth();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [rates, setRates] = useState<ShiftRate[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const [s, r] = await Promise.all([
      supabase
        .from("rental_staff" as never)
        .select(
          "id, name, avatar, active, default_shift_rate, double_shift_rate, double_shift_season_start, double_shift_season_end",
        )
        .order("name"),
      supabase
        .from("rental_staff_shift_rates" as never)
        .select("id, rental_staff_id, shift_start_time, shift_end_time, amount")
        .order("shift_end_time"),
    ]);
    if (s.error) toast.error(s.error.message);
    if (r.error) toast.error(r.error.message);
    setStaff((s.data ?? []) as unknown as StaffRow[]);
    setRates((r.data ?? []) as unknown as ShiftRate[]);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  if (!rolesLoaded) return null;
  if (role !== "admin" && !isRentalStaff) return <Navigate to="/" />;

  return (
    <AppShell>
      <PageHeader
        title="Rental Staff Pay Rates"
        subtitle="Two pay models are supported. Add time-range rates for staff paid by shift length; leave those empty and set a flat per-shift amount instead. The double-shift amount replaces 2x the flat amount only on days inside the season window."
        actions={
          <Button variant="outline" onClick={() => void navigate({ to: "/payouts" })}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Payouts
          </Button>
        }
      />

      {loading ? (
        <div className="text-muted-foreground p-8 text-center">Loading…</div>
      ) : staff.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No rental staff yet.</Card>
      ) : (
        <div className="space-y-3">
          {staff.map((s) => (
            <StaffRateCard
              key={s.id}
              staff={s}
              rates={rates.filter((r) => r.rental_staff_id === s.id)}
              onChanged={reload}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function StaffRateCard({
  staff,
  rates,
  onChanged,
}: {
  staff: StaffRow;
  rates: ShiftRate[];
  onChanged: () => Promise<void>;
}) {
  const [flat, setFlat] = useState(staff.default_shift_rate?.toString() ?? "");
  const [dbl, setDbl] = useState(staff.double_shift_rate?.toString() ?? "");
  const [seasonStart, setSeasonStart] = useState(staff.double_shift_season_start ?? "");
  const [seasonEnd, setSeasonEnd] = useState(staff.double_shift_season_end ?? "");
  const [saving, setSaving] = useState(false);

  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [newAmount, setNewAmount] = useState("");

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const saveFlat = async () => {
    const f = num(flat);
    const d = num(dbl);
    if ((f != null && !Number.isFinite(f)) || (d != null && !Number.isFinite(d))) {
      toast.error("Enter valid amounts");
      return;
    }
    const validSeason = (v: string) => v === "" || /^\d{2}-\d{2}$/.test(v);
    if (!validSeason(seasonStart) || !validSeason(seasonEnd)) {
      toast.error("Season dates must be MM-DD, e.g. 06-15");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("rental_staff" as never)
      .update({
        default_shift_rate: f,
        double_shift_rate: d,
        double_shift_season_start: seasonStart || null,
        double_shift_season_end: seasonEnd || null,
      } as never)
      .eq("id", staff.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Updated ${staff.name}`);
    await onChanged();
  };

  const addRate = async () => {
    const a = Number(newAmount);
    if (!Number.isFinite(a) || a < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const { error } = await supabase.from("rental_staff_shift_rates" as never).upsert(
      {
        rental_staff_id: staff.id,
        shift_start_time: `${newStart}:00`,
        shift_end_time: `${newEnd}:00`,
        amount: a,
      } as never,
      { onConflict: "rental_staff_id,shift_start_time,shift_end_time" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewAmount("");
    await onChanged();
  };

  const removeRate = async (id: string) => {
    const { error } = await supabase.from("rental_staff_shift_rates" as never).delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await onChanged();
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b">
        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-sm">
          {staff.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{staff.name}</div>
          <div className="text-xs text-muted-foreground">
            {rates.length > 0
              ? `Paid by time range (${rates.length} option${rates.length === 1 ? "" : "s"})`
              : "Paid a flat amount per shift"}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Flat per shift">
            <MoneyInput value={flat} onChange={setFlat} />
          </Field>
          <Field label="Double-shift day">
            <MoneyInput value={dbl} onChange={setDbl} />
          </Field>
          <Field label="Season from (MM-DD)">
            <Input
              className="h-8 w-28"
              value={seasonStart}
              onChange={(e) => setSeasonStart(e.target.value)}
              placeholder="06-15"
            />
          </Field>
          <Field label="Season to (MM-DD)">
            <Input
              className="h-8 w-28"
              value={seasonEnd}
              onChange={(e) => setSeasonEnd(e.target.value)}
              placeholder="08-31"
            />
          </Field>
          <Button size="sm" disabled={saving} onClick={() => void saveFlat()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Time-range rates
          </div>
          {rates.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              None — this person is paid the flat amount above.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rates.map((r) => (
                <div
                  key={r.id}
                  className="inline-flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs tabular-nums"
                >
                  <span>
                    {hhmm(r.shift_start_time)}–{hhmm(r.shift_end_time)}
                  </span>
                  <span className="font-semibold">€{Number(r.amount)}</span>
                  <button
                    type="button"
                    onClick={() => void removeRate(r.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove rate"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <Field label="From">
              <Input
                type="time"
                className="h-8 w-28"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
              />
            </Field>
            <Field label="To">
              <Input
                type="time"
                className="h-8 w-28"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
              />
            </Field>
            <Field label="Amount">
              <MoneyInput value={newAmount} onChange={setNewAmount} />
            </Field>
            <Button size="sm" variant="outline" onClick={() => void addRate()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add rate
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MoneyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-24">
      <Euro className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        className="pl-7 h-8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="—"
      />
    </div>
  );
}
