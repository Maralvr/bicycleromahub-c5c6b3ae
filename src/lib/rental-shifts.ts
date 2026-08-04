import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { onShiftChange } from "./shifts-broadcast";
import type { Shift } from "./mock-data";

type Row = {
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
  customer_email: string | null;
  adults: number;
  teens: number;
  infants: number;
  trailers: number;
  participants: { name: string; category: string }[] | null;
  rate: number | string | null;
  rate_title: string | null;
  seller: string | null;
  booking_channel: string | null;
  notes: string | null;
  operations_notes: string | null;
  assigned_staff_id: string | null;
  status: Shift["status"];
  required_tags: string[] | null;
  rental_point_id: string | null;
  no_show: boolean | null;
  no_show_reported_at: string | null;
  no_show_notes: string | null;
  cancelled_at?: string | null;
  cancelled_reason?: string | null;
};

function rowToShift(r: Row): Shift & { rentalPointId: string | null } {
  return {
    id: r.id,
    source: r.source,
    bookingId: r.booking_id ?? undefined,
    channelBookingRef: r.channel_booking_ref,
    externalBookingRef: r.external_booking_ref,
    tourName: r.tour_name,
    date: r.date,
    startTime: (r.start_time ?? "").slice(0, 5),
    endTime: (r.end_time ?? "").slice(0, 5),
    meetingPoint: r.meeting_point ?? "",
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
    participantList: r.participants ?? [],
    rate: r.rate != null ? Number(r.rate) : undefined,
    rateTitle: r.rate_title,
    seller: r.seller,
    bookingChannel: r.booking_channel,
    notes: r.notes ?? undefined,
    operationsNotes: r.operations_notes,
    assignedStaffId: r.assigned_staff_id,
    status: r.status,
    requiredTags: r.required_tags ?? [],
    rentalPointId: r.rental_point_id,
    noShow: r.no_show ?? false,
    noShowReportedAt: r.no_show_reported_at,
    noShowNotes: r.no_show_notes,
    cancelledAt: r.cancelled_at ?? null,
    cancelledReason: r.cancelled_reason ?? null,
  };
}

export type RentalShift = ReturnType<typeof rowToShift>;

const RENTAL_SHIFT_COLUMNS =
  "id, source, booking_id, channel_booking_ref, external_booking_ref, tour_name, date, start_time, end_time, meeting_point, customer_name, customer_phone, customer_email, adults, teens, infants, trailers, participants, rate, rate_title, seller, booking_channel, notes, operations_notes, assigned_staff_id, status, required_tags, rental_point_id, no_show, no_show_reported_at, no_show_notes, cancelled_at, cancelled_reason";

function rentalWindow() {
  const today = new Date();
  return {
    cancelledCutoff: new Date(Date.now() - 14 * 86400_000).toISOString(),
    dateFrom: new Date(today.getFullYear() - 1, today.getMonth(), 1).toISOString().slice(0, 10),
    dateTo: new Date(today.getFullYear() + 1, today.getMonth(), 0).toISOString().slice(0, 10),
  };
}

