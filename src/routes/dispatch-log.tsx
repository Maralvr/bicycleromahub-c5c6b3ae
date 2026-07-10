import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAdmin } from "@/lib/require-admin";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStaffStore } from "@/lib/staff-store";
import { useShiftsStore } from "@/lib/shifts-store";
import { History, CheckCircle2, XCircle, Clock, Bell, UserMinus, ArrowRightLeft, Ban, RefreshCw, Filter } from "lucide-react";
import type { DispatchEvent } from "@/components/dispatch-history";

export const Route = createFileRoute("/dispatch-log")({
  component: DispatchLogPage,
  head: () => ({ meta: [{ title: "Dispatch log — Bicycle Roma" }] }),
});

const EVENT_META: Record<DispatchEvent["event_type"], { label: string; icon: typeof Bell; cls: string }> = {
  dispatched: { label: "Dispatched",  icon: Bell,          cls: "text-primary" },
  accepted:   { label: "Accepted",    icon: CheckCircle2,  cls: "text-success" },
  rejected:   { label: "Rejected",    icon: XCircle,       cls: "text-destructive" },
  expired:    { label: "Expired",     icon: Clock,         cls: "text-warning-foreground" },
  cancelled:  { label: "Cancelled",   icon: Ban,           cls: "text-muted-foreground" },
  unassigned: { label: "Unassigned",  icon: UserMinus,     cls: "text-muted-foreground" },
  reassigned: { label: "Reassigned",  icon: ArrowRightLeft, cls: "text-primary" },
};

type Filter = "all" | DispatchEvent["event_type"];

function DispatchLogPage() {
  const { ready } = useRequireAdmin();
  const { staff } = useStaffStore();
  const { shifts } = useShiftsStore();
  const [events, setEvents] = useState<DispatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("shift_dispatch_events" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setEvents((data as unknown as DispatchEvent[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!ready) return;
    void load();
    const channel = supabase
      .channel(`dispatch-events-global-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "shift_dispatch_events" }, (payload) => {
        const e = payload.new as DispatchEvent;
        setEvents((prev) => (prev.some((p) => p.id === e.id) ? prev : [e, ...prev].slice(0, 500)));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [ready]);

  const filtered = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.event_type === filter)),
    [events, filter],
  );

  const nameFor = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? "Unknown" : "—");
  const shiftFor = (id: string) => shifts.find((s) => s.id === id);

  if (!ready) return null;

  const filterOptions: { v: Filter; label: string }[] = [
    { v: "all", label: "All" },
    { v: "dispatched", label: "Dispatched" },
    { v: "accepted", label: "Accepted" },
    { v: "rejected", label: "Rejected" },
    { v: "expired", label: "Expired" },
    { v: "cancelled", label: "Cancelled" },
    { v: "reassigned", label: "Reassigned" },
    { v: "unassigned", label: "Unassigned" },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Dispatch log"
        subtitle="Every assignment, accept, reject, expiry, and reassign — newest first."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
        {filterOptions.map((opt) => (
          <button
            key={opt.v}
            onClick={() => setFilter(opt.v)}
            className={`h-7 px-2.5 text-xs font-medium rounded-md transition-colors ${
              filter === opt.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <Card className="divide-y divide-border/60">
        {loading && <div className="p-8 text-sm text-muted-foreground text-center">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-8 text-sm text-muted-foreground text-center">
            <History className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No dispatch events {filter !== "all" && `of type "${filter}"`} yet.
          </div>
        )}
        {filtered.map((e) => {
          const meta = EVENT_META[e.event_type];
          const Icon = meta.icon;
          const sh = shiftFor(e.shift_id);
          const subject = e.event_type === "reassigned"
            ? `${nameFor(e.staff_id)} (was ${nameFor(e.previous_staff_id)})`
            : nameFor(e.staff_id ?? e.previous_staff_id);
          return (
            <div key={e.id} className="p-3 flex items-start gap-3 hover:bg-muted/30">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.cls}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className={`font-semibold ${meta.cls}`}>{meta.label}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-medium">{subject}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {sh ? (
                    <Link to="/shifts" search={{ tab: "all" as const }} className="hover:underline">
                      {sh.tourName} · {sh.date} {sh.startTime}
                    </Link>
                  ) : (
                    <span className="italic">Shift not loaded</span>
                  )}
                </div>
                {e.reason && (
                  <div className="text-xs text-foreground/70 italic mt-1 break-words">“{e.reason}”</div>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                {new Date(e.created_at).toLocaleString()}
              </div>
            </div>
          );
        })}
      </Card>
    </AppShell>
  );
}
