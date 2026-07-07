import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Staff } from "@/lib/mock-data";

type UnavailRow = {
  id: string;
  rental_staff_id: string;
  date: string;
  all_day: boolean;
  from_time: string | null;
  to_time: string | null;
  reason: string | null;
};

type UnavailabilityEntry = Staff["unavailability"][number];

/**
 * Mirrors useStaffStore's unavailability slice (toggleAllDay/setTimeWindow/
 * clearDate/clearMonth), but scoped to the caller's own rental_staff row
 * instead of a public.staff row. Resolves rental_staff_id internally so
 * callers don't need to look it up themselves.
 *
 * rental_staff_unavailability isn't in the generated Supabase types yet
 * (added in 20260705000000, alongside the app hasn't had a fresh codegen
 * run against it) -- `as never` on .from(...) is the existing pattern this
 * codebase already uses for the same situation (see booking-notes-thread.tsx,
 * dispatch-history.tsx).
 */
export function useRentalAvailability() {
  const { user } = useAuth();
  const [rentalStaffId, setRentalStaffId] = useState<string | null>(null);
  const [rows, setRows] = useState<UnavailRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: staffRow } = await supabase
      .from("rental_staff")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!staffRow) {
      setRentalStaffId(null);
      setRows([]);
      setLoading(false);
      return;
    }
    setRentalStaffId(staffRow.id);
    const { data, error } = await supabase
      .from("rental_staff_unavailability" as never)
      .select("id, rental_staff_id, date, all_day, from_time, to_time, reason")
      .eq("rental_staff_id", staffRow.id);
    if (!error) setRows((data ?? []) as unknown as UnavailRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!rentalStaffId) return;
    const channel = supabase
      .channel(`rental_unavail:${rentalStaffId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rental_staff_unavailability", filter: `rental_staff_id=eq.${rentalStaffId}` },
        () => {
          void fetchAll();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [rentalStaffId, fetchAll]);

  const unavailability = useMemo<UnavailabilityEntry[]>(
    () =>
      rows.map((u) => ({
        date: u.date,
        allDay: u.all_day,
        from: u.from_time?.slice(0, 5) ?? undefined,
        to: u.to_time?.slice(0, 5) ?? undefined,
        reason: u.reason ?? undefined,
      })),
    [rows],
  );

  const toggleAllDay = useCallback(
    async (staffId: string, date: string, reason?: string) => {
      const existing = rows.find((r) => r.date === date);
      if (existing?.all_day) {
        await supabase.from("rental_staff_unavailability" as never).delete().eq("id", existing.id);
      } else {
        if (existing) await supabase.from("rental_staff_unavailability" as never).delete().eq("id", existing.id);
        await (supabase.from("rental_staff_unavailability" as never) as any).insert({
          rental_staff_id: staffId,
          date,
          all_day: true,
          reason: reason ?? null,
        });
      }
      await fetchAll();
    },
    [rows, fetchAll],
  );

  const setTimeWindow = useCallback(
    async (staffId: string, date: string, from: string, to: string) => {
      const existing = rows.find((r) => r.date === date);
      if (existing) await supabase.from("rental_staff_unavailability" as never).delete().eq("id", existing.id);
      await (supabase.from("rental_staff_unavailability" as never) as any).insert({
        rental_staff_id: staffId,
        date,
        all_day: false,
        from_time: `${from}:00`,
        to_time: `${to}:00`,
      });
      await fetchAll();
    },
    [rows, fetchAll],
  );

  const clearDate = useCallback(
    async (_staffId: string, date: string) => {
      const existing = rows.find((r) => r.date === date);
      if (existing) await supabase.from("rental_staff_unavailability" as never).delete().eq("id", existing.id);
      await fetchAll();
    },
    [rows, fetchAll],
  );

  const clearMonth = useCallback(
    async (staffId: string, yearMonth: string) => {
      await supabase
        .from("rental_staff_unavailability" as never)
        .delete()
        .eq("rental_staff_id", staffId)
        .gte("date", `${yearMonth}-01`)
        .lte("date", `${yearMonth}-31`);
      await fetchAll();
    },
    [fetchAll],
  );

  return { rentalStaffId, unavailability, loading, toggleAllDay, setTimeWindow, clearDate, clearMonth };
}
