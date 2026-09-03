\echo '=== Fuel carry-over, incidents and balances ==='

-- Start from nobody signed in, so the earlier files' session user cannot make
-- the guard trigger pin a value before a constraint gets to reject it.
delete from public._test_current_user;

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000001','one@e.com'),
  ('dddddddd-0000-0000-0000-000000000002','two@e.com'),
  ('dddddddd-0000-0000-0000-000000000009','off@e.com') on conflict do nothing;
insert into cars_profiles (id, first_name, last_name, email, role, status) values
  ('dddddddd-0000-0000-0000-000000000001','Ari','First','one@e.com','student','active'),
  ('dddddddd-0000-0000-0000-000000000002','Bini','Second','two@e.com','student','active'),
  ('dddddddd-0000-0000-0000-000000000009','Ops','Desk','off@e.com','admin','active')
  on conflict do nothing;

\echo 'A car starts full:'
select name, fuel_level from cars_vehicles order by sort_order limit 1;

\echo 'It goes out full and comes back at 5/8 -- the car keeps 5/8:'
insert into cars_reservations
  (user_id, vehicle_id, starts_at, ends_at, status, purpose, fuel_out,
   hourly_rate_cents, time_charge_cents, total_cents)
select 'dddddddd-0000-0000-0000-000000000001', v.id,
       '2027-05-01 09:00-04','2027-05-01 17:00-04','completed','Trip one', 8,
       1500, 9000, 9000
  from cars_vehicles v order by sort_order limit 1;

update cars_reservations set fuel_in = 5, returned_at = '2027-05-01 17:00-04'
 where purpose = 'Trip one';
update cars_vehicles set fuel_level = 5
 where id = (select vehicle_id from cars_reservations where purpose = 'Trip one');

select name, fuel_level from cars_vehicles order by sort_order limit 1;

\echo 'so the NEXT renter is only asked to bring it back to 5/8, not full:'
insert into cars_reservations
  (user_id, vehicle_id, starts_at, ends_at, status, purpose, fuel_out,
   hourly_rate_cents, time_charge_cents, total_cents)
select 'dddddddd-0000-0000-0000-000000000002', v.id,
       '2027-05-08 09:00-04','2027-05-08 17:00-04','approved','Trip two', v.fuel_level,
       1500, 9000, 9000
  from cars_vehicles v order by sort_order limit 1;
select purpose, fuel_out from cars_reservations where purpose = 'Trip two';

\echo 'Fuel readings outside the gauge are rejected:'
do $$ begin
  begin
    update cars_reservations set fuel_in = 12 where purpose = 'Trip two';
    raise exception 'IMPOSSIBLE FUEL READING ACCEPTED';
  exception when check_violation then
    raise notice 'PASS: out-of-range fuel reading rejected';
  end;
end $$;

\echo '--- incidents land on the balance ---'
insert into cars_incidents (vehicle_id, user_id, kind, description, charge_cents)
select v.id, 'dddddddd-0000-0000-0000-000000000001', 'damage', 'Scraped bumper', 12000
  from cars_vehicles v order by sort_order limit 1;

select p.full_name, b.rental_cents, b.incident_cents, b.charged_cents, b.balance_cents
  from cars_student_balances b join cars_profiles p on p.id = b.user_id
 where p.last_name in ('First','Second') order by p.last_name;

\echo 'A payment reduces it:'
insert into cars_payments (user_id, amount_cents, method)
values ('dddddddd-0000-0000-0000-000000000001', 5000, 'zelle');
select balance_cents from cars_student_balances
 where user_id = 'dddddddd-0000-0000-0000-000000000001';

\echo '--- access ---'
grant usage on schema public, auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public._test_current_user to authenticated;
delete from public._test_current_user;
insert into public._test_current_user values ('dddddddd-0000-0000-0000-000000000002');
set role authenticated;

\echo 'A student sees only incidents charged to them (expect 0 for Bini):';
select count(*) from cars_incidents;

\echo 'and cannot write their own return, fuel reading or fees:';
do $$ begin
  begin
    update cars_reservations
       set fuel_in = 0, late_fee_cents = 0, returned_at = now(), status = 'completed'
     where user_id = auth.uid();
    raise exception 'STUDENT CHECKED THEMSELVES BACK IN';
  exception when raise_exception then
    if sqlerrm = 'STUDENT CHECKED THEMSELVES BACK IN' then raise; end if;
    raise notice 'PASS: student check-in rejected (%)', sqlerrm;
  end;
end $$;
select fuel_in, late_fee_cents, returned_at is null as not_returned, status
  from cars_reservations where user_id = auth.uid();
reset role;
