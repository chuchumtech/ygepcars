\echo '=== RLS: what each role can actually see ==='

grant usage on schema public to anon, authenticated;
-- Real Supabase grants these; the stub has to match or auth.uid() is unreachable.
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select on public._test_current_user to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage on all sequences in schema public to authenticated;

-- Pretend to be Levi.
delete from public._test_current_user;
insert into public._test_current_user values ('11111111-1111-1111-1111-111111111111');

set role authenticated;
\echo 'Levi sees only his own 2 reservations, not Yonis (expect 2):'
select count(*) from cars_reservations;
\echo 'Levi sees only his own profile (expect 1):'
select count(*) from cars_profiles;
\echo 'Levi sees only his own payments (expect 1):'
select count(*) from cars_payments;
\echo 'Levi sees only his own balance line (expect 1):'
select count(*) from cars_student_balances;
\echo 'Levi can still see both cars (expect 2):'
select count(*) from cars_vehicles;
\echo 'Levi can still check availability on a car he cannot see the booking for:'
select is_available, reason from cars_availability('2026-09-05 12:00-04','2026-09-05 16:00-04')
  where vehicle_id = (select id from cars_vehicles order by sort_order limit 1);

\echo 'Levi tries to make himself an admin:'
update cars_profiles set role = 'admin', status = 'active' where id = auth.uid();
select role from cars_profiles where id = auth.uid();

\echo 'Levi tries to write a car rate:'
do $$ begin
  update cars_vehicles set hourly_rate_cents = 1;
  if (select count(*) from cars_vehicles where hourly_rate_cents = 1) > 0 then
    raise exception 'STUDENT CHANGED A RATE -- policy is broken';
  end if;
  raise notice 'PASS: rate change silently affected no rows';
end $$;

\echo 'Levi tries to approve his own pending request:'
do $$ begin
  begin
    update cars_reservations set status = 'approved' where user_id = auth.uid() and status = 'pending';
    raise exception 'STUDENT SELF-APPROVED -- guard is broken';
  exception when raise_exception then
    if sqlerrm like '%may only cancel%' then
      raise notice 'PASS: self-approval was rejected';
    else raise; end if;
  end;
end $$;

\echo 'Levi cancels his own pending request (allowed):'
update cars_reservations set status = 'cancelled' where user_id = auth.uid() and status = 'pending';
select status from cars_reservations where user_id = auth.uid() order by starts_at;

reset role;

-- Now the office admin.
delete from public._test_current_user;
insert into public._test_current_user values ('33333333-3333-3333-3333-333333333333');
set role authenticated;
\echo 'Admin sees every reservation (expect 4):'
select count(*) from cars_reservations;
\echo 'Admin sees every profile (expect 3):'
select count(*) from cars_profiles;
\echo 'Admin sees every balance (expect 3):'
select count(*) from cars_student_balances;
reset role;

-- Anonymous visitor.
delete from public._test_current_user;
set role anon;
\echo 'Anonymous sees the fleet (expect 2):';
select count(*) from cars_vehicles;
\echo 'Anonymous sees destinations (expect 10):';
select count(*) from cars_destinations;
\echo 'Anonymous sees no reservations (expect 0):';
select count(*) from cars_reservations;
\echo 'Anonymous sees no profiles (expect 0):';
select count(*) from cars_profiles;
reset role;
