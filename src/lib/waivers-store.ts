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
    const { data, error } = await supabase
      .from("waiver_signatures")
      .select("id, external_signature_id, booking_id, email, signer_name, signed_at, waiver_template_id, matched_shift_id")
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
        () => void fetchAll(),
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
