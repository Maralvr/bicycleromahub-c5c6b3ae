import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type GuideName = { id: string; name: string; avatar: string };

/**
 * Rental-staff sessions can't read public.staff directly (staff_select is
 * admin/own-row only), so guide names on the rental-point calendars came back
 * empty for them. public.guide_names() is a SECURITY DEFINER RPC exposing just
 * id/name/avatar to any authenticated user -- exactly what the read-only
 * calendars need.
 *
 * Cost fix: the hook used to fire its own RPC per mounted instance, and the
 * rental-point views mount it more than once at a time (page-level calendar +
 * the all-points overview). Guide names barely change within a session, so one
 * in-flight promise is shared across every caller and the result is cached at
 * module scope for the session.
 */
let cache: GuideName[] | null = null;
let inflight: Promise<GuideName[]> | null = null;

function loadGuideNames(): Promise<GuideName[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = supabase
      .rpc("guide_names" as never)
      .then(({ data }) => {
        cache = (data ?? []) as unknown as GuideName[];
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useGuideNames(): { guides: Map<string, GuideName>; loading: boolean } {
  const [rows, setRows] = useState<GuideName[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    void loadGuideNames().then((data) => {
      if (cancelled) return;
      setRows(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const guides = useMemo(() => new Map(rows.map((g) => [g.id, g])), [rows]);
  return { guides, loading };
}
