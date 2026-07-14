import { useState } from "react";
import { useStaffStore } from "@/lib/staff-store";
import { useDispatchEvents, type DispatchEvent } from "@/lib/dispatch-events-store";
import { History, CheckCircle2, XCircle, Clock, Bell, UserMinus, ArrowRightLeft, Ban } from "lucide-react";

export type { DispatchEvent };

const EVENT_META: Record<DispatchEvent["event_type"], { label: string; icon: typeof Bell; cls: string }> = {
  dispatched: { label: "Dispatched to", icon: Bell, cls: "text-primary" },
  accepted:   { label: "Accepted by", icon: CheckCircle2, cls: "text-success" },
  rejected:   { label: "Rejected by", icon: XCircle, cls: "text-destructive" },
  expired:    { label: "Expired (no response from)", icon: Clock, cls: "text-warning-foreground" },
  cancelled:  { label: "Cancelled (was assigned to)", icon: Ban, cls: "text-muted-foreground" },
  unassigned: { label: "Unassigned from", icon: UserMinus, cls: "text-muted-foreground" },
  reassigned: { label: "Reassigned to", icon: ArrowRightLeft, cls: "text-primary" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DispatchHistory({ shiftId }: { shiftId: string }) {
  const { eventsByShiftId, loading } = useDispatchEvents();
  const events = eventsByShiftId[shiftId] ?? [];
  const { staff } = useStaffStore();
  const [open, setOpen] = useState(false);

  const nameFor = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? "Unknown" : "—");

  return (
    <details
      className="mt-4 rounded-lg border border-border/60 bg-muted/20 overflow-hidden"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-[11px] uppercase tracking-wider font-bold text-muted-foreground hover:bg-muted/40 flex items-center gap-1.5">
        <History className="h-3 w-3" />
        Dispatch history
        <span className="ml-1 normal-case tracking-normal text-muted-foreground/70 font-normal">
          ({loading ? "…" : events.length})
        </span>
      </summary>
      {open && (
        <div className="p-3 space-y-2 max-h-72 overflow-auto">
          {loading && <div className="text-xs text-muted-foreground italic">Loading…</div>}
          {!loading && events.length === 0 && (
            <div className="text-xs text-muted-foreground italic">No dispatch activity yet.</div>
          )}
          {events.map((e) => {
            const meta = EVENT_META[e.event_type];
            const Icon = meta.icon;
            const subject = e.event_type === "reassigned"
              ? `${nameFor(e.staff_id)} (was ${nameFor(e.previous_staff_id)})`
              : nameFor(e.staff_id ?? e.previous_staff_id);
            return (
              <div key={e.id} className="flex items-start gap-2 text-xs">
                <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${meta.cls}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-foreground">
                    <span className={`font-semibold ${meta.cls}`}>{meta.label}</span>{" "}
                    <span className="font-medium">{subject}</span>
                  </div>
                  {e.reason && (
                    <div className="text-muted-foreground italic mt-0.5 break-words">“{e.reason}”</div>
                  )}
                  <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">{fmt(e.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </details>
  );
}
