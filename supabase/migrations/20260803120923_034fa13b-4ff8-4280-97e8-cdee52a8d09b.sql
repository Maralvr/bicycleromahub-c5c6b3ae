WITH pts AS (
  SELECT id, lower(name) AS name FROM public.rental_points
)
UPDATE public.shifts s
SET rental_point_id = p.id
FROM pts p
WHERE s.source = 'bokun'
  AND s.rental_point_id IS NULL
  AND (s.tour_name ~* '(rental|noleggio|bike point|punto noleggio|bikes at)')
  AND (
    (p.name = 'appia antica' AND s.tour_name ~* '(appia antica|appian way|via appia)')
    OR (p.name = 'lungotevere' AND s.tour_name ~* 'lungotevere')
    OR (p.name = 'piazza venezia' AND s.tour_name ~* 'piazza venezia')
    OR (p.name = 'lungotevere' AND s.tour_name ~* 'Rome Electric & Muscle Rental Bike')
  );