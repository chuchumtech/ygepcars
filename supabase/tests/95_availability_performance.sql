\echo '=== Availability performance ==='
--
-- The unpaid-hold rule is evaluated on read rather than swept by a cron job.
-- That is only a good trade if reading stays cheap, so this file guards the two
-- things that made it expensive the first time round: a settings lookup per
-- row, and no range index covering pending reservations.
--
-- Run this on a scratch database. It inserts thousands of rows.
--
-- Start from nobody signed in: the booking rules only apply to students, so an
-- earlier file's session user would make these backdated rows illegal.
delete from public._test_current_user;

insert into auth.users (id, email) values ('bbbbbbbb-0000-0000-0000-000000000001','bench@e.com')
  on conflict do nothing;
insert into cars_profiles (id, full_name, email, role, status)
  values ('bbbbbbbb-0000-0000-0000-000000000001','Bench Student','bench@e.com','student','active')
  on conflict do nothing;

-- Roughly five years of a two-car yeshiva at ten rentals a week.
insert into cars_reservations
  (user_id, vehicle_id, starts_at, ends_at, status, purpose, requested_at,
   hourly_rate_cents, time_charge_cents, total_cents)
select 'bbbbbbbb-0000-0000-0000-000000000001', v.id, ts, ts + interval '6 hours',
       (array['completed','completed','completed','cancelled','declined','pending'])[1 + (n % 6)],
       'bench', ts - interval '2 days', 1500, 9000, 9000
  from generate_series(1, 2600) as n,
       lateral (select (timestamptz '2021-01-01 08:00-05' + (n * interval '17 hours')) as ts) t,
       lateral (select id from cars_vehicles order by sort_order offset (n % 2) limit 1) v
on conflict do nothing;

analyze cars_reservations;

\echo 'Rows in play:'
select count(*) as reservations, count(*) filter (where status = 'pending') as pending
  from cars_reservations;

\echo ''
\echo 'The blocking predicate must use the range index, not a sequential scan.'
\echo 'Look for "Index Scan using cars_reservations_blocking_range_idx" below:'
explain (analyze, timing off, costs off)
select r.status
  from cars_reservations r
 where r.vehicle_id = (select id from cars_vehicles order by sort_order limit 1)
   and r.status in ('pending','hold','approved','completed')
   and tstzrange(r.starts_at, r.ends_at, '[)')
       && tstzrange('2023-06-10 09:00-04','2023-06-10 17:00-04','[)')
   and (r.status <> 'pending'
        or r.payment_received_at is not null
        or r.requested_at > cars_unpaid_hold_cutoff())
 limit 1;

\echo ''
\echo 'The hold cutoff takes no arguments, so it is evaluated once per query'
\echo 'rather than once per reservation:'
select cars_unpaid_hold_cutoff() as cutoff,
       cars_unpaid_hold_cutoff() < now() as is_in_the_past;

\echo ''
\echo 'Two hundred availability checks in a row:'
\timing on
select count(*) from generate_series(1,200) g,
  lateral cars_availability('2023-06-10 09:00-04'::timestamptz + (g * interval '1 day'),
                            '2023-06-10 17:00-04'::timestamptz + (g * interval '1 day')) a;
\timing off

\echo ''
\echo 'For reference, the measurement taken when this was written:'
\echo '  before: ~2600 ms for a single check, sequential scan'
\echo '  after:  ~2 ms for a single check, index scan'
\echo 'Anything in the hundreds of milliseconds means the index or the cutoff'
\echo 'function has regressed.'
