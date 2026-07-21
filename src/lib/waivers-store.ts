import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WaiverSignature = {
  id: string;
  external_signature_id: string | null;
  booking_id: string | null;
  email: string | null;
  signer_name: string | null;
  signed_at: string;
  waiver_template_id: string | null;
  matched_shift_id: string | null;
};

export type WaiverStatus = "signed" | "not_signed";

export function useWaiverSignatures() {
  const [signatures, setSignatures] = useState<WaiverSignature[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    // Cost fix: this used to fetch every waiver signature ever recorded,
    // unbounded. Waivers are signed on-site (QR scan) at or before the
    // tour, never in advance, so there's no need for a forward window --
    // just a backward one, matching the -60 day lower bound used elsewhere
    // for shift-adjacent data (live-shifts.ts, dispatch-events-store.tsx,
    // booking-notes-store.tsx). Only consumer is shifts.tsx's waiver
    // badges/signer-list, which only ever look at currently-visible shifts
    // (confirmed via grep -- no other reporting view depends on this).
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 60);
    const isoFrom = from.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("waiver_signatures")
      .select("id, external_signature_id, booking_id, email, signer_name, signed_at, waiver_template_id, matched_shift_id")
      .gte("signed_at", isoFrom)
      .order("signed_at", { ascending: false });
    if (!error) setSignatures((data ?? []) as WaiverSignature[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel(`waiver-signatures-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waiver_signatures" },
        (payload) => {
          const newRow = payload.new as WaiverSignature | null;
          const oldRow = payload.old as { id?: string } | null;
          setSignatures((prev) => {
            if (payload.eventType === "INSERT" && newRow) {
              if (prev.some((s) => s.id === newRow.id)) return prev;
              return [newRow, ...prev].sort(
                (a, b) => (a.signed_at < b.signed_at ? 1 : -1),
              );
            }
            if (payload.eventType === "UPDATE" && newRow) {
              return prev.map((s) => (s.id === newRow.id ? { ...s, ...newRow } : s));
            }
            if (payload.eventType === "DELETE" && oldRow?.id) {
              return prev.filter((s) => s.id !== oldRow.id);
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

  return { signatures, loading, refresh: fetchAll };
}

/** Returns signatures matching this shift (by matched_shift_id or booking_id). */
export function signaturesForShift(
  signatures: WaiverSignature[],
  shift: { id: string; bookingId?: string; customer?: { name: string } },
): WaiverSignature[] {
  return signatures.filter((sig) => {
    if (sig.matched_shift_id === shift.id) return true;
    if (shift.bookingId && sig.booking_id && sig.booking_id === shift.bookingId) return true;
    return false;
  });
}

export function waiverStatusForShift(
  signatures: WaiverSignature[],
  shift: { id: string; bookingId?: string; customer?: { name: string } },
): WaiverStatus {
  return signaturesForShift(signatures, shift).length > 0 ? "signed" : "not_signed";
}

/**
 * Guides cannot read waiver_signatures directly (PII). This hook calls a
 * security-definer RPC that returns just the shift IDs the current guide is
 * assigned to that have at least one signature on file — enough to render a
 * signed/not-signed badge without exposing customer name/email/payload.
 */
export function useMySignedShiftIds() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_signed_waiver_shift_ids" as never);
    if (!error && Array.isArray(data)) {
      setIds(new Set((data as unknown as string[]).filter(Boolean)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`my-signed-waivers-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waiver_signatures" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { signedShiftIds: ids, loading, refresh };
}
