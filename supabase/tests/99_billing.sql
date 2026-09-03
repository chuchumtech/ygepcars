-- ============================================================================
-- Billing: what is owed, what has been paid, and what the office can change.
--
-- The bug this file exists for: marking a reservation paid used to stamp a
-- timestamp the hold rule reads and record no money, so the student still owed
-- the full amount. Money is a cars_payments row now, and the row is what marks
-- the reservation paid.
-- ============================================================================

\echo '=== Billing ==='
delete from public._test_current_user;

insert into auth.users (id, email) values
  ('eeeeeeee-0000-0000-0000-000000000001','bill-student@e.com'),
  ('eeeeeeee-0000-0000-0000-000000000009','bill-office@e.com') on conflict do nothing;
insert into cars_profiles (id, first_name, last_name, email, role, status) values
  ('eeeeeeee-0000-0000-0000-000000000001','Bill','Payer','bill-student@e.com','student','active'),
  ('eeeeeeee-0000-0000-0000-000000000009','Bill','Desk','bill-office@e.com','admin','active')
  on conflict do nothing;

insert into cars_reservations
  (id, user_id, vehicle_id, starts_at, ends_at, status, purpose, requested_at,
   hourly_rate_cents, billable_hours, time_charge_cents, toll_cents)
select 'eeeeeeee-1111-0000-0000-000000000001',
       'eeeeeeee-0000-0000-0000-000000000001',
       (select id from cars_vehicles order by sort_order limit 1),
       timestamptz '2026-11-02 09:00-05', timestamptz '2026-11-02 17:00-05',
       'approved', 'Bill test', now() - interval '1 day',
       1500, 8, 12000, 1800
on conflict (id) do nothing;

\echo 'The total is the database''s arithmetic, not the app''s -- time + tolls:'
select time_charge_cents, toll_cents, adjustment_cents, total_cents
  from cars_reservations where id = 'eeeeeeee-1111-0000-0000-000000000001';

\echo 'A described line item lands on the total:'
insert into cars_reservation_items (reservation_id, kind, description, amount_cents)
values ('eeeeeeee-1111-0000-0000-000000000001','charge','Car wash after the trip', 2500);
select adjustment_cents, total_cents
  from cars_reservations where id = 'eeeeeeee-1111-0000-0000-000000000001';

\echo 'and a discount pulls the other way without anyone typing a minus sign:'
insert into cars_reservation_items (reservation_id, kind, description, amount_cents)
values ('eeeeeeee-1111-0000-0000-000000000001','discount','Goodwill, car was filthy', 1000);
select adjustment_cents, total_cents
  from cars_reservations where id = 'eeeeeeee-1111-0000-0000-000000000001';

\echo 'A discount can never be entered as a negative amount:'
do $$ begin
  begin
    insert into cars_reservation_items (reservation_id, kind, description, amount_cents)
    values ('eeeeeeee-1111-0000-0000-000000000001','discount','wrong way', -500);
    raise exception 'NEGATIVE LINE ITEM ACCEPTED';
  exception when check_violation then
    raise notice 'PASS: a negative line item was rejected';
  end;
end $$;

\echo 'Removing an item takes it back off the total:'
delete from cars_reservation_items
 where reservation_id = 'eeeeeeee-1111-0000-0000-000000000001' and kind = 'discount';
select adjustment_cents, total_cents
  from cars_reservations where id = 'eeeeeeee-1111-0000-0000-000000000001';

\echo '--- what the student owes ---'
\echo 'Owed with nothing paid (rental 12000 + 1800 tolls + 2500 item = 16300):'
select charged_cents, paid_cents, balance_cents, credit_cents
  from cars_student_balances where user_id = 'eeeeeeee-0000-0000-0000-000000000001';

\echo 'An account charge that belongs to no rental at all:'
insert into cars_charges (user_id, charged_on, description, amount_cents)
values ('eeeeeeee-0000-0000-0000-000000000001','2026-11-03','Share of the new roof rack', 4000);
select account_charge_cents, charged_cents, balance_cents
  from cars_student_balances where user_id = 'eeeeeeee-0000-0000-0000-000000000001';

\echo 'A payment moves the balance AND marks the reservation paid (this is the bug):'
insert into cars_payments (user_id, reservation_id, amount_cents, method, paid_on)
values ('eeeeeeee-0000-0000-0000-000000000001','eeeeeeee-1111-0000-0000-000000000001',
        16300,'zelle','2026-11-02');
select balance_cents, credit_cents
  from cars_student_balances where user_id = 'eeeeeeee-0000-0000-0000-000000000001';
select payment_received_at is not null as reservation_shows_paid
  from cars_reservations where id = 'eeeeeeee-1111-0000-0000-000000000001';

\echo 'Overpaying leaves a credit rather than a nonsense negative owing:'
insert into cars_payments (user_id, amount_cents, method, paid_on)
values ('eeeeeeee-0000-0000-0000-000000000001', 10000,'cash','2026-11-04');
select balance_cents, credit_cents
  from cars_student_balances where user_id = 'eeeeeeee-0000-0000-0000-000000000001';

\echo 'A credit note does the same thing without money changing hands:'
insert into cars_charges (user_id, description, amount_cents)
values ('eeeeeeee-0000-0000-0000-000000000001','Credit for the cancelled trip', -2000);
select balance_cents, credit_cents
  from cars_student_balances where user_id = 'eeeeeeee-0000-0000-0000-000000000001';

\echo 'Taking the payment back off unmarks the reservation:'
delete from cars_payments
 where reservation_id = 'eeeeeeee-1111-0000-0000-000000000001';
select payment_received_at is null as unpaid_again
  from cars_reservations where id = 'eeeeeeee-1111-0000-0000-000000000001';

\echo '--- a student can read their side and change none of it ---'
grant usage on schema public, auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public._test_current_user to authenticated;
delete from public._test_current_user;
insert into public._test_current_user values ('eeeeeeee-0000-0000-0000-000000000001');
set role authenticated;

\echo 'They see the line items on their own rental (expect 1):'
select count(*) from cars_reservation_items;
\echo 'and their own account charges (expect 2):'
select count(*) from cars_charges;

do $$ begin
  begin
    insert into cars_reservation_items (reservation_id, kind, description, amount_cents)
    values ('eeeeeeee-1111-0000-0000-000000000001','discount','free please', 9999);
    raise exception 'STUDENT WROTE A LINE ITEM';
  exception when insufficient_privilege then
    raise notice 'PASS: a student cannot add a line item';
  end;
end $$;

do $$ begin
  begin
    insert into cars_charges (user_id, description, amount_cents)
    values ('eeeeeeee-0000-0000-0000-000000000001','credit me', -50000);
    raise exception 'STUDENT WROTE A CREDIT';
  exception when insufficient_privilege then
    raise notice 'PASS: a student cannot credit themselves';
  end;
end $$;

\echo 'and their delete affects nothing:'
delete from cars_charges;
reset role;
select count(*) as charges_still_there from cars_charges;
