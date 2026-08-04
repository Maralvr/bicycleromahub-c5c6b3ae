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

const WAIVER_COLUMNS =
  "id, external_signature_id, booking_id, email, signer_name, signed_at, waiver_template_id, matched_shift_id";

/**
 * Cost fix: both of these hooks used to fetch and open their own realtime
 * channel per mounted instance. shifts.tsx mounts useWaiverSignatures twice
 * concurrently (page level + ShiftList) and useMySignedShiftIds inside
 * ShiftList, so a single Shifts page open meant several duplicate queries and
 * several duplicate `waiver_signatures` subscriptions -- the same per-instance
 * fan-out already fixed in dispatch-events-store.tsx / booking-notes-store.tsx.
 * Each hook now shares one fetch, one cache and one ref-counted channel across
 * all its subscribers.
 */
function createSharedStore<T>(
  channelPrefix: string,
  load: () => Promise<T>,
  initial: T,
) {
  let value: T = initial;
  let loaded = false;
  let inflight: Promise<void> | null = null;
  const subscribers = new Set<(v: T, loading: boolean) => void>();
  let channel: ReturnType<typeof supabase.channel> | null = null;

  const emit = (loading: boolean) => {
    for (const s of Array.from(subscribers)) s(value, loading);
  };

  const refresh = () => {
    if (!inflight) {
      inflight = load()
        .then((next) => {
          value = next;
          loaded = true;
        })
        .finally(() => {
          inflight = null;
          emit(false);
        });
    }
    return inflight;
  };

  const subscribe = (fn: (v: T, loading: boolean) => void) => {
    subscribers.add(fn);
    if (!channel) {
      channel = supabase
        .channel(`${channelPrefix}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "waiver_signatures" },
          () => void refresh(),
        )
        .subscribe();
    }
    if (loaded) fn(value, false);
    void refresh();
    return () => {
      subscribers.delete(fn);
      if (subscribers.size === 0 && channel) {
        const ch = channel;
        channel = null;
        void supabase.removeChannel(ch);
      }
    };
  };

  return { subscribe, refresh, get: () => value, isLoaded: () => loaded };
}

const signaturesStore = createSharedStore<WaiverSignature[]>(
  "waiver-signatures-realtime",
  async () => {
    // Cost fix: this used to fetch every waiver signature ever recorded,
    // unbounded. Waivers are signed on-site (QR scan) at or before the
    // tour, never in advance, so there's no need for a forward window --
    // just a backward one, matching the -60 day lower bound used elsewhere
    // for shift-adjacent data (live-shifts.ts, dispatch-events-store.tsx,
    // booking-notes-store.tsx). Only consumer is shifts.tsx's waiver
    // badges/signer-list, which only ever look at currently-visible shifts.
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 60);
    const isoFrom = from.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("waiver_signatures")
      .select(WAIVER_COLUMNS)
      .gte("signed_at", isoFrom)
      .order("signed_at", { ascending: false });
    if (error) return signaturesStore.get();
    return (data ?? []) as WaiverSignature[];
  },
  [],
);

export function useWaiverSignatures() {
  const [signatures, setSignatures] = useState<WaiverSignature[]>(signaturesStore.get());
  const [loading, setLoading] = useState(!signaturesStore.isLoaded());

  useEffect(
    () =>
      signaturesStore.subscribe((v, l) => {
        setSignatures(v);
        setLoading(l);
      }),
    [],
  );

  const refresh = useCallback(() => signaturesStore.refresh(), []);
  return { signatures, loading, refresh };
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

const signedShiftIdsStore = createSharedStore<Set<string>>(
  "my-signed-waivers",
  async () => {
    const { data, error } = await supabase.rpc("my_signed_waiver_shift_ids" as never);
    if (error || !Array.isArray(data)) return signedShiftIdsStore.get();
    return new Set((data as unknown as string[]).filter(Boolean));
  },
  new Set<string>(),
);

/**
 * Guides cannot read waiver_signatures directly (PII). This hook calls a
 * security-definer RPC that returns just the shift IDs the current guide is
 * assigned to that have at least one signature on file — enough to render a
 * signed/not-signed badge without exposing customer name/email/payload.
 */
export function useMySignedShiftIds() {
  const [ids, setIds] = useState<Set<string>>(signedShiftIdsStore.get());
  const [loading, setLoading] = useState(!signedShiftIdsStore.isLoaded());

  useEffect(
    () =>
      signedShiftIdsStore.subscribe((v, l) => {
        setIds(v);
        setLoading(l);
      }),
    [],
  );

  const refresh = useCallback(() => signedShiftIdsStore.refresh(), []);
  return { signedShiftIds: ids, loading, refresh };
}
