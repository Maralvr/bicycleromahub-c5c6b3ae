-- Restrict rental_point_id to shifts that match the 8 approved Bokun rental
-- product IDs. Since shifts don't store the product_id, match by their
-- canonical tour titles. Anything else gets rental_point_id cleared so it
-- shows up in the regular Shifts/Calendar views again.

SET session_replication_role = replica;

UPDATE public.shifts
SET rental_point_id = NULL
WHERE rental_point_id IS NOT NULL
  AND lower(tour_name) NOT IN (
    -- Appia Antica rentals (692119, 244760, 969081, 969329)
    lower('Regular Bikes at Appia Antica'),
    lower('Electric Bike Rental at Appia Antica'),
    lower('Appian Way Bike Rental: from 2h to 6h'),
    lower('Noleggio Biciclette Tradizionali sull''Appia Antica'),
    lower('Noleggio Biciclette Elettriche sull''Appia Antica'),
    lower('Appia Antica Bike Point'),
    lower('Punto Noleggio Bici Appia Antica'),
    -- Lungotevere rentals (692101, 969398, 244761)
    lower('Regular Bikes at Lungotevere'),
    lower('Electric Bike Rental at Lungotevere'),
    lower('Noleggio Biciclette Tradizionali sul Lungotevere'),
    lower('Noleggio Biciclette Elettriche sul Lungotevere'),
    -- Piazza Venezia rental (692129)
    lower('Electric Bikes at Piazza Venezia'),
    lower('Noleggio Biciclette Elettriche a Piazza Venezia')
  );

SET session_replication_role = DEFAULT;
