SET session_replication_role = replica;

UPDATE public.shifts
SET rental_point_id = NULL
WHERE rental_point_id IS NOT NULL
  AND lower(tour_name) NOT IN (
    lower('Regular Bikes at Appia Antica'),
    lower('Electric Bike Rental at Appia Antica'),
    lower('Appian Way Bike Rental: from 2h to 6h'),
    lower('Noleggio Biciclette Tradizionali sull''Appia Antica'),
    lower('Noleggio Biciclette Elettriche sull''Appia Antica'),
    lower('Appia Antica Bike Point'),
    lower('Punto Noleggio Bici Appia Antica'),
    lower('Regular Bikes at Lungotevere'),
    lower('Electric Bike Rental at Lungotevere'),
    lower('Noleggio Biciclette Tradizionali sul Lungotevere'),
    lower('Noleggio Biciclette Elettriche sul Lungotevere'),
    lower('Electric Bikes at Piazza Venezia'),
    lower('Noleggio Biciclette Elettriche a Piazza Venezia')
  );

SET session_replication_role = DEFAULT;