-- ============================================================================
-- YGEP Car Rental -- real billing: line items, account charges, credits
--
-- Three things were wrong with how money worked.
--
-- 1. "Mark as paid" stamped cars_reservations.payment_received_at, which is
--    what rule 2 reads to decide whether the car stays out of inventory. It
--    recorded no money, so the student still owed the full amount. Money now
--    only ever comes from a cars_payments row, and that row is what marks the
--    reservation paid, through the trigger that already existed for it.
--
-- 2. A reservation had one nameless adjustment_cents. The office wants to add
--    a described line item, and separately a discount, and wants what they
--    typed to appear on the statement.
--
-- 3. There was no way to charge an account for something that is not a rental
--    and not an incident on a car, and no way to leave somebody in credit
--    except by accident.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Line items on a reservation
--
-- amount_cents is always positive; `kind` decides which way it pulls. That way
-- a discount cannot be entered as a positive charge by mistake, and the office
-- never has to think about minus signs.
-- ---------------------------------------------------------------------------

create table if not exists cars_reservation_items (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid        not null references cars_reservations (id) on delete cascade,
  kind           text        not null check (kind in ('charge','discount')),
  description    text        not null default '',
  amount_cents   int         not null check (amount_cents >= 0),
  created_by     uuid        references cars_profiles (id) on delete set null,
  created_at     timestamptz not null default now(),

  -- What it contributes to the reservation total.
  signed_cents   int generated always as
                   (case kind when 'discount' then -amount_cents else amount_cents end) stored
);

comment on table cars_reservation_items is
  'Extra charges and discounts on one rental, each with the description the
   office typed, which is what the student reads on their statement.';

create index if not exists cars_reservation_items_reservation_idx
  on cars_reservation_items (reservation_id, created_at);

alter table cars_reservation_items enable row level security;

-- A student reads the items on their own rental, because they are on the
-- statement. Only the office writes them.
drop policy if exists cars_reservation_items_select on cars_reservation_items;
create policy cars_reservation_items_select on cars_reservation_items
  for select to authenticated
  using (
    cars_is_admin()
    or exists (
      select 1 from cars_reservations r
       where r.id = reservation_id and r.user_id = auth.uid()
    )
  );

drop policy if exists cars_reservation_items_write_admin on cars_reservation_items;
create policy cars_reservation_items_write_admin on cars_reservation_items
  for all to authenticated
  using (cars_is_admin())
  with check (cars_is_admin());

grant select on cars_reservation_items to authenticated;
grant insert, update, delete on cars_reservation_items to authenticated;

-- ---------------------------------------------------------------------------
-- The total is the database's job now
--
-- It used to be recomputed by hand in four different places in the app --
-- the student's booking, the office's booking, the office's edit and the
-- check-in -- which is three chances too many to get it wrong, and no way at
-- all to keep it right when a line item is added underneath.
-- ---------------------------------------------------------------------------

create or replace function cars_reservations_recompute_total()
returns trigger
language plpgsql
as $$
begin
  new.total_cents :=
      coalesce(new.time_charge_cents, 0)
    + coalesce(new.toll_cents, 0)
    + coalesce(new.adjustment_cents, 0)
    + coalesce(new.late_fee_cents, 0)
    + coalesce(new.fuel_fee_cents, 0);
  return new;
end;
$$;

-- BEFORE triggers fire in alphabetical order, and this one has to see the
-- final values -- in particular whatever the student guard put back.
drop trigger if exists cars_reservations_zz_total_trg on cars_reservations;
create trigger cars_reservations_zz_total_trg
  before insert or update on cars_reservations
  for each row execute function cars_reservations_recompute_total();

/**
 * Rolls the line items up into the reservation's adjustment_cents, which then
 * fires the trigger above and settles the total. Keeping the rolled-up figure
 * on the reservation means availability, balances, statements and the emails
 * all keep reading one column and none of them had to learn about items.
 */
create or replace function cars_reservation_items_rollup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation uuid := coalesce(new.reservation_id, old.reservation_id);
begin
  update cars_reservations
     set adjustment_cents = coalesce(
           (select sum(signed_cents) from cars_reservation_items
             where reservation_id = v_reservation), 0)
   where id = v_reservation;

  return coalesce(new, old);
end;
$$;

