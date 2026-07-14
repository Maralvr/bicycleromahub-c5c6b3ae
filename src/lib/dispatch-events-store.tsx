import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";

export type DispatchEvent = {
  id: string;
  shift_id: string;
  event_type:
    | "dispatched"
    | "accepted"
    | "rejected"
    | "expired"
    | "cancelled"
    | "unassigned"
    | "reassigned";
  staff_id: string | null;
  previous_staff_id: string | null;
  actor_profile_id: string | null;
  reason: string | null;
  created_at: string;
};

type DispatchEventsContextValue = {
  eventsByShiftId: Record<string, DispatchEvent[]>;
  loading: boolean;
};

const DispatchEventsContext = createContext<DispatchEventsContextValue | null>(null);

// Cost fix: DispatchHistory used to open its own realtime channel + fire its
// own query PER SHIFT ROW rendered in the Shifts list -- with no
// pagination, that meant every booking in the current date window (easily
// 100-200+) opened its own WebSocket subscription and its own query, all
// unconditionally on mount, even though the UI it feeds starts collapsed.
// One shared, date-bounded fetch + one shared channel replaces all of that.
export function DispatchEventsStoreProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<DispatchEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    // Same -60/+180 day window used elsewhere for operationally-relevant
    // shift-adjacent data (live-shifts.ts, additional-guides-store.tsx).
    const today = new Date();
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 60);
    const to = new Date(today);
    to.setUTCDate(to.getUTCDate() + 180);
    const isoFrom = from.toISOString().slice(0, 10);
    const isoTo = to.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("shift_dispatch_events" as never)
      .select(
        "id, shift_id, event_type, staff_id, previous_staff_id, actor_profile_id, reason, created_at, shifts!inner(date)" as never,
      )
      .gte("shifts.date" as never, isoFrom)
      .lte("shifts.date" as never, isoTo)
      .order("created_at", { ascending: false });

    if (!error) {
      setRows((data ?? []) as unknown as DispatchEvent[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel(`dispatch-events-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shift_dispatch_events" },
        (payload) => {
          const e = payload.new as DispatchEvent;
          setRows((prev) => (prev.some((p) => p.id === e.id) ? prev : [e, ...prev]));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const eventsByShiftId = useMemo(() => {
    const map: Record<string, DispatchEvent[]> = {};
    for (const e of rows) {
      (map[e.shift_id] = map[e.shift_id] || []).push(e);
    }
    return map;
  }, [rows]);

  return (
    <DispatchEventsContext.Provider value={{ eventsByShiftId, loading }}>
      {children}
    </DispatchEventsContext.Provider>
  );
}

export function useDispatchEvents() {
  const ctx = useContext(DispatchEventsContext);
  if (!ctx) throw new Error("useDispatchEvents must be used within DispatchEventsStoreProvider");
  return ctx;
}
