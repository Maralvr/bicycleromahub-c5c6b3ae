import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Single shared subscriber for the `shifts-changes` broadcast topic.
 *
 * Realtime broadcast is topic-based, so every listener must use a channel
 * literally named `shifts-changes` (see trigger public.broadcast_shift_change).
 * supabase-js keeps one channel instance per topic, so multiple components
 * calling `supabase.channel("shifts-changes").on(...).subscribe()` blew up with
 * "cannot add `postgres_changes` callbacks for realtime:shifts-changes after
 * `subscribe()`", and whichever component unmounted first tore the channel out
 * from under the others. This module owns the channel and fans the payload out
 * to every registered listener, with ref-counted teardown.
 */

export type ShiftChangePayload = { id?: string; event_type?: string };

type Listener = (payload: ShiftChangePayload | undefined) => void;

const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;

export function onShiftChange(listener: Listener): () => void {
  listeners.add(listener);
  if (!channel) {
    channel = supabase
      .channel("shifts-changes")
      .on("broadcast", { event: "shift_change" }, (msg) => {
        const payload = (msg as { payload?: ShiftChangePayload }).payload;
        for (const l of Array.from(listeners)) l(payload);
      })
      .subscribe();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && channel) {
      const ch = channel;
      channel = null;
      void supabase.removeChannel(ch);
    }
  };
}
