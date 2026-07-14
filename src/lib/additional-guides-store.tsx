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

export type AdditionalGuideStatus = "pending" | "accepted" | "rejected";

export type AdditionalGuideAssignment = {
  id: string;
  shiftId: string;
  staffId: string;
  status: AdditionalGuideStatus;
  rejectionReason: string | null;
  createdAt: string;
  respondedAt: string | null;
};

type Row = {
  id: string;
  shift_id: string;
  staff_id: string;
  status: AdditionalGuideStatus;
  rejection_reason: string | null;
  created_at: string;
  responded_at: string | null;
};

function rowToAssignment(r: Row): AdditionalGuideAssignment {
  return {
    id: r.id,
    shiftId: r.shift_id,
    staffId: r.staff_id,
    status: r.status,
    rejectionReason: r.rejection_reason,
    createdAt: r.created_at,
    respondedAt: r.responded_at,
  };
}

type AdditionalGuidesContextValue = {
  assignments: AdditionalGuideAssignment[];
  byShiftId: Record<string, AdditionalGuideAssignment[]>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addGuide: (shiftId: string, staffId: string) => Promise<void>;
  removeGuide: (assignmentId: string) => Promise<void>;
  acceptGuide: (shiftId: string) => Promise<void>;
  rejectGuide: (shiftId: string, reason?: string) => Promise<void>;
};

const AdditionalGuidesContext = createContext<AdditionalGuidesContextValue | null>(null);

export function AdditionalGuidesStoreProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    // Same -60/+180 day window as live-shifts.ts -- this table is small
    // (only bookings that actually have a 2nd/3rd guide, which is "some"
    // bookings per the feature request, not most), but we still bound it
    // by date rather than fetching unbounded history, consistent with the
    // cost fixes already applied to every other shifts-adjacent query in
    // this project.
    const today = new Date();
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 60);
    const to = new Date(today);
    to.setUTCDate(to.getUTCDate() + 180);
    const isoFrom = from.toISOString().slice(0, 10);
    const isoTo = to.toISOString().slice(0, 10);

    const { data, error: err } = await supabase
      .from("shift_additional_guides" as never)
      .select("id, shift_id, staff_id, status, rejection_reason, created_at, responded_at, shifts!inner(date)" as never)
      .gte("shifts.date" as never, isoFrom)
      .lte("shifts.date" as never, isoTo);

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setRows(((data ?? []) as unknown) as Row[]);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel(`shift-additional-guides-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_additional_guides" },
        () => {
          // Small table, simplest-correct approach: just refetch rather
          // than hand-reconcile insert/update/delete against the date-
          // joined query above.
          void fetchAll();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const assignments = useMemo(() => rows.map(rowToAssignment), [rows]);

  const byShiftId = useMemo(() => {
    const map: Record<string, AdditionalGuideAssignment[]> = {};
    for (const a of assignments) {
      (map[a.shiftId] = map[a.shiftId] || []).push(a);
    }
    return map;
  }, [assignments]);

  const addGuide = useCallback(async (shiftId: string, staffId: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("shift_additional_guides" as never).insert({
      shift_id: shiftId,
      staff_id: staffId,
      status: "pending",
      assigned_by: userData?.user?.id ?? null,
    } as never);
    if (err) throw new Error(err.message);
    await fetchAll();
  }, [fetchAll]);

  const removeGuide = useCallback(async (assignmentId: string) => {
    const { error: err } = await supabase
      .from("shift_additional_guides" as never)
      .delete()
      .eq("id", assignmentId);
    if (err) throw new Error(err.message);
    await fetchAll();
  }, [fetchAll]);

  const acceptGuide = useCallback(async (shiftId: string) => {
    const { error: err } = await supabase.rpc(
      "accept_additional_guide_assignment" as never,
      { _shift_id: shiftId } as never,
    );
    if (err) throw new Error(err.message);
    await fetchAll();
  }, [fetchAll]);

  const rejectGuide = useCallback(async (shiftId: string, reason?: string) => {
    const { error: err } = await supabase.rpc(
      "reject_additional_guide_assignment" as never,
      { _shift_id: shiftId, _reason: reason ?? null } as never,
    );
    if (err) throw new Error(err.message);
    await fetchAll();
  }, [fetchAll]);

  return (
    <AdditionalGuidesContext.Provider
      value={{
        assignments,
        byShiftId,
        loading,
        error,
        refresh: fetchAll,
        addGuide,
        removeGuide,
        acceptGuide,
        rejectGuide,
      }}
    >
      {children}
    </AdditionalGuidesContext.Provider>
  );
}

export function useAdditionalGuides() {
  const ctx = useContext(AdditionalGuidesContext);
  if (!ctx) throw new Error("useAdditionalGuides must be used within AdditionalGuidesStoreProvider");
  return ctx;
}
