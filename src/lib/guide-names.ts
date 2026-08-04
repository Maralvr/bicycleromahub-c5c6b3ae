import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type GuideName = { id: string; name: string; avatar: string };

/**
 * Rental-staff sessions can't read public.staff directly (staff_select is
 * admin/own-row only), so guide names on the rental-point calendars came back
 * empty for them. public.guide_names() is a SECURITY DEFINER RPC exposing just
 * id/name/avatar to any authenticated user -- exactly what the read-only
 * calendars need.
 */
export function useGuideNames(): { guides: Map<string, GuideName>; loading: boolean } {
  const [rows, setRows] = useState<GuideName[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.rpc("guide_names" as never);
      if (cancelled) return;
      setRows((data ?? []) as unknown as GuideName[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const guides = useMemo(() => new Map(rows.map((g) => [g.id, g])), [rows]);
  return { guides, loading };
}
