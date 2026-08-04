-- Broadcast-from-database notifier for public.shifts.
-- Rationale: postgres_changes streams the FULL row to every subscriber whose RLS
-- allows the change; RLS cannot mask columns on that path. Rental staff therefore
-- received the real `rate` (what the customer paid) on every live INSERT/UPDATE,
-- bypassing public.shifts_rental_view's masking. This broadcast carries only
-- {id, event_type} -- no row columns -- so there is nothing to leak; clients
-- re-read from the masked view.

CREATE OR REPLACE FUNCTION public.broadcast_shift_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id;
  ELSE
    v_id := NEW.id;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object('id', v_id, 'event_type', lower(TG_OP)),
    'shift_change',
    'shifts-changes',
    false  -- public topic: payload intentionally contains no booking data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_shift_change ON public.shifts;
CREATE TRIGGER trg_broadcast_shift_change
AFTER INSERT OR UPDATE OR DELETE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.broadcast_shift_change();