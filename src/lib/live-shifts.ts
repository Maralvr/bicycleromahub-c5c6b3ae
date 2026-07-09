import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isExcludedTourName } from "./excluded-bokun-products";

export type Participant = { name: string; category: string };

export type LiveShift = {
  id: string;
  source: "manual" | "bokun";
  booking_id: string | null;
  channel_booking_ref: string | null;
  external_booking_ref: string | null;
  tour_name: string;
  date: string;
  start_time: string;
  end_time: string;
  meeting_point: string | null;
  rental_point_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  adults: number;
  teens: number;
  infants: number;
  trailers: number;
  participants: Participant[];
  rate: number | null;
  rate_title: string | null;
  seller: string | null;
  booking_channel: string | null;
  bokun_created_at: string | null;
  ticket_sent: boolean;
  notes: string | null;
  operations_notes: string | null;
  required_tags: string[];
  assigned_staff_id: string | null;
  status: "unassigned" | "pending" | "accepted" | "rejected";
  created_at: string;
  updated_at: string;
  no_show: boolean;
  no_show_reported_at: string | null;
  no_show_reported_by: string | null;
  no_show_notes: string | null;
};

export type LiveShiftInput = {
  tour_name: string;
  date: string;
  start_time: string;
  end_time: string;
  meeting_point?: string | null;
  rental_point_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  adults?: number;
  teens?: number;
  infants?: number;
  trailers?: number;
  participants?: Participant[];
  rate?: number | null;
  rate_title?: string | null;
  seller?: string | null;
  booking_channel?: string | null;
  notes?: string | null;
  operations_notes?: string | null;
  required_tags?: string[];
  assigned_staff_id?: string | null;
  status?: LiveShift["status"];
  source?: LiveShift["source"];
  booking_id?: string | null;
  channel_booking_ref?: string | null;
  external_booking_ref?: string | null;
};

export function useLiveShifts(opts?: { rentalPointId?: string | null }) {
  const [shifts, setShifts] = useState<LiveShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    // Date window: 60 days back to 180 days forward. Cuts egress dramatically
    // vs fetching every historical row, and covers all calendar views.
    const today = new Date();
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 60);
    const to = new Date(today);
    to.setUTCDate(to.getUTCDate() + 180);
    const isoFrom = from.toISOString().slice(0, 10);
    const isoTo = to.toISOString().slice(0, 10);

    // Explicit column list — skip wide/unused columns (payout_*, reminder_*,
    // rejected_by_staff_ids, etc.) to reduce payload size.
    const cols =
      "id, source, booking_id, channel_booking_ref, external_booking_ref, tour_name, date, start_time, end_time, meeting_point, rental_point_id, customer_name, customer_phone, customer_email, adults, teens, infants, trailers, participants, rate, rate_title, seller, booking_channel, bokun_created_at, ticket_sent, notes, operations_notes, required_tags, assigned_staff_id, status, created_at, updated_at, no_show, no_show_reported_at, no_show_reported_by, no_show_notes";

    let q = supabase
      .from("shifts")
      .select(cols)
      .gte("date", isoFrom)
      .lte("date", isoTo)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });
    if (opts?.rentalPointId) q = q.eq("rental_point_id", opts.rentalPointId);
    const { data, error } = await q;
    if (error) setError(error.message);
    else {
      const all = (data ?? []) as unknown as LiveShift[];
      const rows = all.filter((r) => {
        if (isExcludedTourName(r.tour_name)) return false;
        // Hide rental bookings from the regular shifts view unless this hook
        // is explicitly scoped to a rental point.
        if (!opts?.rentalPointId && r.rental_point_id) return false;
        return true;
      });
      setShifts(rows);
      setError(null);
    }
    setLoading(false);
  }, [opts?.rentalPointId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const create = useCallback(
    async (input: LiveShiftInput) => {
      const { data, error } = await supabase
        .from("shifts")
        .insert({
          source: input.source ?? "manual",
          booking_id: input.booking_id ?? null,
          channel_booking_ref: input.channel_booking_ref ?? null,
          external_booking_ref: input.external_booking_ref ?? null,
          tour_name: input.tour_name,
          date: input.date,
          start_time: input.start_time,
          end_time: input.end_time,
          meeting_point: input.meeting_point ?? "",
          rental_point_id: input.rental_point_id ?? null,
          customer_name: input.customer_name ?? null,
          customer_phone: input.customer_phone ?? null,
          customer_email: input.customer_email ?? null,
          adults: input.adults ?? 0,
          teens: input.teens ?? 0,
          infants: input.infants ?? 0,
          trailers: input.trailers ?? 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          participants: (input.participants ?? []) as any,
          rate: input.rate ?? null,
          rate_title: input.rate_title ?? null,
          seller: input.seller ?? null,
          booking_channel: input.booking_channel ?? null,
          notes: input.notes ?? null,
          operations_notes: input.operations_notes ?? null,
          required_tags: input.required_tags ?? [],
          assigned_staff_id: input.assigned_staff_id ?? null,
          status: input.status ?? "unassigned",
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        const row = data as unknown as LiveShift;
        const include = opts?.rentalPointId
          ? row.rental_point_id === opts.rentalPointId
          : !row.rental_point_id;
        if (include && !isExcludedTourName(row.tour_name)) {
          setShifts((prev) =>
            prev.some((s) => s.id === row.id) ? prev : [...prev, row],
          );
        }
      }
    },
    [opts?.rentalPointId],
  );

  const update = useCallback(
    async (id: string, patch: Partial<LiveShiftInput>) => {
      const prev = shifts;
      setShifts((curr) =>
        curr.map((s) => (s.id === id ? { ...s, ...(patch as Partial<LiveShift>) } : s)),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("shifts").update(patch as any).eq("id", id);
      if (error) {
        setShifts(prev);
        throw error;
      }
    },
    [shifts],
  );

  const remove = useCallback(
    async (id: string) => {
      const prev = shifts;
      setShifts((curr) => curr.filter((s) => s.id !== id));
      const { error } = await supabase.from("shifts").delete().eq("id", id);
      if (error) {
        setShifts(prev);
        throw error;
      }
    },
    [shifts],
  );

  const assign = useCallback(
    async (id: string, staffId: string | null) => {
      const patch: Record<string, unknown> = {
        assigned_staff_id: staffId,
        status: staffId ? "pending" : "unassigned",
      };
      if (staffId) {
        patch.pending_expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      } else {
        patch.pending_expires_at = null;
        patch.requested_by = null;
      }
      const prev = shifts;
      setShifts((curr) =>
        curr.map((s) => (s.id === id ? { ...s, ...(patch as Partial<LiveShift>) } : s)),
      );
      const { error } = await supabase.from("shifts").update(patch as never).eq("id", id);
      if (error) {
        setShifts(prev);
        throw error;
      }
    },
    [shifts],
  );


  const setStatus = useCallback(
    async (id: string, status: LiveShift["status"]) => {
      const prev = shifts;
      setShifts((curr) => curr.map((s) => (s.id === id ? { ...s, status } : s)));
      const { error } = await supabase.from("shifts").update({ status }).eq("id", id);
      if (error) {
        setShifts(prev);
        throw error;
      }
    },
    [shifts],
  );

  return { shifts, loading, error, refresh: fetchAll, create, update, remove, assign, setStatus };
}
