\echo '=== Booking rules ==='

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'rule.student@e.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'rule.other@e.com'),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'rule.office@e.com') on conflict do nothing;

insert into cars_profiles (id, full_name, email, role, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Rule Student','rule.student@e.com','student','active'),
  ('aaaaaaaa-0000-0000-0000-000000000002','Other Student','rule.other@e.com','student','active'),
  ('aaaaaaaa-0000-0000-0000-000000000009','Rule Office','rule.office@e.com','admin','active')
  on conflict do nothing;

\echo 'Defaults as shipped:'
select cars_setting_int('min_rental_hours', 0)   as min_rental_hours,
       cars_setting_int('min_advance_hours', 0)  as min_advance_hours,
       cars_setting_int('payment_hold_hours', 0) as payment_hold_hours;

\echo 'A junk setting falls back to the default rather than erroring:'
insert into cars_settings (key, value) values ('bogus_hours', '"not a number"'::jsonb)
  on conflict (key) do update set value = excluded.value;
select cars_setting_int('bogus_hours', 7) as fell_back_to;

-- ---------------------------------------------------------------------------
\echo ''
\echo '--- Rule 1: minimum rental length (4h) ---'
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public._test_current_user to authenticated;

delete from public._test_current_user;
insert into public._test_current_user values ('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;

do $$
declare v uuid;
begin
  select id into v from cars_vehicles order by sort_order limit 1;
  begin
    insert into cars_reservations (user_id, vehicle_id, starts_at, ends_at, purpose,
                                   hourly_rate_cents, time_charge_cents, total_cents)
    values (auth.uid(), v, now() + interval '2 days', now() + interval '2 days 2 hours',
            'Too short', 1500, 3000, 3000);
    raise exception 'SHORT RENTAL ALLOWED -- rule 1 is not working';
  exception when raise_exception then
    if sqlerrm like '%at least 4 hours%' then raise notice 'PASS: 2h rental rejected';
    else raise; end if;
  end;
end $$;

\echo 'A 4 hour rental is accepted:'
insert into cars_reservations (user_id, vehicle_id, starts_at, ends_at, purpose,
                               hourly_rate_cents, time_charge_cents, total_cents)
select auth.uid(), v.id, now() + interval '2 days', now() + interval '2 days 4 hours',
       'Long enough', 1500, 6000, 6000
  from cars_vehicles v order by sort_order limit 1;
\echo 'accepted'

-- ---------------------------------------------------------------------------
\echo ''
\echo '--- Rule 3: two hours notice ---'
do $$
declare v uuid;
begin
  select id into v from cars_vehicles order by sort_order offset 1 limit 1;
  begin
    insert into cars_reservations (user_id, vehicle_id, starts_at, ends_at, purpose,
                                   hourly_rate_cents, time_charge_cents, total_cents)
    values (auth.uid(), v, now() + interval '30 minutes', now() + interval '6 hours',
            'Too soon', 1500, 9000, 9000);
    raise exception 'LAST MINUTE BOOKING ALLOWED -- rule 3 is not working';
  exception when raise_exception then
    if sqlerrm like '%at least 2 hours ahead%' then raise notice 'PASS: 30-minute notice rejected';
    else raise; end if;
  end;
end $$;

\echo ''
\echo '--- Reason for the trip is required ---'
do $$
declare v uuid;
begin
  select id into v from cars_vehicles order by sort_order offset 1 limit 1;
  begin
    insert into cars_reservations (user_id, vehicle_id, starts_at, ends_at, purpose,
                                   hourly_rate_cents, time_charge_cents, total_cents)
    values (auth.uid(), v, now() + interval '3 days', now() + interval '3 days 5 hours',
            '', 1500, 7500, 7500);
    raise exception 'BLANK REASON ALLOWED -- guard is not working';
  exception when raise_exception then
    if sqlerrm like '%reason for the trip is required%' then raise notice 'PASS: blank reason rejected';
    else raise; end if;
  end;
end $$;

\echo 'The office is exempt -- they take bookings by phone:'
reset role;
delete from public._test_current_user;
insert into public._test_current_user values ('aaaaaaaa-0000-0000-0000-000000000009');
set role authenticated;
insert into cars_reservations (user_id, vehicle_id, starts_at, ends_at, purpose, status,
                               hourly_rate_cents, time_charge_cents, total_cents)
select 'aaaaaaaa-0000-0000-0000-000000000001', v.id,
       now() + interval '10 minutes', now() + interval '1 hour', '', 'approved', 1500, 1500, 1500
  from cars_vehicles v order by sort_order offset 1 limit 1;
\echo 'office booking accepted despite being short, last-minute and reasonless'
reset role;

-- ---------------------------------------------------------------------------
\echo ''
\echo '--- Rule 2: the car goes back into inventory after 12 unpaid hours ---'
delete from cars_reservations;
delete from public._test_current_user;

insert into cars_reservations (user_id, vehicle_id, starts_at, ends_at, purpose, status,
                               requested_at, hourly_rate_cents, time_charge_cents, total_cents)
select 'aaaaaaaa-0000-0000-0000-000000000001', v.id,
       '2027-08-10 09:00-04', '2027-08-10 17:00-04', 'Shabbos', 'pending',
       now() - interval '1 hour', 1500, 9000, 9000
  from cars_vehicles v order by sort_order limit 1;

\echo 'One hour after requesting, unpaid -- car is held for them:'
select v.name, a.is_available, a.reason
  from cars_availability('2027-08-10 10:00-04','2027-08-10 12:00-04') a
  join cars_vehicles v on v.id = a.vehicle_id where v.sort_order = 1;

\echo 'Thirteen hours after requesting, still unpaid -- car returns to inventory:'
update cars_reservations set requested_at = now() - interval '13 hours';
select v.name, a.is_available, a.reason
  from cars_availability('2027-08-10 10:00-04','2027-08-10 12:00-04') a
  join cars_vehicles v on v.id = a.vehicle_id where v.sort_order = 1;

\echo 'but the reservation itself is still pending, not cancelled:'
select status, payment_received_at is null as unpaid from cars_reservations;

\echo 'Payment lands at hour 16 -- the car is theirs again:'
insert into cars_payments (user_id, reservation_id, amount_cents, method)
select 'aaaaaaaa-0000-0000-0000-000000000001', id, 9000, 'cash' from cars_reservations;

select v.name, a.is_available, a.reason
  from cars_availability('2027-08-10 10:00-04','2027-08-10 12:00-04') a
  join cars_vehicles v on v.id = a.vehicle_id where v.sort_order = 1;

\echo 'and the reservation is marked paid:'
select payment_received_at is not null as paid from cars_reservations;

\echo 'Removing the payment marks it unpaid again and frees the car:'
delete from cars_payments;
select (select payment_received_at is null from cars_reservations) as unpaid_again,
       (select is_available from cars_availability('2027-08-10 10:00-04','2027-08-10 12:00-04') a
         join cars_vehicles v on v.id = a.vehicle_id where v.sort_order = 1) as car_free;

\echo 'The office can change the window, and availability follows:'
update cars_settings set value = '24'::jsonb where key = 'payment_hold_hours';
select v.name, a.is_available, a.reason
  from cars_availability('2027-08-10 10:00-04','2027-08-10 12:00-04') a
  join cars_vehicles v on v.id = a.vehicle_id where v.sort_order = 1;
update cars_settings set value = '12'::jsonb where key = 'payment_hold_hours';

\echo 'A lapsed pending request does not stop somebody else being approved:'
insert into cars_reservations (user_id, vehicle_id, starts_at, ends_at, purpose, status,
                               hourly_rate_cents, time_charge_cents, total_cents)
select 'aaaaaaaa-0000-0000-0000-000000000002', v.id,
       '2027-08-10 09:00-04', '2027-08-10 17:00-04', 'Wedding', 'approved', 1500, 9000, 9000
  from cars_vehicles v order by sort_order limit 1;
\echo 'PASS: second student got the car'

\echo 'A student cannot mark their own reservation paid:'
insert into public._test_current_user values ('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
update cars_reservations set payment_received_at = now() where user_id = auth.uid();
select payment_received_at is null as still_unpaid from cars_reservations where user_id = auth.uid();
reset role;
