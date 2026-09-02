-- ============================================================================
-- YGEP Car Rental -- starting data
--
-- Everything here is editable from the admin portal. These are sensible
-- defaults so the office has something to work with on day one, not fixed
-- values. Toll figures are ESTIMATES for a round trip out of Elkins Park and
-- should be reviewed by the office before students see them.
--
-- Safe to re-run: seeds only insert when the table is still empty.
-- ============================================================================

insert into cars_vehicles
  (name, year, make, model, color, image_url, seats,
   hourly_rate_cents, daily_cap_cents, minimum_hours, sort_order)
select * from (values
  ('2023 Subaru Legacy',  2023, 'Subaru', 'Legacy',  'Blue',
   '/cars/subaru_legacy_blue.jpg',  5, 1500, 9000, 1.0, 1),
  ('2024 Toyota Corolla', 2024, 'Toyota', 'Corolla', 'White',
   '/cars/toyota_corolla_white.jpg', 5, 1500, 9000, 1.0, 2)
) as v(name, year, make, model, color, image_url, seats,
       hourly_rate_cents, daily_cap_cents, minimum_hours, sort_order)
where not exists (select 1 from cars_vehicles);

insert into cars_destinations (name, toll_cents, description, sort_order)
select * from (values
  ('Local / Philadelphia area',        0,    'No tolls expected.',                            1),
  ('Philadelphia Airport (PHL)',       0,    'I-95 south, no tolls.',                         2),
  ('Cherry Hill / South Jersey',       600,  'Ben Franklin or Betsy Ross Bridge, round trip.',3),
  ('Scranton / Poconos, PA',           1000, 'Northeast Extension, round trip.',              4),
  ('Baltimore, MD',                    1600, 'I-95 Delaware and Maryland tolls, round trip.', 5),
  ('Lakewood, NJ',                     1800, 'NJ Turnpike, round trip.',                      6),
  ('Monsey / Rockland County, NY',     3000, 'NJ Turnpike and Tappan Zee, round trip.',       7),
  ('Brooklyn / Queens, NY',            3500, 'Turnpike plus Verrazzano or Goethals crossing.',8),
  ('Manhattan, NY',                    4500, 'Turnpike plus Hudson River crossing and CBD toll.', 9),
  ('Other (office will confirm)',      0,    'Tell us where you are heading in the notes.',  99)
) as d(name, toll_cents, description, sort_order)
where not exists (select 1 from cars_destinations);

insert into cars_settings (key, value) values
  ('org_name',              '"Yeshiva Gedolah of Elkins Park"'::jsonb),
  ('timezone',              '"America/New_York"'::jsonb),
  ('min_booking_hours',     '1'::jsonb),
  ('max_booking_days',      '14'::jsonb),
  ('max_advance_days',      '120'::jsonb),
  ('pending_blocks_car',    'true'::jsonb),
  ('auto_approve_accounts', 'false'::jsonb),
  ('office_email',          '""'::jsonb),
  ('office_phone',          '""'::jsonb),
  ('booking_notice',        '"Requests are reviewed by the office. You will get an email once yours is approved."'::jsonb)
on conflict (key) do nothing;
