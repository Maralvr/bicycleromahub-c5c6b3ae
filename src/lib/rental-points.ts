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
      .channel("rental-points-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "rental_points" }, () => {
        void fetchAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_rental_points" }, () => {
        void fetchAll();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const create = useCallback(
    async (input: RentalPointInput) => {
      const { error } = await supabase.from("rental_points").insert(input);
      if (error) throw error;
      await fetchAll();
    },
    [fetchAll],
  );

  const update = useCallback(
    async (id: string, input: Partial<RentalPointInput>) => {
      const { error } = await supabase.from("rental_points").update(input).eq("id", id);
      if (error) throw error;
      await fetchAll();
    },
    [fetchAll],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("rental_points").delete().eq("id", id);
      if (error) throw error;
      await fetchAll();
    },
    [fetchAll],
  );

  return { points, loading, error, refresh: fetchAll, create, update, remove };
}
