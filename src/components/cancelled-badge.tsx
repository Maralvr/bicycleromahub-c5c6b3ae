import { Badge } from "@/components/ui/badge";
import { Ban } from "lucide-react";

/**
 * Cancelled bookings are soft-deleted (shifts.cancelled_at) instead of removed,
 * so they stay visible for a bounded window with an explicit marker rather than
 * silently disappearing from a calendar or list.
 */

/** Compact "Cancelled" tag used on calendar chips. */
export function CancelledTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-sm bg-destructive/20 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-destructive ${className}`}
    >
      <Ban className="h-2 w-2" /> Cancelled
    </span>
  );
}

/** Full badge used on shift cards / list rows / detail views. */
export function CancelledBadge({
  reason,
  className = "",
}: {
  reason?: string | null;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      title={reason ? `Cancelled — ${reason}` : "Cancelled booking"}
      className={`shrink-0 text-[10px] gap-1 border-destructive/40 bg-destructive/10 text-destructive ${className}`}
    >
      <Ban className="h-2.5 w-2.5" /> Cancelled
    </Badge>
  );
}