drop trigger if exists cars_reservation_items_rollup_trg on cars_reservation_items;
create trigger cars_reservation_items_rollup_trg
  after insert or update or delete on cars_reservation_items
  for each row execute function cars_reservation_items_rollup();

-- Any reservation still carrying a hand-entered adjustment becomes a line item
-- so the two cannot disagree, and so its reason shows on the statement like
-- every other item.
insert into cars_reservation_items (reservation_id, kind, description, amount_cents)
select r.id,
       case when r.adjustment_cents < 0 then 'discount' else 'charge' end,
       coalesce(nullif(r.adjustment_reason, ''), 'Adjustment'),
       abs(r.adjustment_cents)
  from cars_reservations r
 where r.adjustment_cents <> 0
   and not exists (
     select 1 from cars_reservation_items i where i.reservation_id = r.id
   );

-- ---------------------------------------------------------------------------
-- Charges that belong to the account rather than to a rental
--
-- A membership fee, a share of a repair, a write-off. A negative amount is a
-- credit note, which is how the office puts somebody in credit on purpose
-- rather than by taking too much money.
-- ---------------------------------------------------------------------------

create table if not exists cars_charges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references cars_profiles (id) on delete cascade,
  charged_on   date        not null default current_date,
  description  text        not null default '',
  amount_cents int         not null,
  note         text        not null default '',
  created_by   uuid        references cars_profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table cars_charges is
  'Money owed that is not a rental and not an incident on a car. Negative is a
   credit note.';

create index if not exists cars_charges_user_idx on cars_charges (user_id, charged_on desc);

drop trigger if exists cars_charges_touch on cars_charges;
create trigger cars_charges_touch before update on cars_charges
  for each row execute function cars_touch_updated_at();

alter table cars_charges enable row level security;

drop policy if exists cars_charges_select on cars_charges;
create policy cars_charges_select on cars_charges
  for select to authenticated
  using (user_id = auth.uid() or cars_is_admin());

drop policy if exists cars_charges_write_admin on cars_charges;
create policy cars_charges_write_admin on cars_charges
  for all to authenticated
  using (cars_is_admin())
  with check (cars_is_admin());

grant select on cars_charges to authenticated;
grant insert, update, delete on cars_charges to authenticated;

-- ---------------------------------------------------------------------------
-- Balances: rentals + incidents + account charges - payments
--
-- balance_cents goes negative when somebody has paid ahead, and that is a
-- credit they can spend on the next rental rather than a mistake to correct.
-- ---------------------------------------------------------------------------

drop view if exists cars_student_balances;

create view cars_student_balances
  with (security_invoker = true)
  as select
    p.id                                       as user_id,
    coalesce(rentals.total_cents, 0)           as rental_cents,
    coalesce(incidents.total_cents, 0)         as incident_cents,
    coalesce(extras.total_cents, 0)            as account_charge_cents,
    coalesce(rentals.total_cents, 0)
      + coalesce(incidents.total_cents, 0)
      + coalesce(extras.total_cents, 0)        as charged_cents,
    coalesce(paid.total_cents, 0)              as paid_cents,
    coalesce(rentals.total_cents, 0)
      + coalesce(incidents.total_cents, 0)
      + coalesce(extras.total_cents, 0)
      - coalesce(paid.total_cents, 0)          as balance_cents,
    greatest(
      coalesce(paid.total_cents, 0)
        - coalesce(rentals.total_cents, 0)
        - coalesce(incidents.total_cents, 0)
        - coalesce(extras.total_cents, 0), 0)  as credit_cents,
    coalesce(rentals.reservation_count, 0)     as reservation_count
  from cars_profiles p
  left join lateral (
    select sum(r.total_cents) as total_cents, count(*) as reservation_count
      from cars_reservations r
     where r.user_id = p.id
       and r.status in ('approved', 'completed')
  ) rentals on true
  left join lateral (
    select sum(i.charge_cents) as total_cents
      from cars_incidents i
     where i.user_id = p.id
  ) incidents on true
  left join lateral (
    select sum(c.amount_cents) as total_cents
      from cars_charges c
     where c.user_id = p.id
  ) extras on true
  left join lateral (
    select sum(pm.amount_cents) as total_cents
      from cars_payments pm
     where pm.user_id = p.id
  ) paid on true;

grant select on cars_student_balances to authenticated;
