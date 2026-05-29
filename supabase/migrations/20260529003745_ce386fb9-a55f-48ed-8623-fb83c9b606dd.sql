-- Dedupe: keep the best row per (source, booking_id)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY source, booking_id
           ORDER BY (assigned_staff_id IS NOT NULL) DESC,
                    updated_at DESC,
                    created_at DESC
         ) AS rn
  FROM public.shifts
  WHERE booking_id IS NOT NULL
)
DELETE FROM public.shifts s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS shifts_source_booking_id_key
  ON public.shifts (source, booking_id)
  WHERE booking_id IS NOT NULL;