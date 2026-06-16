import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Shift } from "./mock-data";
import { isExcludedTourName } from "./excluded-bokun-products";

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
  };
}

export type RentalShift = ReturnType<typeof rowToShift>;

export function useRentalShifts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const pageSize = 1000;
    const all: Row[] = [];
    let from = 0;
    while (true) {
      const { data, error: err } = await supabase
        .from("shifts")
        .select(
          "id, source, booking_id, channel_booking_ref, external_booking_ref, tour_name, date, start_time, end_time, meeting_point, customer_name, customer_phone, customer_email, adults, teens, infants, trailers, participants, rate, rate_title, seller, booking_channel, notes, operations_notes, assigned_staff_id, status, required_tags, rental_point_id",
        )
        .not("rental_point_id", "is", null)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .range(from, from + pageSize - 1);
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const batch = (data ?? []) as Row[];
      all.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    setRows(all);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel("rental-shifts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, (payload) => {
        const newRow = payload.new as Row | null;
        const oldRow = payload.old as { id?: string } | null;
        setRows((prev) => {
          if (payload.eventType === "INSERT" && newRow) {
            if (!newRow.rental_point_id) return prev;
            if (prev.some((r) => r.id === newRow.id)) return prev;
            return [...prev, newRow];
          }
          if (payload.eventType === "UPDATE" && newRow) {
            // Row may have moved in/out of rental scope
            const exists = prev.some((r) => r.id === newRow.id);
            if (!newRow.rental_point_id) {
              return exists ? prev.filter((r) => r.id !== newRow.id) : prev;
            }
            if (!exists) return [...prev, newRow];
            return prev.map((r) => (r.id === newRow.id ? { ...r, ...newRow } : r));
          }
          if (payload.eventType === "DELETE" && oldRow?.id) {
            return prev.filter((r) => r.id !== oldRow.id);
          }
          return prev;
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const shifts = useMemo<RentalShift[]>(
    () => rows.filter((r) => !isExcludedTourName(r.tour_name)).map(rowToShift),
    [rows],
  );

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
