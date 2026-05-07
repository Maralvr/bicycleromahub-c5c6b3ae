import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LiveShift = {
  id: string;
  source: "manual" | "bokun";
  booking_id: string | null;
  tour_name: string;
  date: string;
  start_time: string;
  end_time: string;
  meeting_point: string | null;
  rental_point_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  adults: number;
  teens: number;
  infants: number;
  trailers: number;
  rate: number | null;
  notes: string | null;
  required_tags: string[];
  assigned_staff_id: string | null;
  status: "unassigned" | "pending" | "accepted" | "rejected";
  created_at: string;
  updated_at: string;
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
  adults?: number;
  teens?: number;
  infants?: number;
  trailers?: number;
  rate?: number | null;
  notes?: string | null;
  required_tags?: string[];
  assigned_staff_id?: string | null;
  status?: LiveShift["status"];
  source?: LiveShift["source"];
  booking_id?: string | null;
};

export function useLiveShifts(opts?: { rentalPointId?: string | null }) {
  const [shifts, setShifts] = useState<LiveShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("shifts")
      .select("*")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });
    if (opts?.rentalPointId) q = q.eq("rental_point_id", opts.rentalPointId);
    const { data, error } = await q;
    if (error) setError(error.message);
    else {
      setShifts((data ?? []) as unknown as LiveShift[]);
      setError(null);
    }
    setLoading(false);
  }, [opts?.rentalPointId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const create = useCallback(
    async (input: LiveShiftInput) => {
      const { error } = await supabase.from("shifts").insert({
        source: input.source ?? "manual",
        booking_id: input.booking_id ?? null,
        tour_name: input.tour_name,
        date: input.date,
        start_time: input.start_time,
        end_time: input.end_time,
        meeting_point: input.meeting_point ?? "",
        rental_point_id: input.rental_point_id ?? null,
        customer_name: input.customer_name ?? null,
        customer_phone: input.customer_phone ?? null,
        adults: input.adults ?? 0,
        teens: input.teens ?? 0,
        infants: input.infants ?? 0,
        trailers: input.trailers ?? 0,
        rate: input.rate ?? null,
        notes: input.notes ?? null,
        required_tags: input.required_tags ?? [],
        assigned_staff_id: input.assigned_staff_id ?? null,
        status: input.status ?? "unassigned",
      });
      if (error) throw error;
      await fetchAll();
    },
    [fetchAll],
  );

  const update = useCallback(
    async (id: string, patch: Partial<LiveShiftInput>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("shifts").update(patch as any).eq("id", id);
      if (error) throw error;
      await fetchAll();
    },
    [fetchAll],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("shifts").delete().eq("id", id);
      if (error) throw error;
      await fetchAll();
    },
    [fetchAll],
  );

  const assign = useCallback(
    async (id: string, staffId: string | null) => {
      const { error } = await supabase
        .from("shifts")
        .update({ assigned_staff_id: staffId, status: staffId ? "pending" : "unassigned" })
        .eq("id", id);
      if (error) throw error;
      await fetchAll();
    },
    [fetchAll],
  );

  const setStatus = useCallback(
    async (id: string, status: LiveShift["status"]) => {
      const { error } = await supabase.from("shifts").update({ status }).eq("id", id);
      if (error) throw error;
      await fetchAll();
    },
    [fetchAll],
  );

  return { shifts, loading, error, refresh: fetchAll, create, update, remove, assign, setStatus };
}
