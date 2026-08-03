import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { isPrivateTour } from "@/lib/tour-languages";

export { isPrivateTour };

/** Shared accent classes for private (exclusive) bookings. */
export const PRIVATE_ACCENT = {
  bar: "bg-private",
  dot: "bg-private",
  chip: "bg-private/10 hover:bg-private/20 border-private/50",
  text: "text-private",
} as const;

/** Compact "Private" tag used on calendar chips. */
export function PrivateTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-sm bg-private/20 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-private ${className}`}
    >
      <Lock className="h-2 w-2" /> Private
    </span>
  );
}

/** Full badge used on shift cards / list rows / detail views. */
export function PrivateBadge({ className = "" }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      title="Private tour — booked exclusively, not a shared departure"
      className={`shrink-0 text-[10px] gap-1 border-private/40 bg-private/10 text-private ${className}`}
    >
      <Lock className="h-2.5 w-2.5" /> Private
    </Badge>
  );
}
