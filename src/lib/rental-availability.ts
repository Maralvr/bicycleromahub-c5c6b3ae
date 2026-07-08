import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Staff } from "@/lib/mock-data";
import { toast } from "sonner";

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
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: staffRow, error: staffErr } = await supabase
      .from("rental_staff")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (staffErr) {
      setError(staffErr.message);
      setLoading(false);
      return;
    }
    if (!staffRow) {
      setRentalStaffId(null);
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }
    setRentalStaffId(staffRow.id);
    const { data, error: err } = await supabase
      .from("rental_staff_unavailability" as never)
      .select("id, rental_staff_id, date, all_day, from_time, to_time, reason")
      .eq("rental_staff_id", staffRow.id);
    if (err) {
      // Surface this instead of silently leaving `rows` stale/empty -- if
      // the table/migration isn't actually applied on the database yet
      // (has happened before with rental-staff features), this is the only
      // signal that anything is wrong.
      setError(err.message);
    } else {
      setError(null);
      setRows((data ?? []) as unknown as UnavailRow[]);
    }
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

  // Every mutation below previously swallowed its Supabase error entirely --
  // if the insert/delete failed (RLS, a migration not yet applied, a stale
  // schema, anything), the UI just silently re-fetched the same unchanged
  // rows, so clicking "mark day off" appeared to do nothing with zero
  // feedback. staff-store.tsx's guide-facing equivalent already surfaces
  // failures; this now does the same via toast instead of failing silently.
  const toggleAllDay = useCallback(
    async (staffId: string, date: string, reason?: string) => {
      const existing = rows.find((r) => r.date === date);
      if (existing?.all_day) {
        const { error } = await supabase
          .from("rental_staff_unavailability" as never)
          .delete()
          .eq("id", existing.id);
        if (error) {
          toast.error(`Couldn't clear that day: ${error.message}`);
          return;
        }
      } else {
        if (existing) {
          const { error: delErr } = await supabase
            .from("rental_staff_unavailability" as never)
            .delete()
            .eq("id", existing.id);
          if (delErr) {
            toast.error(`Couldn't update that day: ${delErr.message}`);
            return;
          }
        }
        const { error } = await (supabase.from("rental_staff_unavailability" as never) as any).insert({
          rental_staff_id: staffId,
          date,
          all_day: true,
          reason: reason ?? null,
        });
        if (error) {
          toast.error(`Couldn't mark that day off: ${error.message}`);
          return;
        }
      }
      await fetchAll();
    },
    [rows, fetchAll],
  );

  const setTimeWindow = useCallback(
    async (staffId: string, date: string, from: string, to: string) => {
      const existing = rows.find((r) => r.date === date);
      if (existing) {
        const { error: delErr } = await supabase
          .from("rental_staff_unavailability" as never)
          .delete()
          .eq("id", existing.id);
        if (delErr) {
          toast.error(`Couldn't update that day: ${delErr.message}`);
          return;
        }
      }
      const { error } = await (supabase.from("rental_staff_unavailability" as never) as any).insert({
        rental_staff_id: staffId,
        date,
        all_day: false,
        from_time: `${from}:00`,
        to_time: `${to}:00`,
      });
      if (error) {
        toast.error(`Couldn't save that time window: ${error.message}`);
        return;
      }
      await fetchAll();
    },
    [rows, fetchAll],
  );

  const clearDate = useCallback(
    async (_staffId: string, date: string) => {
      const existing = rows.find((r) => r.date === date);
      if (existing) {
        const { error } = await supabase
          .from("rental_staff_unavailability" as never)
          .delete()
          .eq("id", existing.id);
        if (error) {
          toast.error(`Couldn't remove that day: ${error.message}`);
          return;
        }
      }
      await fetchAll();
    },
    [rows, fetchAll],
  );

  const clearMonth = useCallback(
    async (staffId: string, yearMonth: string) => {
      const { error } = await supabase
        .from("rental_staff_unavailability" as never)
        .delete()
        .eq("rental_staff_id", staffId)
        .gte("date", `${yearMonth}-01`)
        .lte("date", `${yearMonth}-31`);
      if (error) {
        toast.error(`Couldn't clear the month: ${error.message}`);
        return;
      }
      await fetchAll();
    },
    [fetchAll],
  );

  return { rentalStaffId, unavailability, loading, error, toggleAllDay, setTimeWindow, clearDate, clearMonth };
}
