import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StaffPointAssignment = {
  id: string;
  user_id: string;
  rental_point_id: string;
  is_primary: boolean;
};

/**
 * Manage which rental points a given auth user (profile_id) is assigned to.
 * Admin-only writes are enforced by RLS.
 */
export function useStaffRentalPoints(userId: string | null | undefined) {
  const [assignments, setAssignments] = useState<StaffPointAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId) {
      setAssignments([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("staff_rental_points")
      .select("id, user_id, rental_point_id, is_primary")
      .eq("user_id", userId);
    if (error) setError(error.message);
    else {
      setAssignments((data ?? []) as StaffPointAssignment[]);
      setError(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchAll();
    if (!userId) return;
    const channel = supabase
      .channel(`staff-rental-points-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "staff_rental_points", filter: `user_id=eq.${userId}` },
        () => {
          void fetchAll();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll, userId]);

  const assign = useCallback(
    async (pointId: string) => {
      if (!userId) throw new Error("No user selected");
      // Optimistic insert with a temp id; realtime/refetch will reconcile
      const tempId = `temp-${pointId}-${Date.now()}`;
      const optimistic: StaffPointAssignment = {
        id: tempId,
        user_id: userId,
        rental_point_id: pointId,
        is_primary: false,
      };
      const prev = assignments;
      setAssignments((curr) =>
        curr.some((a) => a.rental_point_id === pointId) ? curr : [...curr, optimistic],
      );
      const { error } = await supabase
        .from("staff_rental_points")
        .insert({ user_id: userId, rental_point_id: pointId });
      if (error) {
        setAssignments(prev);
        throw error;
      }
      void fetchAll();
    },
    [userId, fetchAll, assignments],
  );

  const unassign = useCallback(
    async (pointId: string) => {
      if (!userId) throw new Error("No user selected");
      const prev = assignments;
      setAssignments((curr) => curr.filter((a) => a.rental_point_id !== pointId));
      const { error } = await supabase
        .from("staff_rental_points")
        .delete()
        .eq("user_id", userId)
        .eq("rental_point_id", pointId);
      if (error) {
        setAssignments(prev);
        throw error;
      }
      void fetchAll();
    },
    [userId, fetchAll, assignments],
  );

  const setPrimary = useCallback(
    async (pointId: string) => {
      if (!userId) throw new Error("No user selected");
      const prev = assignments;
      setAssignments((curr) =>
        curr.map((a) => ({ ...a, is_primary: a.rental_point_id === pointId })),
      );
      const { error: clearErr } = await supabase
        .from("staff_rental_points")
        .update({ is_primary: false })
        .eq("user_id", userId);
      if (clearErr) {
        setAssignments(prev);
        throw clearErr;
      }
      const { error } = await supabase
        .from("staff_rental_points")
        .update({ is_primary: true })
        .eq("user_id", userId)
        .eq("rental_point_id", pointId);
      if (error) {
        setAssignments(prev);
        throw error;
      }
      void fetchAll();
    },
    [userId, fetchAll, assignments],
  );

  return { assignments, loading, error, refresh: fetchAll, assign, unassign, setPrimary };
}
