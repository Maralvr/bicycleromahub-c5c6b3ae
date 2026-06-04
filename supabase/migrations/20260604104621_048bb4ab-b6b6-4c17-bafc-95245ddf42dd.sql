CREATE TABLE public.guide_payout_rates (
  product_id text PRIMARY KEY,
  title text NOT NULL,
  tier1 numeric NOT NULL,
  tier2 numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guide_payout_rates TO authenticated;
GRANT ALL ON public.guide_payout_rates TO service_role;

ALTER TABLE public.guide_payout_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY gpr_select ON public.guide_payout_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY gpr_admin_write ON public.guide_payout_rates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER guide_payout_rates_updated_at BEFORE UPDATE ON public.guide_payout_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.guide_payout_rates (product_id, title, tier1, tier2) VALUES
  ('244748', 'Appia Antica and Catacombs by ebike: guided tour with Private Transfer from Circus Maximus', 80.0, 70.0),
  ('244749', 'Villa Borghese: guided ebike tour to discover the green soul of Rome', 60.0, 60.0),
  ('244753', 'Rome at sunset is magic on two wheels', 80.0, 70.0),
  ('244754', 'Castelli Romani Day Trip: Castel Gandolfo and Nemi', 100.0, 100.0),
  ('244755', 'Rome E-Bike Highlights Tour & Tasting in Secret Cave', 80.0, 70.0),
  ('244757', 'Bike excursion between history and vineyards: discovering Frascati', 100.0, 100.0),
  ('244758', 'Rome by E-bike: the guided tour of the city center', 80.0, 70.0),
  ('244759', 'Appia Antica and Castel Gandolfo: day trip to discover an unseen face of Rome and the Castelli Romani', 100.0, 100.0),
  ('594774', 'Appia Antica, Aqueduct Park and Catacombs: a ride between history and nature', 80.0, 70.0),
  ('640230', 'In Rome like a star: e-bike tour with photo shoot', 80.0, 70.0),
  ('703565', 'Appia Antica and Rome''s Underground Labyrinth by Ebike: an experience between light and shadow without comparison', 80.0, 70.0),
  ('734006', 'Unexpected Rome: cycle between Villa Borghese and Villa Ada, discover the magic of the Coppedè district', 80.0, 70.0),
  ('741648', 'Rome from the Tiber: cycling tour through history and beauty', 60.0, 60.0),
  ('845176', 'The Eternal City: 3-Day E-Bike Journey with Catacombs & Low-Effort Exploring', 240.0, 210.0),
  ('852475', '2-Day Tour of Rome Center and Appia Antica by E Bike', 160.0, 140.0),
  ('876900', 'E-Bike Appian Way: Aqueducts & Cecilia Metella Mausoleum VR', 80.0, 70.0),
  ('946438', 'Orvieto & Civita E-Bike Tour w/ Private Transfer from Rome', 150.0, 150.0),
  ('947500', 'Rome''s Volcanic Escape: 3-Day No-Stress E-Bike Tour (Castel Gandolfo & Frascati)', 300.0, 300.0),
  ('947660', 'Tuscany Experience: Siena, Chianti, Florence', 450.0, 450.0),
  ('948630', 'Umbria in Slow Motion: 3-Day E-Bike Escape to Assisi & Spello (Low-Effort Hills)', 450.0, 450.0),
  ('949179', 'Val d''Orcia Masterpiece: E-Bike, Brunello & UNESCO Views', 450.0, 450.0),
  ('949202', 'Costa dei Trabocchi: E-Bike, Sunset, and Aperitivo Suspended Over the Sea', 260.0, 260.0),
  ('950442', 'Gran Sasso by E-Bike: Villages, Mountain, and Canoeing on the Tirino River', 390.0, 390.0),
  ('950449', 'The Trulli Magic: No-Stress E-Bike Tour of Puglia''s White Villages', 750.0, 750.0),
  ('969330', 'Calabria: The Low-Effort Adventure (E-Bike, Tropea & Sila Park)', 750.0, 750.0),
  ('969335', 'Apulia & Basilicata: Flavors and Beauties of the Alta Murgia', 600.0, 600.0),
  ('970423', 'Rome: Orvieto and Civita di Bagnoregio Day Trip by Train', 150.0, 150.0),
  ('971557', 'Rome: Castelli Romani Day Trip by Train and E-Bike', 100.0, 100.0),
  ('978304', 'EF Villa Borghese 1 ora', 60.0, 60.0),
  ('980307', '5-Day Premium E-Bike Tour: Rome, Florence & Chianti with Private Transfers', 540.0, 510.0),
  ('982124', 'Rome 3Days Tour to Discover all the Secrets of the Capital', 240.0, 210.0),
  ('982452', '5-Day Premium E-Bike Tour: Rome & Umbria Highlights with Private Transfers', 540.0, 510.0),
  ('1124637', 'Orvieto & Civita Private E-Bike Tour from Rome', 150.0, 150.0),
  ('1124639', 'Orvieto & Civita Public E-Bike Tour from Rome', 150.0, 150.0),
  ('1124642', 'Public E-Bike Tour of Appian Way: Aqueducts & Cecilia Metella Mausoleum VR', 80.0, 70.0),
  ('1124644', 'Private E-Bike Tour of Appian Way: Aqueducts & Cecilia Metella Mausoleum VR', 80.0, 70.0),
  ('1124652', 'Rome from the Tiber: cycling public tour through history and beauty', 60.0, 60.0),
  ('1124654', 'Rome from the Tiber: cycling private tour through history and beauty', 60.0, 60.0),
  ('1124657', 'Villa Borghese, Villa Ada & Coppedè district public e-bike tour', 80.0, 70.0),
  ('1124658', 'Villa Borghese, Villa Ada & Coppedè district private e-bike tour', 80.0, 70.0),
  ('1124659', 'Appia Antica, Aqueducts and Rome''s Underground Labyrinth public e-bike tour', 80.0, 70.0),
  ('1124660', 'Appia Antica, Aqueducts and Rome''s Underground Labyrinth private e-bike tour', 80.0, 70.0),
  ('1124664', 'Appia Antica, Aqueduct Park and Catacombs public e-bike tour', 80.0, 70.0),
  ('1124674', 'Appia Antica, Aqueduct Park and Catacombs private e-bike tour', 80.0, 70.0),
  ('1124675', 'Appia Antica and Castel Gandolfo: day trip to discover an unseen face of Rome and the Castelli Romani (Public Tour)', 100.0, 100.0),
  ('1124677', 'Appia Antica and Castel Gandolfo: day trip to discover an unseen face of Rome and the Castelli Romani (Private Tour)', 100.0, 100.0),
  ('1124678', 'Best of Rome by E-Bike: Guided City Center Public Tour', 80.0, 70.0),
  ('1124679', 'Best of Rome by E-Bike: Guided City Center Private Tour', 80.0, 70.0),
  ('1124680', 'Frascati e-Bike Tour: History & Vineyard Excursion (Small Group)', 100.0, 100.0),
  ('1124681', 'Frascati Private e-Bike Tour: History & Vineyard Excursion', 100.0, 100.0),
  ('1124682', 'Rome E-Bike Highlights Tour & Tasting in Secret Cave (Public Tour)', 80.0, 70.0),
  ('1124683', 'Rome E-Bike Highlights Private Tour & Tasting in Secret Cave', 80.0, 70.0),
  ('1124684', 'Castelli Romani Public E-bike Day Trip: Castel Gandolfo and Nemi', 100.0, 100.0),
  ('1124685', 'Castelli Romani Private Day Trip by E-Bike and Train: Castel Gandolfo and Nemi', 100.0, 100.0),
  ('1124688', 'Rome by Night Public E-Bike Tour: Sunset Magic', 80.0, 70.0),
  ('1124689', 'Rome by Night Private E-Bike Tour: Sunset Magic', 80.0, 70.0),
  ('1124693', 'Villa Borghese: public e-bike tour to discover the green soul of Rome', 60.0, 60.0),
  ('1124694', 'Villa Borghese: private e-bike tour to discover the green soul of Rome', 60.0, 60.0),
  ('1124695', 'Appia Antica, Aqueducts and Catacombs by ebike: guided tour with Private Transfer from Circus Maximus', 80.0, 70.0),
  ('1124697', 'Appia Antica, Aqueducts and Catacombs by ebike: Private tour with Transfer included from Circus Maximus', 80.0, 70.0),
  ('1141999', 'Rome by E-bike: the guided tour of the city center', 80.0, 70.0),
  ('1142001', 'Appia Antica and Catacombs by ebike: guided tour with Private Transfer from Circus Maximus', 80.0, 70.0),
  ('1142002', 'Appia Antica, Aqueduct Park and Catacombs: a ride between history and nature', 80.0, 70.0),
  ('1142003', 'Villa Borghese: guided ebike tour to discover the green soul of Rome', 60.0, 60.0),
  ('1142004', 'Rome E-Bike Highlights Tour & Tasting in Secret Cave', 80.0, 70.0),
  ('1165741', 'Appia Antica, Aqueduct Park and Catacombs e-Bike tour', 80.0, 70.0),
  ('1165817', 'Appia Antica, Aqueducts and Rome''s Underground Labyrinth e-Bike tour', 80.0, 70.0),
  ('1165823', 'Appian Way, Aqueducts & Cecilia Metella Mausoleum VR by E-Bike', 80.0, 70.0),
  ('1211768', 'Best of Rome by E-Bike (Small Group up to 8 people or Private tour)', 80.0, 70.0),
  ('1211770', 'Rome City Center E-Bike Tour & Tasting in Secret Cave', 80.0, 70.0),
  ('1211771', 'Rome from the Tiber: cycling along the cycle path to Basilica San Paolo', 60.0, 60.0),
  ('1211780', 'Appia Antica, Aqueduct Park and Catacombs E-Bike tour', 80.0, 70.0),
  ('1211790', 'Unexpected Rome: Villa Borghese, Villa Ada and Coppedè district', 80.0, 70.0),
  ('1211795', 'Villa Borghese e-Bike tour', 80.0, 70.0),
  ('1215452', 'Tour di 2 Giorni a Roma Centro e Appia Antica in E Bike ', 60.0, 60.0)
ON CONFLICT (product_id) DO UPDATE SET title = EXCLUDED.title, tier1 = EXCLUDED.tier1, tier2 = EXCLUDED.tier2;

ALTER TABLE public.shifts
  ADD COLUMN bokun_product_id text,
  ADD COLUMN payout_tier smallint CHECK (payout_tier IN (1, 2)),
  ADD COLUMN payout_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN payout_paid_at timestamptz,
  ADD COLUMN payout_paid_by uuid;

CREATE INDEX shifts_bokun_product_id_idx ON public.shifts(bokun_product_id);
CREATE INDEX shifts_payout_paid_idx ON public.shifts(payout_paid) WHERE payout_paid = false;

UPDATE public.shifts s
SET bokun_product_id = r.product_id
FROM public.guide_payout_rates r
WHERE s.bokun_product_id IS NULL
  AND s.source = 'bokun'
  AND trim(lower(s.tour_name)) = trim(lower(r.title));