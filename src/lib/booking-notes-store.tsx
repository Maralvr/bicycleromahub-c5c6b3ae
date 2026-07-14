import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Attachment } from "@/lib/mock-data";

export type BookingNote = {
  id: string;
  shift_id: string;
  author_profile_id: string;
  author_name: string;
  author_role: string;
  message: string;
  attachments: Attachment[];
  created_at: string;
};

type BookingNotesContextValue = {
  notesByShiftId: Record<string, BookingNote[]>;
  loading: boolean;
};

const BookingNotesContext = createContext<BookingNotesContextValue | null>(null);

// Cost fix: BookingNotesThread used to open its own realtime channel + fire
// its own query PER SHIFT ROW rendered in the Shifts list -- same N+1
// pattern as DispatchHistory (see dispatch-events-store.tsx), just without
// the collapsed-by-default UI. One shared, date-bounded fetch + one shared
// channel replaces all of that; posting/deleting a note is still a direct
// write from BookingNotesThread, this store just picks the change up via
// realtime instead of each instance re-fetching itself.
export function BookingNotesStoreProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<BookingNote[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const today = new Date();
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 60);
    const to = new Date(today);
    to.setUTCDate(to.getUTCDate() + 180);
    const isoFrom = from.toISOString().slice(0, 10);
    const isoTo = to.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("booking_notes" as never)
      .select(
        "id, shift_id, author_profile_id, author_name, author_role, message, attachments, created_at, shifts!inner(date)" as never,
      )
      .gte("shifts.date" as never, isoFrom)
      .lte("shifts.date" as never, isoTo)
      .order("created_at", { ascending: true });

    if (!error) {
      setRows((data ?? []) as unknown as BookingNote[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel(`booking-notes-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_notes" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string };
            setRows((prev) => prev.filter((r) => r.id !== old.id));
            return;
          }
          const row = payload.new as BookingNote;
          setRows((prev) => {
            const exists = prev.some((r) => r.id === row.id);
            return exists ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row];
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const notesByShiftId = useMemo(() => {
    const map: Record<string, BookingNote[]> = {};
    for (const n of rows) {
      (map[n.shift_id] = map[n.shift_id] || []).push(n);
    }
    return map;
  }, [rows]);

  return (
    <BookingNotesContext.Provider value={{ notesByShiftId, loading }}>
      {children}
    </BookingNotesContext.Provider>
  );
}

export function useBookingNotes() {
  const ctx = useContext(BookingNotesContext);
  if (!ctx) throw new Error("useBookingNotes must be used within BookingNotesStoreProvider");
  return ctx;
}
