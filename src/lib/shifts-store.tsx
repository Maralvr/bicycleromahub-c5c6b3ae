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
import type { Shift } from "./mock-data";
import { isExcludedTourName } from "./excluded-bokun-products";

type ShiftRow = {
  id: string;
  source: Shift["source"];
  booking_id: string | null;
  channel_booking_ref: string | null;
  external_booking_ref: string | null;
  tour_name: string;
  date: string;
  start_time: string;
  end_time: string;
  meeting_point: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email?: string | null;
  adults: number;
  teens: number;
  infants: number;
  trailers: number;
  // Heavy / detail-only fields: not fetched in the list query, filled in on demand.
  participants?: { name: string; category: string }[] | null;
  rate: number | string | null;
  rate_title: string | null;
  seller: string | null;
  booking_channel: string | null;
  notes: string | null;
  operations_notes?: string | null;
  assigned_staff_id: string | null;
  status: Shift["status"];
  required_tags: string[] | null;
  rental_point_id: string | null;
  pending_expires_at: string | null;
  rejection_reason: string | null;
  rejected_by_staff_ids: string[] | null;
  no_show: boolean | null;
  no_show_reported_at: string | null;
  no_show_reported_by: string | null;
  no_show_notes?: string | null;
};

// Columns loaded for every shift in the visible date range. Deliberately excludes
// the heavy detail columns below to keep egress low on the calendar/list views.
const SHIFT_LIST_COLUMNS =
  "id, source, booking_id, channel_booking_ref, external_booking_ref, tour_name, date, start_time, end_time, meeting_point, customer_name, customer_phone, adults, teens, infants, trailers, rate, rate_title, seller, booking_channel, notes, assigned_staff_id, status, required_tags, rental_point_id, pending_expires_at, rejection_reason, rejected_by_staff_ids, no_show, no_show_reported_at, no_show_reported_by";

// Fetched lazily when a single shift is opened.
const SHIFT_DETAIL_COLUMNS = "id, customer_email, participants, operations_notes, no_show_notes";


type NewShiftInput = Omit<Shift, "id" | "guideNotes">;
type ShiftPatch = Partial<NewShiftInput>;

export type ShiftsDateRange = { from: string; to: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function defaultShiftsDateRange(): ShiftsDateRange {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  to.setUTCDate(to.getUTCDate() + 30);
  return { from: isoDate(from), to: isoDate(to) };
}

type ShiftsStoreContextValue = {
  shifts: Shift[];
  loading: boolean;
  error: string | null;
  dateRange: ShiftsDateRange;
  setDateRange: (range: ShiftsDateRange) => void;
  refresh: () => Promise<void>;
  addShift: (input: NewShiftInput) => Promise<Shift | null>;
  updateShift: (id: string, patch: ShiftPatch) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;
  setStatus: (id: string, status: Shift["status"]) => Promise<void>;
  assignShift: (id: string, assignedStaffId: string | null) => Promise<void>;
  /** Lazily fetch the heavy detail columns (participant list, ops notes, email) for specific shifts. */
  loadShiftDetails: (ids: string[]) => Promise<void>;
};

const ShiftsStoreContext = createContext<ShiftsStoreContextValue | null>(null);

function rowToShift(r: ShiftRow): Shift {
  return {
    id: r.id,
    source: r.source,
    bookingId: r.booking_id ?? undefined,
    channelBookingRef: r.channel_booking_ref,
    externalBookingRef: r.external_booking_ref,
    tourName: r.tour_name,
    date: r.date,
    startTime: r.start_time.slice(0, 5),
    endTime: r.end_time.slice(0, 5),
    meetingPoint: r.meeting_point,
    customer:
      r.customer_name || r.customer_phone || r.customer_email
        ? { name: r.customer_name ?? "—", phone: r.customer_phone ?? "—", email: r.customer_email }
        : undefined,
    participants: {
      adults: r.adults,
      teens: r.teens,
      infants: r.infants,
      trailers: r.trailers,
    },
    participantList: r.participants ?? undefined,
    rate: r.rate != null ? Number(r.rate) : undefined,
    rateTitle: r.rate_title,
    seller: r.seller,
    bookingChannel: r.booking_channel,
    notes: r.notes ?? undefined,
    operationsNotes: r.operations_notes ?? null,
    assignedStaffId: r.assigned_staff_id,
    status: r.status,
    requiredTags: r.required_tags ?? [],
    pendingExpiresAt: r.pending_expires_at,
    rejectionReason: r.rejection_reason,
    rejectedByStaffIds: r.rejected_by_staff_ids ?? [],
    noShow: r.no_show ?? false,
    noShowReportedAt: r.no_show_reported_at,
    noShowReportedBy: r.no_show_reported_by,
    noShowNotes: r.no_show_notes ?? null,
  };
}

function shiftToDbPatch(input: ShiftPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.source !== undefined) out.source = input.source;
  if (input.bookingId !== undefined) out.booking_id = input.bookingId ?? null;
  if (input.tourName !== undefined) out.tour_name = input.tourName;
  if (input.date !== undefined) out.date = input.date;
  if (input.startTime !== undefined) out.start_time = `${input.startTime}:00`;
  if (input.endTime !== undefined) out.end_time = `${input.endTime}:00`;
  if (input.meetingPoint !== undefined) out.meeting_point = input.meetingPoint;
  if (input.customer !== undefined) {
    out.customer_name = input.customer?.name ?? null;
    out.customer_phone = input.customer?.phone ?? null;
  }
  if (input.participants !== undefined) {
    out.adults = input.participants?.adults ?? 0;
    out.teens = input.participants?.teens ?? 0;
    out.infants = input.participants?.infants ?? 0;
    out.trailers = input.participants?.trailers ?? 0;
  }
  if (input.rate !== undefined) out.rate = input.rate ?? null;
  if (input.rateTitle !== undefined) out.rate_title = input.rateTitle ?? null;
  if (input.notes !== undefined) out.notes = input.notes ?? null;
  if (input.assignedStaffId !== undefined) out.assigned_staff_id = input.assignedStaffId;
  if (input.status !== undefined) out.status = input.status;
  if (input.requiredTags !== undefined) out.required_tags = input.requiredTags ?? [];
  return out;
}

