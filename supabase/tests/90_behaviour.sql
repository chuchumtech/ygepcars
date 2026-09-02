\set ON_ERROR_STOP on
\echo '--- seed landed ---'
select (select count(*) from cars_vehicles) as cars,
       (select count(*) from cars_destinations) as destinations,
       (select count(*) from cars_settings) as settings;

-- Two students and an admin.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'levi@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'yoni@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'office@example.com');

insert into cars_profiles (id, full_name, email, role, status) values
  ('11111111-1111-1111-1111-111111111111', 'Levi Student', 'levi@example.com', 'student', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Yoni Student', 'yoni@example.com', 'student', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'Office Admin', 'office@example.com', 'admin', 'active');

\echo '--- approved reservation blocks an overlapping one ---'
insert into cars_reservations
  (user_id, vehicle_id, starts_at, ends_at, status, hourly_rate_cents, toll_cents, time_charge_cents, total_cents, destination_label)
select '11111111-1111-1111-1111-111111111111', v.id,
       '2026-09-04 18:00-04', '2026-09-06 14:00-04', 'approved', 1500, 1800, 9000, 10800, 'Lakewood, NJ'
  from cars_vehicles v order by sort_order limit 1;

\echo 'expecting an exclusion violation next:'
do $$
declare v uuid;
begin
  select id into v from cars_vehicles order by sort_order limit 1;
  begin
    insert into cars_reservations
      (user_id, vehicle_id, starts_at, ends_at, status, hourly_rate_cents, time_charge_cents, total_cents)
    values ('22222222-2222-2222-2222-222222222222', v,
            '2026-09-05 10:00-04', '2026-09-05 20:00-04', 'approved', 1500, 9000, 9000);
    raise exception 'DOUBLE BOOKING WAS ALLOWED -- constraint is not working';
  exception when exclusion_violation then
    raise notice 'PASS: overlapping approved booking was rejected';
  end;
end $$;

\echo '--- a non-overlapping booking on the same car is fine ---'
insert into cars_reservations
  (user_id, vehicle_id, starts_at, ends_at, status, hourly_rate_cents, time_charge_cents, total_cents)
select '22222222-2222-2222-2222-222222222222', v.id,
       '2026-09-07 09:00-04', '2026-09-07 17:00-04', 'approved', 1500, 9000, 9000
  from cars_vehicles v order by sort_order limit 1;

\echo '--- a cancelled booking does not block ---'
insert into cars_reservations
  (user_id, vehicle_id, starts_at, ends_at, status, hourly_rate_cents, time_charge_cents, total_cents)
select '22222222-2222-2222-2222-222222222222', v.id,
       '2026-09-07 09:00-04', '2026-09-07 17:00-04', 'cancelled', 1500, 9000, 9000
  from cars_vehicles v order by sort_order limit 1;

\echo '--- availability: car 1 taken, car 2 free ---'
select v.name, a.is_available, a.reason
  from cars_availability('2026-09-05 12:00-04', '2026-09-05 16:00-04') a
  join cars_vehicles v on v.id = a.vehicle_id
 order by v.sort_order;

\echo '--- availability: a window with nothing in it ---'
select v.name, a.is_available
  from cars_availability('2026-12-25 12:00-05', '2026-12-25 16:00-05') a
  join cars_vehicles v on v.id = a.vehicle_id
 order by v.sort_order;

\echo '--- a maintenance blackout blocks the car ---'
insert into cars_blackouts (vehicle_id, starts_at, ends_at, reason)
select id, '2026-12-25 08:00-05', '2026-12-26 08:00-05', 'Inspection'
  from cars_vehicles order by sort_order limit 1;

select v.name, a.is_available, a.reason
  from cars_availability('2026-12-25 12:00-05', '2026-12-25 16:00-05') a
  join cars_vehicles v on v.id = a.vehicle_id
 order by v.sort_order;

\echo '--- pending requests show as requested, not booked ---'
insert into cars_reservations
  (user_id, vehicle_id, starts_at, ends_at, status, hourly_rate_cents, time_charge_cents, total_cents)
select '11111111-1111-1111-1111-111111111111', v.id,
       '2027-01-10 09:00-05', '2027-01-10 17:00-05', 'pending', 1500, 9000, 9000
  from cars_vehicles v order by sort_order limit 1;

select v.name, a.is_available, a.reason
  from cars_availability('2027-01-10 12:00-05', '2027-01-10 14:00-05') a
  join cars_vehicles v on v.id = a.vehicle_id
 order by v.sort_order;

\echo '--- balances: charged minus paid ---'
insert into cars_payments (user_id, amount_cents, method)
values ('11111111-1111-1111-1111-111111111111', 5000, 'cash');

select p.full_name, b.charged_cents, b.paid_cents, b.balance_cents, b.reservation_count
  from cars_student_balances b
  join cars_profiles p on p.id = b.user_id
 where p.role = 'student'
 order by p.full_name;

\echo '--- busy windows exposes ranges without naming names ---'
select count(*) as windows from cars_busy_windows('2026-09-01 00:00-04', '2026-09-30 00:00-04');
