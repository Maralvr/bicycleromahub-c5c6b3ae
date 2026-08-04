CREATE OR REPLACE FUNCTION public.rental_staff_day_amounts(_from date, _to date)
 RETURNS TABLE(rental_staff_id uuid, date date, shift_count integer, amount numeric, paid boolean, paid_at timestamp with time zone, frozen_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           -- Double-shift day overrides both pay models when configured
           -- (and, if a season window is set, only inside that window).
           WHEN d.shift_count >= 2
             AND s.double_shift_rate IS NOT NULL
             AND (
               s.double_shift_season_start IS NULL
               OR s.double_shift_season_end IS NULL
               OR (to_char(d.date, 'MM-DD') >= s.double_shift_season_start
                   AND to_char(d.date, 'MM-DD') <= s.double_shift_season_end)
             )
             THEN s.double_shift_rate
           WHEN EXISTS (SELECT 1 FROM public.rental_staff_shift_rates x WHERE x.rental_staff_id = d.rental_staff_id)
             THEN COALESCE(d.rated_sum, 0)
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
$function$;