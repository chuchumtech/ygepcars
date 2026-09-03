-- ============================================================================
-- YGEP Car Rental -- returns, fuel, late fees and incidents
--
-- Fuel is tracked as eighths, the way a gauge actually reads: 8 is full, 4 is
-- half, 0 is empty. The car carries its level between renters, so a student who
-- brings it back at 5/8 sets the bar for the next one -- they are told to
-- return it at 5/8, not full. Nobody buys gas for somebody else's trip.
-- ============================================================================

alter table cars_vehicles
  add column if not exists fuel_level int not null default 8;

alter table cars_vehicles drop constraint if exists cars_vehicles_fuel_level_check;
alter table cars_vehicles
  add constraint cars_vehicles_fuel_level_check check (fuel_level between 0 and 8);

comment on column cars_vehicles.fuel_level is
  'Where the gauge sits right now, in eighths. Set by the last check-in and
   used as the level the next renter has to match.';

-- ---------------------------------------------------------------------------
-- Check-out and check-in on the reservation
-- ---------------------------------------------------------------------------

alter table cars_reservations
  add column if not exists picked_up_at   timestamptz,
  add column if not exists returned_at    timestamptz,
  add column if not exists fuel_out       int,
  add column if not exists fuel_in        int,
  add column if not exists late_minutes   int not null default 0,
  add column if not exists late_fee_cents int not null default 0,
  add column if not exists fuel_fee_cents int not null default 0,
  add column if not exists return_notes   text not null default '';

alter table cars_reservations drop constraint if exists cars_reservations_fuel_check;
alter table cars_reservations
  add constraint cars_reservations_fuel_check
  check (
    (fuel_out is null or fuel_out between 0 and 8)
    and (fuel_in is null or fuel_in between 0 and 8)
  );

comment on column cars_reservations.fuel_out is
  'Gauge level when the car went out, so the student knows what to bring back.';
comment on column cars_reservations.late_fee_cents is
  'Charged for coming back past the grace period, and included in total_cents.';

create index if not exists cars_reservations_open_return_idx
  on cars_reservations (ends_at)
  where status = 'approved' and returned_at is null;

