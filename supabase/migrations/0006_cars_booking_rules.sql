-- ============================================================================
-- YGEP Car Rental -- booking rules the office can change
--
--   1. Minimum rental length.
--   2. How long an unpaid reservation keeps the car blocked.
--   3. How far in advance a student has to book.
--
-- All three live in cars_settings so the office can adjust them without a
-- deploy, and all three are read here rather than hard-coded anywhere.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Reading a numeric setting safely
-- ---------------------------------------------------------------------------

/**
 * A whole-number setting, or the supplied default when the key is missing or
 * holds something that is not a number. Never throws, so a typo in Settings
 * can't take availability down with it.
 */
create or replace function cars_setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case
              when (value #>> '{}') ~ '^[0-9]+$' then (value #>> '{}')::int
            end
       from cars_settings
      where key = p_key),
    p_default
  );
$$;

revoke all on function cars_setting_int(text, int) from public;
grant execute on function cars_setting_int(text, int) to anon, authenticated;

insert into cars_settings (key, value) values
  ('min_rental_hours',   '4'::jsonb),
  ('min_advance_hours',  '2'::jsonb),
  ('payment_hold_hours', '12'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Payment against a reservation
--
-- Rule 2 turns on whether a reservation has been paid, so the reservation
-- carries the moment payment landed. It is set automatically when the office
-- records a payment against it, and can also be set by hand.
-- ---------------------------------------------------------------------------

alter table cars_reservations
  add column if not exists payment_received_at timestamptz;

comment on column cars_reservations.payment_received_at is
  'When payment landed. While this is null the car is only blocked for
   payment_hold_hours after the request; after that the car returns to
   inventory but the reservation itself stays pending.';

create index if not exists cars_reservations_pending_hold_idx
  on cars_reservations (requested_at)
  where status = 'pending';

/** Recording a payment against a reservation marks it paid. */
create or replace function cars_payments_sync_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation uuid;
  v_positive    int;
begin
  v_reservation := coalesce(new.reservation_id, old.reservation_id);
  if v_reservation is null then
    return coalesce(new, old);
  end if;

  select count(*) into v_positive
    from cars_payments
   where reservation_id = v_reservation
     and amount_cents > 0;

  if v_positive > 0 then
    update cars_reservations
       set payment_received_at = coalesce(
             payment_received_at,
             (select min(created_at) from cars_payments
               where reservation_id = v_reservation and amount_cents > 0))
     where id = v_reservation;
  else
    -- The last payment was removed, so the reservation is unpaid again.
    update cars_reservations set payment_received_at = null where id = v_reservation;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists cars_payments_sync_trg on cars_payments;
create trigger cars_payments_sync_trg
  after insert or update or delete on cars_payments
  for each row execute function cars_payments_sync_reservation();

-- ---------------------------------------------------------------------------
-- Rule 2 in one place
-- ---------------------------------------------------------------------------

/**
 * Does this reservation currently take the car out of inventory?
 *
 * Holds and confirmed bookings always do. A pending request does only while it
 * is still inside its payment window, or once payment has landed -- after that
 * the car is free for somebody else even though the request itself stays open.
 */
create or replace function cars_reservation_blocks_car(
  p_status              text,
  p_requested_at        timestamptz,
  p_payment_received_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_status in ('hold', 'approved', 'completed') then true
    when p_status = 'pending' then
      p_payment_received_at is not null
      or p_requested_at
         + make_interval(hours => cars_setting_int('payment_hold_hours', 12)) > now()
    else false
  end;
$$;

revoke all on function cars_reservation_blocks_car(text, timestamptz, timestamptz) from public;
grant execute on function cars_reservation_blocks_car(text, timestamptz, timestamptz)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Availability, now honouring the payment window
-- ---------------------------------------------------------------------------

create or replace function cars_availability(p_start timestamptz, p_end timestamptz)
returns table (
  vehicle_id   uuid,
  is_available boolean,
  reason       text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    blocked.kind is null as is_available,
    coalesce(blocked.kind, '') as reason
  from cars_vehicles v
  left join lateral (
    select kind from (
      select 'out_of_service' as kind, 0 as rank
        where not v.is_active
      union all
      select 'maintenance', 1
        from cars_blackouts b
        where b.vehicle_id = v.id
          and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
      union all
      select case r.status
               when 'pending' then 'requested'
               when 'hold'    then 'held'
               else 'booked'
             end, 2
        from cars_reservations r
        where r.vehicle_id = v.id
          and cars_reservation_blocks_car(r.status, r.requested_at, r.payment_received_at)
          and tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
    ) k
    order by rank
    limit 1
  ) blocked on true;
$$;

create or replace function cars_busy_windows(p_from timestamptz, p_to timestamptz)
returns table (
  vehicle_id uuid,
  starts_at  timestamptz,
  ends_at    timestamptz,
  kind       text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.vehicle_id, r.starts_at, r.ends_at,
         case r.status
           when 'pending' then 'requested'
           when 'hold'    then 'held'
           else 'booked'
         end
    from cars_reservations r
   where cars_reservation_blocks_car(r.status, r.requested_at, r.payment_received_at)
     and tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(p_from, p_to, '[)')
  union all
  select b.vehicle_id, b.starts_at, b.ends_at, 'maintenance'
    from cars_blackouts b
   where tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_from, p_to, '[)');
$$;

revoke all on function cars_availability(timestamptz, timestamptz) from public;
grant execute on function cars_availability(timestamptz, timestamptz) to anon, authenticated;
revoke all on function cars_busy_windows(timestamptz, timestamptz) from public;
grant execute on function cars_busy_windows(timestamptz, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rule 1 and rule 3 at the database level
--
-- The app checks these first and explains them properly; this is the backstop
-- so a request that skipped the form cannot get in either. The office is
-- deliberately exempt: they take bookings by phone and need to override.
-- ---------------------------------------------------------------------------

create or replace function cars_reservations_rules_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_hours    int;
  v_min_advance  int;
  v_length_hours numeric;
begin
  if auth.uid() is null or cars_is_admin() then
    return new;
  end if;

  v_min_hours   := cars_setting_int('min_rental_hours', 4);
  v_min_advance := cars_setting_int('min_advance_hours', 2);

  v_length_hours := extract(epoch from (new.ends_at - new.starts_at)) / 3600;

  if v_length_hours < v_min_hours then
    raise exception 'Rentals have to be at least % hours.', v_min_hours;
  end if;

  if new.starts_at < now() + make_interval(hours => v_min_advance) then
    raise exception 'Reservations have to be made at least % hours ahead.', v_min_advance;
  end if;

  if coalesce(new.purpose, '') = '' then
    raise exception 'A reason for the trip is required.';
  end if;

  return new;
end;
$$;

drop trigger if exists cars_reservations_rules_trg on cars_reservations;
create trigger cars_reservations_rules_trg before insert on cars_reservations
  for each row execute function cars_reservations_rules_guard();

-- Students must not be able to mark their own reservation paid.
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
    if new.status = 'cancelled' and old.status not in ('pending', 'approved') then
      raise exception 'Only a pending or approved reservation can be cancelled.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
--
-- Row level security decides who may see and change what; these grants are the
-- coarser permission to attempt it at all. Supabase usually hands them out
-- through default privileges, but this schema is meant to drop into an existing
-- project whose defaults may have been changed, so they are stated explicitly.
--
-- Missing the sequence grant is the specific trap: without it every student
-- insert fails on the reservation reference number, not on anything visible.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on
  cars_vehicles, cars_destinations, cars_settings
  to anon, authenticated;

grant select, insert, update on cars_profiles      to authenticated;
grant select, insert, update, delete on cars_reservations to authenticated;
grant select, insert, update, delete on cars_waitlist     to authenticated;
grant select, insert, update, delete on cars_payments     to authenticated;
grant select, insert, update, delete on cars_blackouts    to authenticated;
grant insert, update, delete on cars_vehicles      to authenticated;
grant insert, update, delete on cars_destinations  to authenticated;
grant insert, update, delete on cars_settings      to authenticated;
grant select, insert on cars_activity  to authenticated;
grant select on cars_email_log         to authenticated;
grant select on cars_student_balances  to authenticated;

grant usage, select on sequence cars_reservation_ref_seq to authenticated;
grant usage, select on sequence cars_activity_id_seq     to authenticated;
