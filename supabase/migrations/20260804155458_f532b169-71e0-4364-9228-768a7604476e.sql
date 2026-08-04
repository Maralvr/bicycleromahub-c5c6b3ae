-- 1. assignment time range + relaxed uniqueness
ALTER TABLE public.rental_point_day_assignments
  ADD COLUMN IF NOT EXISTS shift_start_time time,
  ADD COLUMN IF NOT EXISTS shift_end_time time;

ALTER TABLE public.rental_point_day_assignments
  DROP CONSTRAINT IF EXISTS rental_point_day_assignments_rental_point_id_rental_staff_i_key;

CREATE UNIQUE INDEX IF NOT EXISTS rpda_point_staff_date_range_key
  ON public.rental_point_day_assignments (
    rental_point_id, rental_staff_id, date,
    COALESCE(shift_start_time, '00:00'::time),
    COALESCE(shift_end_time, '00:00'::time)
  );

-- 2. rental_staff rate config columns
ALTER TABLE public.rental_staff
  ADD COLUMN IF NOT EXISTS default_shift_rate numeric,
  ADD COLUMN IF NOT EXISTS double_shift_rate numeric,
  ADD COLUMN IF NOT EXISTS double_shift_season_start text,
  ADD COLUMN IF NOT EXISTS double_shift_season_end text;

-- 3. per-time-range rates
CREATE TABLE IF NOT EXISTS public.rental_staff_shift_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rental_staff_id uuid NOT NULL REFERENCES public.rental_staff(id) ON DELETE CASCADE,
  shift_start_time time NOT NULL,
  shift_end_time time NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rental_staff_id, shift_start_time, shift_end_time)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_staff_shift_rates TO authenticated;
GRANT ALL ON public.rental_staff_shift_rates TO service_role;
ALTER TABLE public.rental_staff_shift_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rssr_select" ON public.rental_staff_shift_rates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_rental_staff(auth.uid()));
CREATE POLICY "rssr_write" ON public.rental_staff_shift_rates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_rental_staff(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_rental_staff(auth.uid()));

CREATE TRIGGER rssr_updated_at BEFORE UPDATE ON public.rental_staff_shift_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. day-level payouts
CREATE TABLE IF NOT EXISTS public.rental_staff_day_payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rental_staff_id uuid NOT NULL REFERENCES public.rental_staff(id) ON DELETE CASCADE,
  date date NOT NULL,
  amount numeric,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rental_staff_id, date)
);

GRANT SELECT ON public.rental_staff_day_payouts TO authenticated;
GRANT ALL ON public.rental_staff_day_payouts TO service_role;
ALTER TABLE public.rental_staff_day_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rsdp_select" ON public.rental_staff_day_payouts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_rental_staff(auth.uid()));

CREATE TRIGGER rsdp_updated_at BEFORE UPDATE ON public.rental_staff_day_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. computation helper
CREATE OR REPLACE FUNCTION public.rental_staff_day_amounts(_from date, _to date)
RETURNS TABLE(
  rental_staff_id uuid,
  date date,
  shift_count integer,
  amount numeric,
  paid boolean,
  paid_at timestamptz,
  frozen_amount numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH days AS (
    SELECT a.rental_staff_id, a.date,
           COUNT(*)::int AS shift_count,
           SUM(r.amount) AS rated_sum,
           COUNT(r.id)::int AS rated_count
      FROM public.rental_point_day_assignments a
      LEFT JOIN public.rental_staff_shift_rates r
        ON r.rental_staff_id = a.rental_staff_id
       AND r.shift_start_time = a.shift_start_time
       AND r.shift_end_time = a.shift_end_time
     WHERE a.status = 'accepted'
       AND a.cancelled_at IS NULL
       AND a.date BETWEEN _from AND _to
     GROUP BY a.rental_staff_id, a.date
  )
  SELECT d.rental_staff_id, d.date, d.shift_count,
         CASE
           WHEN EXISTS (SELECT 1 FROM public.rental_staff_shift_rates x WHERE x.rental_staff_id = d.rental_staff_id)
             THEN COALESCE(d.rated_sum, 0)
           WHEN d.shift_count >= 2
             AND s.double_shift_rate IS NOT NULL
             AND s.double_shift_season_start IS NOT NULL
             AND s.double_shift_season_end IS NOT NULL
             AND to_char(d.date, 'MM-DD') >= s.double_shift_season_start
             AND to_char(d.date, 'MM-DD') <= s.double_shift_season_end
             THEN s.double_shift_rate
           ELSE d.shift_count * COALESCE(s.default_shift_rate, 0)
         END AS amount,
         COALESCE(p.paid, false) AS paid,
         p.paid_at,
         p.amount AS frozen_amount
    FROM days d
    JOIN public.rental_staff s ON s.id = d.rental_staff_id
    LEFT JOIN public.rental_staff_day_payouts p
      ON p.rental_staff_id = d.rental_staff_id AND p.date = d.date
   WHERE public.has_role(auth.uid(), 'admin') OR public.is_rental_staff(auth.uid())
$$;

-- 6. guarded mark-as-paid
CREATE OR REPLACE FUNCTION public.set_rental_staff_day_payout(
  _rental_staff_id uuid, _date date, _paid boolean, _amount numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_rental_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.rental_staff_day_payouts (rental_staff_id, date, amount, paid, paid_at, paid_by)
  VALUES (_rental_staff_id, _date,
          CASE WHEN _paid THEN _amount ELSE NULL END,
          _paid,
          CASE WHEN _paid THEN now() ELSE NULL END,
          CASE WHEN _paid THEN auth.uid() ELSE NULL END)
  ON CONFLICT (rental_staff_id, date) DO UPDATE
    SET amount = CASE WHEN _paid THEN _amount ELSE NULL END,
        paid = _paid,
        paid_at = CASE WHEN _paid THEN now() ELSE NULL END,
        paid_by = CASE WHEN _paid THEN auth.uid() ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.rental_staff_day_amounts(date, date) FROM anon;
REVOKE ALL ON FUNCTION public.set_rental_staff_day_payout(uuid, date, boolean, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.rental_staff_day_amounts(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_rental_staff_day_payout(uuid, date, boolean, numeric) TO authenticated;