export function ShiftsStoreProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRangeState] = useState<ShiftsDateRange>(() => defaultShiftsDateRange());

  const fetchAll = useCallback(async (range: ShiftsDateRange = dateRange) => {
    setLoading(true);
    const pageSize = 1000;
    const all: ShiftRow[] = [];
    let from = 0;
    while (true) {
      const { data, error: err } = await supabase
        .from("shifts")
        .select(
          SHIFT_LIST_COLUMNS,
        )
        .gte("date", range.from)
        .lte("date", range.to)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const batch = (data ?? []) as unknown as ShiftRow[];
      all.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    setRows(all);
    setError(null);
    setLoading(false);
  }, [dateRange]);

  const setDateRange = useCallback((range: ShiftsDateRange) => {
    setDateRangeState(range);
  }, []);

  const isWithinRange = useCallback(
    (d: string | null | undefined) => !!d && d >= dateRange.from && d <= dateRange.to,
    [dateRange],
  );

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel(`shifts-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, (payload) => {
        const newRow = payload.new as ShiftRow | null;
        const oldRow = payload.old as { id?: string } | null;
        if (payload.eventType === "INSERT" && newRow) {
          if (!isWithinRange(newRow.date)) return;
          setRows((prev) => (prev.some((r) => r.id === newRow.id) ? prev : [...prev, newRow]));
        } else if (payload.eventType === "UPDATE" && newRow) {
          setRows((prev) => {
            const exists = prev.some((r) => r.id === newRow.id);
            if (!isWithinRange(newRow.date)) {
              return exists ? prev.filter((r) => r.id !== newRow.id) : prev;
            }
            if (!exists) return [...prev, newRow];
            return prev.map((r) => (r.id === newRow.id ? { ...r, ...newRow } : r));
          });
        } else if (payload.eventType === "DELETE" && oldRow?.id) {
          setRows((prev) => prev.filter((r) => r.id !== oldRow.id));
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll, isWithinRange]);

  const shifts = useMemo<Shift[]>(
    () =>
      rows
        .filter((r) => !isExcludedTourName(r.tour_name) && !r.rental_point_id)
        .map(rowToShift),
    [rows],
  );

  const addShift: ShiftsStoreContextValue["addShift"] = async (input) => {
    const payload = shiftToDbPatch(input);
    const { data, error: err } = await supabase
      .from("shifts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(payload as any)
      .select()
      .single();
    if (err) {
      setError(err.message);
      return null;
    }
    const inserted = data as unknown as ShiftRow;
    setRows((prev) => (prev.some((r) => r.id === inserted.id) ? prev : [...prev, inserted]));
    return rowToShift(inserted);
  };

  const updateShift: ShiftsStoreContextValue["updateShift"] = async (id, patch) => {
    const dbPatch = shiftToDbPatch(patch);
    const prevRow = rows.find((r) => r.id === id);
    // Optimistic local update — realtime will reconcile authoritative values.
    setRows((prev) =>
      prev.map((r) => (r.id === id ? ({ ...r, ...(dbPatch as Partial<ShiftRow>) }) : r)),
    );
    const { error: err } = await supabase
      .from("shifts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(dbPatch as any)
      .eq("id", id);
    if (err) {
      setError(err.message);
      // Roll back just this row by refetching it from the server.
      const { data: fresh } = await supabase
        .from("shifts")
        .select(
          SHIFT_LIST_COLUMNS,
        )
        .eq("id", id)
        .maybeSingle();
      const authoritative = (fresh as ShiftRow | null) ?? prevRow ?? null;
      if (authoritative) {
        setRows((prev) => prev.map((r) => (r.id === id ? authoritative : r)));
      }
    }
  };

  const deleteShift: ShiftsStoreContextValue["deleteShift"] = async (id) => {
    const prevRows = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    const { error: err } = await supabase.from("shifts").delete().eq("id", id);
    if (err) {
      setError(err.message);
      setRows(prevRows);
    }
  };

  const setStatus: ShiftsStoreContextValue["setStatus"] = async (id, status) => {
    await updateShift(id, { status });
  };

  const assignShift: ShiftsStoreContextValue["assignShift"] = async (id, assignedStaffId) => {
    await updateShift(id, {
      assignedStaffId,
      status: assignedStaffId ? "pending" : "unassigned",
    });
  };

  return (
    <ShiftsStoreContext.Provider
      value={{
        shifts,
        loading,
        error,
        dateRange,
        setDateRange,
        refresh: () => fetchAll(),
        addShift,
        updateShift,
        deleteShift,
        setStatus,
        assignShift,
      }}
    >
      {children}
    </ShiftsStoreContext.Provider>
  );
}

export function useShiftsStore() {
  const ctx = useContext(ShiftsStoreContext);
  if (!ctx) throw new Error("useShiftsStore must be used within ShiftsStoreProvider");
  return ctx;
}
