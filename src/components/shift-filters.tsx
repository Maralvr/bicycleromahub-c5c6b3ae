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
    customer?: { name?: string } | null;
    customer_name?: string | null;
  },
  f: ShiftFiltersValue,
): boolean {
  if (f.from && s.date < f.from) return false;
  if (f.to && s.date > f.to) return false;
  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    s.tourName ?? s.tour_name ?? "",
    s.meetingPoint ?? s.meeting_point ?? "",
    s.bookingId ?? s.booking_id ?? "",
    s.customer?.name ?? s.customer_name ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}
