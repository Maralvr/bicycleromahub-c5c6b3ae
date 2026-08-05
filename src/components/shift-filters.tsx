import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type ShiftFiltersValue = {
  query: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
};

export const EMPTY_FILTERS: ShiftFiltersValue = { query: "", from: "", to: "" };

export function ShiftFilters({
  value,
  onChange,
  resultCount,
  totalCount,
}: {
  value: ShiftFiltersValue;
  onChange: (v: ShiftFiltersValue) => void;
  resultCount?: number;
  totalCount?: number;
}) {
  const active = value.query || value.from || value.to;
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 p-3 rounded-lg border border-border/60 bg-card/50">
      <div className="flex-1 min-w-[220px] space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Search</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={value.query}
            onChange={(e) => onChange({ ...value, query: e.target.value })}
            placeholder="Customer, tour, meeting point, booking ID…"
            className="h-9 pl-8 text-xs"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">From</Label>
        <Input
          type="date"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="h-9 w-40 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">To</Label>
        <Input
          type="date"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="h-9 w-40 text-xs"
        />
      </div>
      {active && (
        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => onChange(EMPTY_FILTERS)}>
          <X className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      )}
      {typeof resultCount === "number" && typeof totalCount === "number" && (
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {resultCount} of {totalCount}
        </span>
      )}
    </div>
  );
}

export function matchesShiftFilter(
  s: {
    tourName?: string;
    tour_name?: string;
    date: string;
    meetingPoint?: string;
    meeting_point?: string | null;
    bookingId?: string | null;
    booking_id?: string | null;
    channelBookingRef?: string | null;
    channel_booking_ref?: string | null;
    externalBookingRef?: string | null;
    external_booking_ref?: string | null;
    rateTitle?: string | null;
    rate_title?: string | null;
    customer?: { name?: string; phone?: string; email?: string | null } | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
  },
  f: ShiftFiltersValue,
): boolean {
  if (f.from && s.date < f.from) return false;
  if (f.to && s.date > f.to) return false;
  const q = normalize(f.query);
  if (!q) return true;
  const hay = normalize(
    [
      s.tourName ?? s.tour_name ?? "",
      s.meetingPoint ?? s.meeting_point ?? "",
      s.bookingId ?? s.booking_id ?? "",
      s.channelBookingRef ?? s.channel_booking_ref ?? "",
      s.externalBookingRef ?? s.external_booking_ref ?? "",
      s.rateTitle ?? s.rate_title ?? "",
      s.customer?.name ?? s.customer_name ?? "",
      s.customer?.phone ?? s.customer_phone ?? "",
      s.customer?.email ?? s.customer_email ?? "",
    ].join(" "),
  );
  // Every whitespace-separated term must appear somewhere, so "john appia"
  // matches regardless of field order.
  return q.split(" ").every((term) => hay.includes(term));
}

/**
 * Booking refs are typed with or without the punctuation Bokun uses
 * ("BIC-T140711252" vs "bic t140711252" vs "140711252"), and names arrive
 * accented. Fold both sides to the same shape so the search bar isn't
 * silently punctuation/accent sensitive.
 */
function normalize(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
