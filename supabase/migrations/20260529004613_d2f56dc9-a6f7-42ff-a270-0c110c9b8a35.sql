-- Drop the partial unique index and recreate it without WHERE clause
-- so Supabase .upsert() with onConflict='source,booking_id' works.
DROP INDEX IF EXISTS shifts_source_booking_id_key;

CREATE UNIQUE INDEX shifts_source_booking_id_key
ON public.shifts (source, booking_id);
