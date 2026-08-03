import { Badge } from "@/components/ui/badge";
import { Handshake } from "lucide-react";
import { isPartnerTour } from "@/lib/partner-tours";

export { isPartnerTour };

/** Shared accent classes for partner-operated bookings. */
export const PARTNER_ACCENT = {
  bar: "bg-partner",
  dot: "bg-partner",
  chip: "bg-partner/10 hover:bg-partner/20 border-partner/50",
  text: "text-partner",
} as const;

/** Compact "Partner" tag used on calendar chips. */
export function PartnerTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-sm bg-partner/20 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-partner ${className}`}
    >
      <Handshake className="h-2 w-2" /> Partner
    </span>
  );
}

/** Full badge used on shift cards / list rows / detail views. */
export function PartnerBadge({ className = "" }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      title="Partner-operated tour — serviced by the partner, not a Bicycle Roma guide"
      className={`shrink-0 text-[10px] gap-1 border-partner/40 bg-partner/10 text-partner ${className}`}
    >
      <Handshake className="h-2.5 w-2.5" /> Partner
    </Badge>
  );
}
