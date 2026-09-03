\echo '=== Holds and waitlist ordering ==='

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'avi.hold@e.com'),
  ('66666666-6666-6666-6666-666666666666', 'berel.hold@e.com'),
  ('77777777-7777-7777-7777-777777777777', 'dovid.hold@e.com'),
  ('88888888-8888-8888-8888-888888888888', 'office.hold@e.com') on conflict do nothing;

insert into cars_profiles (id, full_name, email, role, status) values
  ('55555555-5555-5555-5555-555555555555', 'Avi',  'avi.hold@e.com', 'student', 'active'),
  ('66666666-6666-6666-6666-666666666666', 'Berel','berel.hold@e.com', 'student', 'active'),
  ('77777777-7777-7777-7777-777777777777', 'Dovid','dovid.hold@e.com', 'student', 'active'),
  ('88888888-8888-8888-8888-888888888888', 'Hold Office','office.hold@e.com', 'admin', 'active')
  on conflict do nothing;

delete from public._test_current_user;
insert into public._test_current_user values ('88888888-8888-8888-8888-888888888888');

\echo '--- a hold blocks the car just like a booking ---'
insert into cars_reservations
  (user_id, vehicle_id, starts_at, ends_at, status, hourly_rate_cents, time_charge_cents, total_cents)
select '55555555-5555-5555-5555-555555555555', v.id,
       '2027-03-05 09:00-05', '2027-03-05 17:00-05', 'hold', 1500, 9000, 9000
  from cars_vehicles v order by sort_order limit 1;

select v.name, a.is_available, a.reason
  from cars_availability('2027-03-05 12:00-05','2027-03-05 14:00-05') a
  join cars_vehicles v on v.id = a.vehicle_id order by v.sort_order;

\echo '--- nobody can book over a held car ---'
do $$
declare v uuid;
begin
  select id into v from cars_vehicles order by sort_order limit 1;
  begin
    insert into cars_reservations
      (user_id, vehicle_id, starts_at, ends_at, status, hourly_rate_cents, time_charge_cents, total_cents)
    values ('66666666-6666-6666-6666-666666666666', v,
            '2027-03-05 10:00-05','2027-03-05 12:00-05','approved',1500,3000,3000);
    raise exception 'BOOKED OVER A HOLD -- constraint is wrong';
  exception when exclusion_violation then
    raise notice 'PASS: booking over a hold was rejected';
  end;
end $$;

\echo '--- releasing the hold frees the car ---'
update cars_reservations
   set status = 'released', released_at = now(), release_reason = 'Student changed plans'
 where status = 'hold';

select v.name, a.is_available
  from cars_availability('2027-03-05 12:00-05','2027-03-05 14:00-05') a
  join cars_vehicles v on v.id = a.vehicle_id order by v.sort_order;

\echo '--- and somebody else can now take it ---'
insert into cars_reservations
  (user_id, vehicle_id, starts_at, ends_at, status, hourly_rate_cents, time_charge_cents, total_cents)
select '66666666-6666-6666-6666-666666666666', v.id,
       '2027-03-05 10:00-05','2027-03-05 12:00-05','approved',1500,3000,3000
  from cars_vehicles v order by sort_order limit 1;
\echo 'booked after release: ok'

\echo '--- a hold is not money owed ---'
select p.full_name, b.charged_cents
  from cars_student_balances b join cars_profiles p on p.id = b.user_id
 where p.full_name in ('Avi','Berel') order by p.full_name;

\echo '--- waitlist ordering: three join in turn ---'
insert into cars_waitlist (user_id, starts_at, ends_at, purpose, created_at) values
  ('55555555-5555-5555-5555-555555555555','2027-04-01 09:00-04','2027-04-01 17:00-04','Avi asked first',  now() - interval '3 hours'),
  ('66666666-6666-6666-6666-666666666666','2027-04-01 09:00-04','2027-04-01 17:00-04','Berel asked second',now() - interval '2 hours'),
  ('77777777-7777-7777-7777-777777777777','2027-04-01 09:00-04','2027-04-01 17:00-04','Dovid asked third', now() - interval '1 hours');

create or replace function show_queue() returns table(pos int, who text)
language sql as $$
  select row_number() over (order by case when w.position = 0 then 1 else 0 end, w.position, w.created_at)::int,
         p.full_name
    from cars_waitlist w join cars_profiles p on p.id = w.user_id
   where w.status in ('waiting','offered')
     and w.starts_at = '2027-04-01 09:00-04';
$$;

\echo 'Starting order (oldest first):'
select * from show_queue();

\echo 'Office moves Dovid to the top:'
select cars_waitlist_move(
  (select w.id from cars_waitlist w join cars_profiles p on p.id = w.user_id where p.full_name = 'Dovid'), 1);
select * from show_queue();

\echo 'Office moves Avi down one:'
select cars_waitlist_move(
  (select w.id from cars_waitlist w join cars_profiles p on p.id = w.user_id where p.full_name = 'Avi'), 3);
select * from show_queue();

\echo 'Target beyond the end is clamped, not an error:'
select cars_waitlist_move(
  (select w.id from cars_waitlist w join cars_profiles p on p.id = w.user_id where p.full_name = 'Berel'), 99);
select * from show_queue();

\echo 'Positions stay unique and contiguous:'
select count(*) as entries, count(distinct position) as distinct_positions
  from cars_waitlist
 where status in ('waiting','offered')
   and starts_at = '2027-04-01 09:00-04';

\echo '--- a student cannot reorder the queue ---'
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public._test_current_user to authenticated;
delete from public._test_current_user;
insert into public._test_current_user values ('55555555-5555-5555-5555-555555555555');
set role authenticated;
do $$ begin
  begin
    perform cars_waitlist_move(
      (select id from cars_waitlist where starts_at = '2027-04-01 09:00-04' limit 1), 1);
    raise exception 'STUDENT REORDERED THE QUEUE -- guard is broken';
  exception when raise_exception then
    if sqlerrm like '%Only the office%' then
      raise notice 'PASS: student reorder was rejected';
    else raise; end if;
  end;
end $$;

\echo 'Student cannot place a hold on their own reservation:';
do $$ begin
  begin
    update cars_reservations set status = 'hold' where user_id = auth.uid();
    raise exception 'STUDENT SET A HOLD -- guard is broken';
  exception when raise_exception then
    if sqlerrm like '%may only cancel%' then
      raise notice 'PASS: student hold was rejected';
    else raise; end if;
  end;
end $$;
reset role;
