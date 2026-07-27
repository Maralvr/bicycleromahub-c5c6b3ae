import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Euro, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/lib/current-user";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/payout-rates")({
  head: () => ({
    meta: [
      { title: "Payout Rates — Bicycle Roma" },
      { name: "description", content: "Set the guide payout tier amounts per tour." },
    ],
  }),
  component: PayoutRatesPage,
});

type Rate = { product_id: string; title: string; tier1: number; tier2: number };

function PayoutRatesPage() {
  const { role } = useCurrentUser();
  const navigate = useNavigate();
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase
      .from("guide_payout_rates")
      .select("product_id, title, tier1, tier2")
      .order("title", { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRates((data ?? []) as Rate[]);
        setLoading(false);
      });
  }, []);

  if (role !== "admin") return <Navigate to="/" />;

  return (
    <AppShell>
      <PageHeader
        title="Payout Rates"
        subtitle="What guides are paid per tour at Tier 1 / Tier 2. Changing a rate here only affects future and still-unpaid payouts -- shifts already marked paid keep the amount they were actually paid at."
        actions={
          <Button variant="outline" onClick={() => void navigate({ to: "/payouts" })}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Payouts
          </Button>
        }
      />

      {loading ? (
        <div className="text-muted-foreground p-8 text-center">Loading…</div>
      ) : rates.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No rates configured.</Card>
      ) : (
        <Card className="overflow-hidden divide-y">
          {rates.map((r) => (
            <RateRow
              key={r.product_id}
              rate={r}
              onSaved={(updated) =>
                setRates((rs) => rs.map((x) => (x.product_id === updated.product_id ? updated : x)))
              }
            />
          ))}
        </Card>
      )}
    </AppShell>
  );
}

function RateRow({ rate, onSaved }: { rate: Rate; onSaved: (updated: Rate) => void }) {
  const [tier1, setTier1] = useState(String(rate.tier1));
  const [tier2, setTier2] = useState(String(rate.tier2));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTier1(String(rate.tier1));
    setTier2(String(rate.tier2));
  }, [rate.product_id, rate.tier1, rate.tier2]);

  const changed = tier1 !== String(rate.tier1) || tier2 !== String(rate.tier2);

  const save = async () => {
    const t1 = Number(tier1);
    const t2 = Number(tier2);
    if (!Number.isFinite(t1) || t1 < 0 || !Number.isFinite(t2) || t2 < 0) {
      toast.error("Enter valid, non-negative amounts for both tiers");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("guide_payout_rates")
        .update({ tier1: t1, tier2: t2 })
        .eq("product_id", rate.product_id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`Updated ${rate.title}`);
      onSaved({ ...rate, tier1: t1, tier2: t2 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 px-4">
      <div className="flex-1 min-w-[220px] font-medium text-sm">{rate.title}</div>
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground">T1</Label>
        <div className="relative w-24">
          <Euro className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-7 h-8"
            value={tier1}
            onChange={(e) => setTier1(e.target.value)}
            inputMode="decimal"
          />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground">T2</Label>
        <div className="relative w-24">
          <Euro className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-7 h-8"
            value={tier2}
            onChange={(e) => setTier2(e.target.value)}
            inputMode="decimal"
          />
        </div>
      </div>
      <Button size="sm" disabled={!changed || saving} onClick={() => void save()}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
