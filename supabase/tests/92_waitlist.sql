\echo '=== Waitlist ==='

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'levi@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'yoni@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'office@example.com')
on conflict do nothing;

insert into cars_profiles (id, full_name, email, role, status) values
  ('11111111-1111-1111-1111-111111111111', 'Levi Student', 'levi@example.com', 'student', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Yoni Student', 'yoni@example.com', 'student', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'Office Admin', 'office@example.com', 'admin', 'active')
on conflict do nothing;

\echo 'Two students put their names down on the same window:'
insert into cars_waitlist (user_id, vehicle_id, starts_at, ends_at, destination_label, purpose)
select '11111111-1111-1111-1111-111111111111', v.id,
       '2027-02-05 09:00-05', '2027-02-05 17:00-05', 'Lakewood, NJ', 'Shabbos'
  from cars_vehicles v order by sort_order limit 1;

insert into cars_waitlist (user_id, vehicle_id, starts_at, ends_at, destination_label, purpose)
select '22222222-2222-2222-2222-222222222222', v.id,
       '2027-02-05 12:00-05', '2027-02-05 20:00-05', 'Baltimore, MD', 'Wedding'
  from cars_vehicles v order by sort_order limit 1;

\echo 'Count for an overlapping window (expect 2):'
select cars_waitlist_count('2027-02-05 13:00-05', '2027-02-05 15:00-05', null) as waiting;

\echo 'Count for an unrelated window (expect 0):'
select cars_waitlist_count('2027-06-01 09:00-04', '2027-06-01 17:00-04', null) as waiting;

\echo 'A cancelled entry stops counting (expect 1):'
update cars_waitlist set status = 'cancelled'
 where user_id = '22222222-2222-2222-2222-222222222222';
select cars_waitlist_count('2027-02-05 13:00-05', '2027-02-05 15:00-05', null) as waiting;

\echo 'The same student cannot stack the same window twice:'
do $$
declare v uuid;
begin
  select id into v from cars_vehicles order by sort_order limit 1;
  begin
    insert into cars_waitlist (user_id, vehicle_id, starts_at, ends_at)
    values ('11111111-1111-1111-1111-111111111111', v,
            '2027-02-05 09:00-05', '2027-02-05 17:00-05');
    raise exception 'DUPLICATE WAITLIST ENTRY ALLOWED -- index is not working';
  exception when unique_violation then
    raise notice 'PASS: duplicate waitlist entry was rejected';
  end;
end $$;

\echo '--- access rules ---'
grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on function auth.uid() to anon, authenticated;
grant select on public._test_current_user to anon, authenticated;

delete from public._test_current_user;
insert into public._test_current_user values ('11111111-1111-1111-1111-111111111111');
set role authenticated;

\echo 'Levi sees only his own waitlist entry (expect 1):';
select count(*) from cars_waitlist;

\echo 'Levi still gets the honest total through the function (expect 1):';
select cars_waitlist_count('2027-02-05 13:00-05', '2027-02-05 15:00-05', null);

\echo 'Levi tries to promote his entry to converted:';
do $$ begin
  begin
    update cars_waitlist set status = 'converted' where user_id = auth.uid();
    raise exception 'STUDENT CHANGED WAITLIST STATUS -- guard is broken';
  exception when raise_exception then
    if sqlerrm like '%may only cancel%' then
      raise notice 'PASS: status change was rejected';
    else raise; end if;
  end;
end $$;

\echo 'Levi cannot read the email log (expect 0):';
select count(*) from cars_email_log;
reset role;

delete from public._test_current_user;
insert into public._test_current_user values ('33333333-3333-3333-3333-333333333333');
set role authenticated;
\echo 'Admin sees every waitlist entry (expect 2):';
select count(*) from cars_waitlist;
reset role;

set role anon;
\echo 'Anonymous sees no waitlist rows (expect 0):';
select count(*) from cars_waitlist;
\echo 'Anonymous can still see the count, to show demand publicly (expect 1):';
select cars_waitlist_count('2027-02-05 13:00-05', '2027-02-05 15:00-05', null);
reset role;
