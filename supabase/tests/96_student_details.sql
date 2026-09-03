-- NOTE: the backfill assertion only means anything if a legacy row exists
-- BEFORE migration 0008 runs. Seed it by running this block first, or accept
-- that the first assertion returns no rows on a clean database:
--
--   insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000001','old@e.com')
--     on conflict do nothing;
--   insert into cars_profiles (id, full_name, email, status)
--   values ('cccccccc-0000-0000-0000-000000000001','Levi Yitzchok Green','old@e.com','active')
--     on conflict do nothing;

\echo '=== Split name and payment preference ==='
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001','old@e.com'),
  ('cccccccc-0000-0000-0000-000000000002','new@e.com') on conflict do nothing;

\echo 'Backfill split an existing full name, keeping the middle name with the surname:'
select first_name, last_name, full_name from cars_profiles
 where id = 'cccccccc-0000-0000-0000-000000000001';

\echo 'Setting the parts rebuilds full_name:'
update cars_profiles set first_name = 'Shmuel', last_name = 'Green'
 where id = 'cccccccc-0000-0000-0000-000000000001';
select first_name, last_name, full_name from cars_profiles
 where id = 'cccccccc-0000-0000-0000-000000000001';

\echo 'A new row gets full_name without anyone setting it:'
insert into cars_profiles (id, first_name, last_name, email, payment_method, status)
values ('cccccccc-0000-0000-0000-000000000002','Yaakov','Klein','new@e.com','zelle','active');
select first_name, last_name, full_name, payment_method from cars_profiles
 where id = 'cccccccc-0000-0000-0000-000000000002';

\echo 'Only Zelle or cash are allowed:'
do $$ begin
  begin
    update cars_profiles set payment_method = 'bitcoin'
     where id = 'cccccccc-0000-0000-0000-000000000002';
    raise exception 'BAD PAYMENT METHOD ACCEPTED';
  exception when check_violation then
    raise notice 'PASS: unknown payment method rejected';
  end;
end $$;

\echo '--- a student may change their own name and payment method ---'
grant usage on schema public, auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public._test_current_user to authenticated;
delete from public._test_current_user;
insert into public._test_current_user values ('cccccccc-0000-0000-0000-000000000002');
set role authenticated;
update cars_profiles
   set first_name = 'Yankel', payment_method = 'cash'
 where id = auth.uid();
select first_name, full_name, payment_method from cars_profiles where id = auth.uid();

\echo 'but still cannot promote themselves (guard runs before the name sync):'
update cars_profiles set role = 'admin', first_name = 'Yankel' where id = auth.uid();
select role, full_name from cars_profiles where id = auth.uid();
reset role;
