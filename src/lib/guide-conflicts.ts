import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { onShiftChange } from "./shifts-broadcast";

/**
 * Guide overlap detection — single source of truth lives in the DATABASE.
 *
 * `public.busy_guides(date, start, end, exclude_shift_id)` wraps
 * `public.guide_conflicting_shift`, the exact same function the write-blocking
 * triggers (`shifts_block_guide_conflict_trg`, `sag_block_guide_conflict_trg`)
 * use. That means the UI's "busy" markers and the database's refusal to save
 * can never drift apart, and both see BOTH kinds of commitment:
 *   - primary: shifts.assigned_staff_id
 *   - additional: shift_additional_guides
 * Same-departure exemption and the pending/accepted-only rule also live there.
 *
 * There is deliberately NO JavaScript reimplementation of this logic anymore.
 */

export type ShiftWindow = {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type BusyGuide = {
  staffId: string;
  conflictShiftId: string;
  tourName: string;
  startTime: string;
  endTime: string;
};

/** staffId -> the clashing commitment */
export type BusyMap = Map<string, BusyGuide>;

export const EMPTY_BUSY: BusyMap = new Map();

const hhmm = (t: string | null) => (t ?? "").slice(0, 5);

export async function fetchBusyGuides(shift: ShiftWindow): Promise<BusyMap> {
  const { data, error } = await supabase.rpc("busy_guides", {
    _date: shift.date,
    _start: shift.startTime,
    _end: shift.endTime,
    _exclude_shift_id: shift.id ?? undefined,
  });
  if (error) throw error;
  const out: BusyMap = new Map();
  for (const row of data ?? []) {
    if (!row.staff_id) continue;
    out.set(row.staff_id, {
      staffId: row.staff_id,
      conflictShiftId: row.conflict_shift_id ?? "",
      tourName: row.tour_name ?? "another tour",
      startTime: hhmm(row.start_time),
      endTime: hhmm(row.end_time),
    });
  }
  return out;
}

const BUSY_KEY = "busy-guides";

/**
 * Realtime freshness: the same tables the DB check reads are watched here, so
 * the busy markers refresh exactly like the rest of the shifts data does.
 *
 * `shifts` is watched via the broadcast channel (trigger
 * public.broadcast_shift_change, payload { id, event_type }) rather than
 * postgres_changes: postgres_changes would ship every column of the changed
 * row -- including `rate` -- to whoever is subscribed. This hook only needs a
 * ping to invalidate, so there is no reason to have row data on the wire.
 * shift_additional_guides carries no customer pricing, so it stays on
 * postgres_changes.
 */
function useBusyRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const invalidate = () => void qc.invalidateQueries({ queryKey: [BUSY_KEY] });
    const offShifts = onShiftChange(invalidate);
    const channel = supabase
      .channel(`busy-guides-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_additional_guides" },
        invalidate,
      )
      .subscribe();
    return () => {
      offShifts();
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}


/** Guides who already have a live overlapping commitment for this shift's window. */
export function useBusyGuides(shift: ShiftWindow | null | undefined): BusyMap {
  useBusyRealtime();
  const { data } = useQuery({
    queryKey: [BUSY_KEY, shift?.date, shift?.startTime, shift?.endTime, shift?.id ?? null],
    queryFn: () => fetchBusyGuides(shift as ShiftWindow),
    enabled: !!shift,
    staleTime: 15_000,
  });
  return data ?? EMPTY_BUSY;
}

/** Same, for a batch of shifts (bulk dispatch). Keyed by shift id. */
export function useBusyGuidesForShifts(shifts: ShiftWindow[]): Map<string, BusyMap> {
  useBusyRealtime();
  const sig = shifts.map((s) => `${s.id}|${s.date}|${s.startTime}|${s.endTime}`).join(",");
  const { data } = useQuery({
    queryKey: [BUSY_KEY, "batch", sig],
    queryFn: async () => {
      const entries = await Promise.all(
        shifts.map(async (s) => [s.id ?? "", await fetchBusyGuides(s)] as const),
      );
      return new Map(entries);
    },
    enabled: shifts.length > 0,
    staleTime: 15_000,
  });
  return data ?? new Map();
}

/** Human-readable label for a conflict, used in dropdowns and toasts. */
export function conflictLabel(b: BusyGuide): string {
  return `Busy ${b.startTime}–${b.endTime} · ${b.tourName}`;
}

/**
 * Maps the database trigger's error into a readable message.
 * The trigger raises with SQLSTATE 23P01 (exclusion_violation).
 */
export function guideConflictMessage(error: unknown): string | null {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return null;
  if (e.code === "23P01" || /already booked on/i.test(e.message ?? "")) {
    return e.message ?? "This guide is already booked on an overlapping tour.";
  }
  return null;
}