export function useRentalShifts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const pageSize = 1000;
    const all: Row[] = [];
    let from = 0;
    // Cost fix: this used to have no date bound at all -- every open of the
    // Rental points page (by every admin AND every rental staff member,
    // independently, no shared cache) paginated through the ENTIRE history
    // of rental-point shifts, forever, growing more expensive as the
    // booking history grows. live-shifts.ts and shifts-store.tsx both
    // already bound their equivalent queries to a date range; this was the
    // one outlier. A generous +/-12 month window keeps existing calendar
    // navigation working (the calendar itself pages through this in-memory
    // array client-side) while capping the query instead of scanning
    // everything ever imported.
    const { cancelledCutoff, dateFrom, dateTo } = rentalWindow();
    while (true) {
      // Reads go through shifts_rental_view, which masks `rate` (the amount the
      // customer paid) to NULL for rental-staff-only callers in SQL. Admins get
      // the real value. Writes below still target public.shifts directly.
      const { data, error: err } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("shifts_rental_view" as any)
        .select(RENTAL_SHIFT_COLUMNS)

        // Cancelled bookings are kept for a bounded window (same 14 days as the
        // rental-staff view) so admins/staff see a "Cancelled" row instead of a
        // booking silently vanishing; older cancellations fall out.
        .or(`cancelled_at.is.null,cancelled_at.gte.${cancelledCutoff}`)
        // NOTE: intentionally NOT filtered by rental_point_id. Guided tours are
        // matched to a rental point by meeting point (see rental-point-match.ts),
        // so they must reach the client too. Consumers scope per point.
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .range(from, from + pageSize - 1);
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const batch = (data ?? []) as unknown as Row[];
      all.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    setRows(all);
    setError(null);
    setLoading(false);
  }, []);

  // Live updates go through a "Broadcast from Database" channel, NOT
  // postgres_changes. postgres_changes streams the whole row from the
  // replication stream: RLS decides *whether* a change is delivered, never
  // which columns ride along. That meant every live INSERT/UPDATE handed
  // rental staff the real `rate` (what the customer paid) in their WebSocket
  // payload and merged it into local state, bypassing shifts_rental_view's
  // masking that fetchAll() relies on. The trigger public.broadcast_shift_change
  // instead sends only { id, event_type } -- no row columns at all -- and we
  // re-read through the masked view. Nothing sensitive is ever on the wire.
  //
  // Cost fix: that re-read used to be a debounced *full* refetch -- every
  // single booking change re-paginated the whole +/-12-month window (a
  // 30-column select over potentially thousands of rows) in every open
  // client. shifts-store.tsx already reconciles one row by id off the same
  // broadcast; this now does the same, so a change costs one row read.
  const fetchAllRef = useRef(fetchAll);
  fetchAllRef.current = fetchAll;
  useEffect(() => {
    void fetchAll();

    const applyRow = async (id: string) => {
      const { cancelledCutoff, dateFrom, dateTo } = rentalWindow();
      const { data, error: err } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("shifts_rental_view" as any)
        .select(RENTAL_SHIFT_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      // Not visible to this user (RLS) or gone: treat as a removal.
      if (err || !data) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        return;
      }
      const row = data as unknown as Row;
      const outOfWindow =
        row.date < dateFrom ||
        row.date > dateTo ||
        (!!row.cancelled_at && row.cancelled_at < cancelledCutoff);
      setRows((prev) => {
        const exists = prev.some((r) => r.id === row.id);
        if (outOfWindow) return exists ? prev.filter((r) => r.id !== row.id) : prev;
        if (!exists) {
          return [...prev, row].sort((a, b) =>
            a.date === b.date
              ? (a.start_time ?? "").localeCompare(b.start_time ?? "")
              : a.date.localeCompare(b.date),
          );
        }
        return prev.map((r) => (r.id === row.id ? { ...r, ...row } : r));
      });
    };

    const offShifts = onShiftChange((payload) => {
      const id = payload?.id;
      // No id on the payload (shouldn't happen): fall back to a full refetch.
      if (!id) {
        void fetchAllRef.current();
        return;
      }
      if (payload?.event_type === "delete") {
        setRows((prev) => prev.filter((r) => r.id !== id));
        return;
      }
      void applyRow(id);
    });
    return () => {
      offShifts();
    };
  }, [fetchAll]);


  const updateShift = useCallback(
    async (
      id: string,
      patch: {
        startTime?: string;
        endTime?: string;
        meetingPoint?: string;
        rate?: number | null;
        rateTitle?: string | null;
        assignedStaffId?: string | null;
        status?: Shift["status"];
      },
    ) => {
      const out: Record<string, unknown> = {};
      if (patch.startTime !== undefined) out.start_time = `${patch.startTime}:00`;
      if (patch.endTime !== undefined) out.end_time = `${patch.endTime}:00`;
      if (patch.meetingPoint !== undefined) out.meeting_point = patch.meetingPoint;
      if (patch.rate !== undefined) out.rate = patch.rate ?? null;
      if (patch.rateTitle !== undefined) out.rate_title = patch.rateTitle ?? null;
      if (patch.assignedStaffId !== undefined) out.assigned_staff_id = patch.assignedStaffId;
      if (patch.status !== undefined) out.status = patch.status;
      // Optimistic local update
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...(out as Partial<Row>) } : r)),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: err } = await supabase.from("shifts").update(out as any).eq("id", id);
      if (err) {
        void fetchAll();
        throw err;
      }
    },
    [fetchAll],
  );

  const assignShift = useCallback(
    async (id: string, staffId: string | null) => {
      await updateShift(id, {
        assignedStaffId: staffId,
        status: staffId ? "pending" : "unassigned",
      });
    },
    [updateShift],
  );

  const deleteShift = useCallback(
    async (id: string) => {
      // Optimistic local removal
      setRows((prev) => prev.filter((r) => r.id !== id));
      const { error: err } = await supabase.from("shifts").delete().eq("id", id);
      if (err) {
        void fetchAll();
        throw err;
      }
    },
    [fetchAll],
  );

  return { shifts, loading, error, refresh: fetchAll, updateShift, assignShift, deleteShift };
}