insert into cars_settings (key, value) values
  ('late_grace_minutes',       '15'::jsonb),
  ('late_fee_per_hour_cents',  '1500'::jsonb),
  ('fuel_fee_per_eighth_cents','800'::jsonb),
  -- Student email is off until the office turns it on.
  ('notify_students',            'false'::jsonb),
  ('notify_student_on_approved', 'true'::jsonb),
  ('notify_student_on_declined', 'true'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Incidents
--
-- Damage, a ticket, a mess left in the back. Optionally tied to the reservation
-- it happened on, and optionally carrying a charge that lands on the student's
-- balance alongside their rentals.
-- ---------------------------------------------------------------------------

create table if not exists cars_incidents (
  id             uuid primary key default gen_random_uuid(),
  vehicle_id     uuid        not null references cars_vehicles (id) on delete cascade,
  reservation_id uuid        references cars_reservations (id) on delete set null,
  user_id        uuid        references cars_profiles (id) on delete set null,

  occurred_on    date        not null default current_date,
  kind           text        not null default 'damage'
                             check (kind in ('damage','accident','ticket','cleaning','mechanical','fuel','other')),
  description    text        not null default '',
  charge_cents   int         not null default 0,
  status         text        not null default 'open' check (status in ('open','resolved')),
  resolution     text        not null default '',

  reported_by    uuid        references cars_profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column cars_incidents.user_id is
  'Who was driving. NULL when it is nobody''s fault in particular, e.g. a
   mechanical fault found during a service.';
comment on column cars_incidents.charge_cents is
  'Billed to user_id when set. Appears on their statement and balance.';

create index if not exists cars_incidents_vehicle_idx on cars_incidents (vehicle_id, occurred_on desc);
create index if not exists cars_incidents_user_idx    on cars_incidents (user_id, occurred_on desc);
create index if not exists cars_incidents_open_idx    on cars_incidents (status) where status = 'open';

drop trigger if exists cars_incidents_touch on cars_incidents;
create trigger cars_incidents_touch before update on cars_incidents
  for each row execute function cars_touch_updated_at();

alter table cars_incidents enable row level security;

-- A student sees an incident that is charged to them, because it is on their
-- statement. They can never write one.
drop policy if exists cars_incidents_select on cars_incidents;
create policy cars_incidents_select on cars_incidents
  for select to authenticated
  using (user_id = auth.uid() or cars_is_admin());

drop policy if exists cars_incidents_write_admin on cars_incidents;
create policy cars_incidents_write_admin on cars_incidents
  for all to authenticated
  using (cars_is_admin())
  with check (cars_is_admin());

grant select on cars_incidents to authenticated;
grant insert, update, delete on cars_incidents to authenticated;

-- ---------------------------------------------------------------------------
-- Balances now include incident charges
-- ---------------------------------------------------------------------------

-- CREATE OR REPLACE cannot reorder or rename a view's columns, and this
-- version inserts rental_cents ahead of charged_cents, so the old one has to
-- go first. Nothing depends on it but the grant below.
drop view if exists cars_student_balances;

create view cars_student_balances
  with (security_invoker = true)
  as select
    p.id                                       as user_id,
    coalesce(charges.total_cents, 0)           as rental_cents,
    coalesce(incidents.total_cents, 0)         as incident_cents,
    coalesce(charges.total_cents, 0)
      + coalesce(incidents.total_cents, 0)     as charged_cents,
    coalesce(paid.total_cents, 0)              as paid_cents,
    coalesce(charges.total_cents, 0)
      + coalesce(incidents.total_cents, 0)
      - coalesce(paid.total_cents, 0)          as balance_cents,
    coalesce(charges.reservation_count, 0)     as reservation_count
  from cars_profiles p
  left join lateral (
    select sum(r.total_cents) as total_cents, count(*) as reservation_count
      from cars_reservations r
     where r.user_id = p.id
       and r.status in ('approved', 'completed')
  ) charges on true
  left join lateral (
    select sum(i.charge_cents) as total_cents
      from cars_incidents i
     where i.user_id = p.id
  ) incidents on true
  left join lateral (
    select sum(pm.amount_cents) as total_cents
      from cars_payments pm
     where pm.user_id = p.id
  ) paid on true;

grant select on cars_student_balances to authenticated;

-- ---------------------------------------------------------------------------
-- Students must not be able to write their own return, fees or fuel readings.
-- ---------------------------------------------------------------------------

create or replace function cars_reservations_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not cars_is_admin() then
    if new.status <> old.status and new.status <> 'cancelled' then
      raise exception 'Students may only cancel a reservation.';
    end if;
    new.user_id             := old.user_id;
    new.vehicle_id          := old.vehicle_id;
    new.hourly_rate_cents   := old.hourly_rate_cents;
    new.daily_cap_cents     := old.daily_cap_cents;
    new.time_charge_cents   := old.time_charge_cents;
    new.toll_cents          := old.toll_cents;
    new.adjustment_cents    := old.adjustment_cents;
    new.total_cents         := old.total_cents;
    new.admin_notes         := old.admin_notes;
    new.decided_at          := old.decided_at;
    new.decided_by          := old.decided_by;
    new.hold_expires_at     := old.hold_expires_at;
    new.released_at         := old.released_at;
    new.release_reason      := old.release_reason;
    new.payment_received_at := old.payment_received_at;
    new.requested_at        := old.requested_at;
    new.picked_up_at        := old.picked_up_at;
    new.returned_at         := old.returned_at;
    new.fuel_out            := old.fuel_out;
    new.fuel_in             := old.fuel_in;
    new.late_minutes        := old.late_minutes;
    new.late_fee_cents      := old.late_fee_cents;
    new.fuel_fee_cents      := old.fuel_fee_cents;
    new.return_notes        := old.return_notes;
    if new.status = 'cancelled' and old.status not in ('pending', 'approved') then
      raise exception 'Only a pending or approved reservation can be cancelled.';
    end if;
  end if;
  return new;
end;
$$;
