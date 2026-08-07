import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { onShiftChange } from "./shifts-broadcast";
import { toast } from "sonner";
import { guideConflictMessage } from "./guide-conflicts";
import type { Shift } from "./mock-data";


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
  bokun_rate_id?: string | null;
  seller: string | null;
  booking_channel: string | null;
  bokun_product_id?: string | null;
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
  cancelled_at?: string | null;
};

// Columns loaded for every shift in the visible date range. Deliberately excludes
// the heavy detail columns below to keep egress low on the calendar/list views.
const SHIFT_LIST_COLUMNS =
  "id, source, booking_id, channel_booking_ref, external_booking_ref, tour_name, date, start_time, end_time, meeting_point, customer_name, customer_phone, adults, teens, infants, trailers, rate, rate_title, bokun_rate_id, bokun_product_id, seller, booking_channel, notes, assigned_staff_id, status, required_tags, rental_point_id, pending_expires_at, rejection_reason, rejected_by_staff_ids, no_show, no_show_reported_at, no_show_reported_by, cancelled_at";

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
    bokunProductId: r.bokun_product_id ?? null,
    bokunRateId: r.bokun_rate_id ?? null,
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
  const detailsLoaded = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRangeState] = useState<ShiftsDateRange>(() => defaultShiftsDateRange());

  // Widest date window already downloaded. Used so that widening the range only
  // fetches the missing slice instead of re-downloading everything.
  const loadedRange = useRef<ShiftsDateRange | null>(null);

  const shiftDay = (d: string, days: number) => {
    const dt = new Date(`${d}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  };

  const fetchSlice = useCallback(async (from: string, to: string) => {
    const pageSize = 1000;
    const all: ShiftRow[] = [];
    let offset = 0;
    while (true) {
      const { data, error: err } = await supabase
        .from("shifts")
        .select(SHIFT_LIST_COLUMNS)
        .is("cancelled_at", null)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (err) throw new Error(err.message);
      const batch = (data ?? []) as unknown as ShiftRow[];
      all.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }, []);

  const fetchAll = useCallback(
    async (range: ShiftsDateRange = dateRange, opts?: { force?: boolean }) => {
      const loaded = loadedRange.current;
      // Which windows still need to be downloaded?
      const gaps: Array<[string, string]> = [];
      const full = opts?.force || !loaded;
      if (full) {
        gaps.push([range.from, range.to]);
      } else {
        if (range.from < loaded!.from) gaps.push([range.from, shiftDay(loaded!.from, -1)]);
        if (range.to > loaded!.to) gaps.push([shiftDay(loaded!.to, 1), range.to]);
      }
      if (gaps.length === 0) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const batches = await Promise.all(gaps.map(([f, t]) => fetchSlice(f, t)));
        const fetched = batches.flat();
        if (full) {
          detailsLoaded.current.clear();
          setRows(fetched);
          loadedRange.current = { from: range.from, to: range.to };
        } else {
          setRows((prev) => {
            const byId = new Map(prev.map((r) => [r.id, r]));
            fetched.forEach((r) => byId.set(r.id, { ...byId.get(r.id), ...r }));
            return Array.from(byId.values());
          });
          loadedRange.current = {
            from: range.from < loaded!.from ? range.from : loaded!.from,
            to: range.to > loaded!.to ? range.to : loaded!.to,
          };
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load shifts");
      } finally {
        setLoading(false);
      }
    },
    [dateRange, fetchSlice],
  );

  const loadShiftDetails = useCallback(async (ids: string[]) => {
    const pending = ids.filter((id) => id && !detailsLoaded.current.has(id));
    if (pending.length === 0) return;
    pending.forEach((id) => detailsLoaded.current.add(id));
    const { data, error: err } = await supabase
      .from("shifts")
      .select(SHIFT_DETAIL_COLUMNS)
      .in("id", pending);
    if (err) {
      pending.forEach((id) => detailsLoaded.current.delete(id));
      return;
    }
    const byId = new Map(
      ((data ?? []) as unknown as Array<Partial<ShiftRow> & { id: string }>).map((d) => [d.id, d]),
    );
    setRows((prev) =>
      prev.map((r) => {
        const detail = byId.get(r.id);
        return detail ? { ...r, ...detail } : r;
      }),
    );
  }, []);

  const setDateRange = useCallback((range: ShiftsDateRange) => {
    setDateRangeState(range);
  }, []);

  // Keep the current window in a ref so the realtime subscription can be created
  // once instead of being torn down and re-subscribed on every range change.
  const dateRangeRef = useRef(dateRange);
  dateRangeRef.current = dateRange;
  const isWithinRange = useCallback(
    (d: string | null | undefined) =>
      !!d && d >= dateRangeRef.current.from && d <= dateRangeRef.current.to,
    [],
  );

  useEffect(() => {
    void fetchAll(dateRange);
  }, [dateRange, fetchAll]);

  // Live updates go through the "Broadcast from Database" channel
  // (trigger public.broadcast_shift_change), NOT postgres_changes.
  // postgres_changes streams the entire row off the replication stream: RLS
  // decides *whether* a change is delivered, never which columns ride along,
  // so every live INSERT/UPDATE put the real `rate` (what the customer paid)
  // on the socket of whoever was subscribed -- guides included, who must
  // never see it. The broadcast payload is only { id, event_type }, and we
  // re-read the affected row through the normal RLS-checked query below.
  useEffect(() => {
    const applyRow = async (id: string) => {
      const { data, error: err } = await supabase
        .from("shifts")
        .select(SHIFT_LIST_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      // Not visible to this user (RLS) or gone: treat as a removal.
      if (err || !data) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        return;
      }
      const row = data as unknown as ShiftRow;
      setRows((prev) => {
        const exists = prev.some((r) => r.id === row.id);
        // Out of the loaded window, or soft-cancelled: drop from the calendar.
        if (!isWithinRange(row.date) || row.cancelled_at) {
          return exists ? prev.filter((r) => r.id !== row.id) : prev;
        }
        if (!exists) return [...prev, row];
        return prev.map((r) => (r.id === row.id ? { ...r, ...row } : r));
      });
    };

    return onShiftChange((payload) => {
      const id = payload?.id;
      if (!id) return;
      if (payload?.event_type === "delete") {
        setRows((prev) => prev.filter((r) => r.id !== id));
        return;
      }
      void applyRow(id);
    });

  }, [isWithinRange]);




  const shifts = useMemo<Shift[]>(
    () =>
      rows
        .filter((r) => !r.rental_point_id)
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

  // Fire-and-forget email notification. Server-side it is admin-gated, so a
  // non-admin caller simply gets a rejected promise we swallow here.
  const notifyByEmail = (shiftId: string, staffId: string | null | undefined, kind: ShiftEmailKind) => {
    if (!staffId) return;
    void notifyGuideShiftChange({ data: { shiftId, staffId, kind } }).catch(() => {});
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
      const conflict = guideConflictMessage(err);
      if (conflict) {
        toast.error("Guide already booked", { description: conflict });
      }
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
      return;
    }

    // Email the guide whenever the assignment itself changed.
    if (patch.assignedStaffId !== undefined) {
      const before = prevRow?.assigned_staff_id ?? null;
      const after = patch.assignedStaffId ?? null;
      if (before !== after) {
        if (before) notifyByEmail(id, before, "unassigned");
        if (after) notifyByEmail(id, after, "assigned");
      }
    }
  };

  const deleteShift: ShiftsStoreContextValue["deleteShift"] = async (id) => {
    const prevRows = rows;
    const row = rows.find((r) => r.id === id);
    const assigned = row?.assigned_staff_id ?? null;
    setRows((prev) => prev.filter((r) => r.id !== id));
    // Notify before a hard delete — the row (and its details) is gone after.
    const hardDelete = row?.source !== "bokun";
    if (hardDelete) notifyByEmail(id, assigned, "deleted");
    // Bokun-sourced bookings are soft-cancelled so rental staff and payout
    // history still see a "Cancelled" record instead of a silent disappearance.
    // Manually created shifts are still hard-deleted.
    const { error: err } = !hardDelete
      ? await supabase
          .from("shifts")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ cancelled_at: new Date().toISOString() } as any)
          .eq("id", id)
      : await supabase.from("shifts").delete().eq("id", id);
    if (err) {
      setError(err.message);
      setRows(prevRows);
      return;
    }
    if (!hardDelete) notifyByEmail(id, assigned, "cancelled");
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
        refresh: () => fetchAll(dateRange, { force: true }),
        addShift,
        updateShift,
        deleteShift,
        setStatus,
        assignShift,
        loadShiftDetails,
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
