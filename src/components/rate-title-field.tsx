import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PUBLIC_TOUR_LANGUAGES } from "@/lib/tour-languages";
import { useProductRates, useInvalidateProductRates } from "@/lib/bokun-product-rates";
import { refreshBokunProductRatesFn } from "@/lib/bokun-product-rates.functions";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const CUSTOM = "__custom__";

type Props = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  /** Bokun product id of the booking, when it has one. */
  bokunProductId?: string | null;
  /** Bokun rate id of the booked option — locale-stable, matched before title. */
  bokunRateId?: string | null;
};

/**
 * Admin override for a booking's Bokun rate ("Tour language / rate name").
 *
 * When the shift has a Bokun product id we show that product's REAL rate list
 * (synced nightly from Bokun's Activity API in canonical English) — for a tour
 * that's "Public/Private tour in English/Italian/…", for a rental product it's
 * "Mtb Electric 1-hour", "City Bike 4-hour", etc.
 *
 * Shifts with no product id (manual shifts, legacy rows) keep the fixed
 * PUBLIC_TOUR_LANGUAGES list. Both modes offer an explicit "Custom…" escape
 * hatch, and the current value is always preserved as a selectable option so
 * legacy labels are never silently dropped.
 */
export function RateTitleField({ id, value, onChange, className, bokunProductId, bokunRateId }: Props) {
  const v = (value ?? "").trim();
  const { isAdmin } = useAuth();
  const { data: product, isLoading } = useProductRates(bokunProductId);
  const invalidateRates = useInvalidateProductRates();
  const [custom, setCustom] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const canonical = product
    ? product.rates.map((r) => r.title)
    : (PUBLIC_TOUR_LANGUAGES as readonly string[]).slice();

  // Match by rate id first: Bokun stores a booking's rate_title in the
  // language the booking was made in ("Mtb elettrica 2 ore"), while the cached
  // list is canonical English ("Mtb Electric 2-hour"). The id is locale-stable,
  // so when it resolves we show that option as the selected one instead of
  // dropping the value into free-text mode.
  const byId = bokunRateId
    ? product?.rates.find((r) => String(r.id) === String(bokunRateId))?.title ?? null
    : null;
  const selected = (byId ?? v).trim();

  const options = Array.from(new Set<string>([...canonical, ...(selected ? [selected] : [])]));
  const inList = selected.length > 0 && options.includes(selected);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await refreshBokunProductRatesFn();
      await invalidateRates();
      toast.success(`Rates refreshed`, {
        description: `${res.synced}/${res.total} products, ${res.rateCount} rate options.`,
      });
    } catch (e) {
      toast.error("Refresh failed", { description: (e as Error).message });
    } finally {
      setRefreshing(false);
    }
  };

  if (custom || (selected.length > 0 && !inList)) {
    // Free-text mode: explicit escape hatch, or a legacy value we keep editable.
    return (
      <div className="flex gap-1.5">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Private tour"
          className={className}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-9 px-2 text-xs shrink-0"
          onClick={() => setCustom(false)}
        >
          Use list
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <Select
        value={inList ? selected : ""}
        onValueChange={(val) => {
          if (val === CUSTOM) {
            setCustom(true);
            return;
          }
          onChange(val);
        }}
      >
        <SelectTrigger id={id} className={className}>
          <SelectValue placeholder={isLoading ? "Loading rates…" : "Select rate"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom…</SelectItem>
        </SelectContent>
      </Select>
      {isAdmin && bokunProductId ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-9 w-9 p-0 shrink-0"
          title="Refresh rate options from Bokun"
          disabled={refreshing}
          onClick={refresh}
        >
          <RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        </Button>
      ) : null}
    </div>
  );
}
