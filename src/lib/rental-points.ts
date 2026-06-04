import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RentalPoint = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  opening_hours: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RentalPointInput = {
  name: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  notes?: string | null;
  active?: boolean;
};

export function useRentalPoints() {
  const [points, setPoints] = useState<RentalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rental_points")
      .select("*")
      .order("name", { ascending: true });
    if (error) setError(error.message);
    else {
      setPoints((data ?? []) as RentalPoint[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel(`rental-points-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rental_points" },
        (payload) => {
          const newRow = payload.new as RentalPoint | null;
          const oldRow = payload.old as { id?: string } | null;
          setPoints((prev) => {
            if (payload.eventType === "INSERT" && newRow) {
              if (prev.some((p) => p.id === newRow.id)) return prev;
              return [...prev, newRow].sort((a, b) => a.name.localeCompare(b.name));
            }
            if (payload.eventType === "UPDATE" && newRow) {
              return prev.map((p) => (p.id === newRow.id ? { ...p, ...newRow } : p));
            }
            if (payload.eventType === "DELETE" && oldRow?.id) {
              return prev.filter((p) => p.id !== oldRow.id);
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const create = useCallback(
    async (input: RentalPointInput) => {
      const { data, error } = await supabase
        .from("rental_points")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      if (data) {
        setPoints((prev) =>
          prev.some((p) => p.id === (data as RentalPoint).id)
            ? prev
            : [...prev, data as RentalPoint].sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
    },
    [],
  );

  const update = useCallback(
    async (id: string, input: Partial<RentalPointInput>) => {
      const prev = points;
      setPoints((curr) =>
        curr.map((p) => (p.id === id ? { ...p, ...(input as Partial<RentalPoint>) } : p)),
      );
      const { error } = await supabase.from("rental_points").update(input).eq("id", id);
      if (error) {
        setPoints(prev);
        throw error;
      }
    },
    [points],
  );

  const remove = useCallback(
    async (id: string) => {
      const prev = points;
      setPoints((curr) => curr.filter((p) => p.id !== id));
      const { error } = await supabase.from("rental_points").delete().eq("id", id);
      if (error) {
        setPoints(prev);
        throw error;
      }
    },
    [points],
  );

  return { points, loading, error, refresh: fetchAll, create, update, remove };
}
