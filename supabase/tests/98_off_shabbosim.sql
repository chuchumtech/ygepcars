-- ============================================================================
-- Off Shabbosim: everyone can see them, only the office can set them.
--
-- These are drawn on the date picker for students, so the read has to be open
-- to a signed-out visitor checking availability -- but a student must not be
-- able to invent one, rename one, or clear the list.
-- ============================================================================

\echo '=== Off Shabbosim ==='

insert into auth.users (id, email) values
  ('ffffffff-0000-0000-0000-000000000001','off-admin@e.com'),
  ('ffffffff-0000-0000-0000-000000000002','off-student@e.com') on conflict do nothing;

insert into cars_profiles (id, first_name, last_name, email, role, status) values
  ('ffffffff-0000-0000-0000-000000000001','Office','Off','off-admin@e.com','admin','active'),
  ('ffffffff-0000-0000-0000-000000000002','Student','Off','off-student@e.com','student','active')
  on conflict do nothing;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select on public._test_current_user to anon, authenticated;

\echo '--- the office marks two Shabbosim off ---'
delete from public._test_current_user;
insert into public._test_current_user values ('ffffffff-0000-0000-0000-000000000001');
set role authenticated;
insert into cars_off_shabbosim (shabbos_on, label, created_by) values
  ('2026-10-03','Bein hazmanim','ffffffff-0000-0000-0000-000000000001'),
  ('2026-10-10','Yeshiva closed','ffffffff-0000-0000-0000-000000000001');
select shabbos_on, label from cars_off_shabbosim order by shabbos_on;

\echo 'Marking the same Shabbos twice is impossible, so re-marking just relabels it:'
insert into cars_off_shabbosim (shabbos_on, label) values ('2026-10-03','Shabbos at home')
  on conflict (shabbos_on) do update set label = excluded.label;
select shabbos_on, label from cars_off_shabbosim where shabbos_on = '2026-10-03';

\echo 'An off Shabbos can run into the Friday, the Sunday, both or neither:'
update cars_off_shabbosim
   set includes_friday = true, includes_sunday = true
 where shabbos_on = '2026-10-03';
select shabbos_on, includes_friday, includes_sunday from cars_off_shabbosim
 where shabbos_on = '2026-10-03';

\echo 'and a fresh one covers the Shabbos alone until the office says otherwise:'
select shabbos_on, includes_friday, includes_sunday from cars_off_shabbosim
 where shabbos_on = '2026-10-10';

\echo 'and the office can take one off again:'
delete from cars_off_shabbosim where shabbos_on = '2026-10-10';
select count(*) as remaining from cars_off_shabbosim;
reset role;

\echo '--- a student sees the list but cannot touch it ---'
delete from public._test_current_user;
insert into public._test_current_user values ('ffffffff-0000-0000-0000-000000000002');
set role authenticated;

\echo 'They can read it (the picker needs this):'
select shabbos_on, label from cars_off_shabbosim order by shabbos_on;

do $$ begin
  begin
    insert into cars_off_shabbosim (shabbos_on, label) values ('2026-11-07','Not up to me');
    raise exception 'STUDENT MARKED A SHABBOS OFF';
  exception when insufficient_privilege then
    raise notice 'PASS: a student cannot mark a Shabbos off';
  end;
end $$;

\echo 'Their update and delete silently affect nothing rather than changing the list:'
update cars_off_shabbosim set label = 'Cancelled by me';
delete from cars_off_shabbosim;
reset role;
select shabbos_on, label from cars_off_shabbosim order by shabbos_on;

\echo '--- a signed-out visitor still sees them, and nothing else changes ---'
delete from public._test_current_user;
set role anon;
select count(*) as visible_to_anon from cars_off_shabbosim;
reset role;
