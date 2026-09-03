-- ============================================================================
-- YGEP Car Rental -- office holds, and a waitlist the office can reorder
--
-- Two things the office asked for:
--   * Put a car on hold for somebody without confirming it yet, and release it
--     again in one click.
--   * Decide the waitlist order themselves rather than being stuck with
--     whoever asked first.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Holds
--
-- A hold is the office saying "this car is spoken for, I have not confirmed it
-- yet". It blocks the car exactly like an approved booking does, because the
-- whole point is that nobody else can take it in the meantime.
-- ---------------------------------------------------------------------------

alter table cars_reservations
  add column if not exists hold_expires_at timestamptz;

comment on column cars_reservations.hold_expires_at is
  'When a hold should be revisited. Advisory only -- a lapsed hold keeps blocking
   the car until somebody releases it, so a forgotten hold never quietly hands
   the car to someone else.';

alter table cars_reservations
  add column if not exists released_at timestamptz;

alter table cars_reservations
  add column if not exists release_reason text not null default '';

alter table cars_reservations drop constraint if exists cars_reservations_status_check;
alter table cars_reservations
  add constraint cars_reservations_status_check
  check (status in ('pending','hold','approved','declined','cancelled','completed','released'));

-- A hold occupies the car, so it belongs inside the no-double-booking rule.
alter table cars_reservations drop constraint if exists cars_reservations_no_overlap;
alter table cars_reservations
  add constraint cars_reservations_no_overlap
  exclude using gist (
    vehicle_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('hold', 'approved', 'completed'));

-- ---------------------------------------------------------------------------
-- Availability has to know about holds and releases too
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
          and r.status in ('pending', 'hold', 'approved', 'completed')
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
   where r.status in ('pending', 'hold', 'approved', 'completed')
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

-- A held car is not money owed yet, so holds stay out of the balance.
create or replace view cars_student_balances
  with (security_invoker = true)
  as select
    p.id                                   as user_id,
    coalesce(charges.total_cents, 0)       as charged_cents,
    coalesce(paid.total_cents, 0)          as paid_cents,
    coalesce(charges.total_cents, 0)
      - coalesce(paid.total_cents, 0)      as balance_cents,
    coalesce(charges.reservation_count, 0) as reservation_count
  from cars_profiles p
  left join lateral (
    select sum(r.total_cents) as total_cents, count(*) as reservation_count
      from cars_reservations r
     where r.user_id = p.id
       and r.status in ('approved', 'completed')
  ) charges on true
  left join lateral (
    select sum(pm.amount_cents) as total_cents
      from cars_payments pm
     where pm.user_id = p.id
  ) paid on true;

grant select on cars_student_balances to authenticated;

-- Students still may only ever cancel; hold and release are the office's.
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
    new.user_id           := old.user_id;
    new.vehicle_id        := old.vehicle_id;
    new.hourly_rate_cents := old.hourly_rate_cents;
    new.daily_cap_cents   := old.daily_cap_cents;
    new.time_charge_cents := old.time_charge_cents;
    new.toll_cents        := old.toll_cents;
    new.adjustment_cents  := old.adjustment_cents;
    new.total_cents       := old.total_cents;
    new.admin_notes       := old.admin_notes;
    new.decided_at        := old.decided_at;
    new.decided_by        := old.decided_by;
    new.hold_expires_at   := old.hold_expires_at;
    new.released_at       := old.released_at;
    new.release_reason    := old.release_reason;
    if new.status = 'cancelled' and old.status not in ('pending', 'approved') then
      raise exception 'Only a pending or approved reservation can be cancelled.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Waitlist ordering
--
-- position 0 means "never been touched"; those sort after anything the office
-- has deliberately placed, and among themselves by who asked first.
-- ---------------------------------------------------------------------------

alter table cars_waitlist
  add column if not exists position int not null default 0;

comment on column cars_waitlist.position is
  'Office-set order. 0 = unset, which sorts last and falls back to created_at.';

create index if not exists cars_waitlist_position_idx
  on cars_waitlist (position, created_at)
  where status in ('waiting', 'offered');

/**
 * Moves one entry to a given 1-based position in the open queue.
 *
 * Positions are renumbered from the current visible order first, so the office
 * never has to think about the underlying numbers, and rows that have never
 * been reordered slot in predictably.
 */
create or replace function cars_waitlist_move(p_id uuid, p_target int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total   int;
  v_target  int;
begin
  if not cars_is_admin() then
    raise exception 'Only the office can reorder the waitlist.';
  end if;

  if not exists (
    select 1 from cars_waitlist
     where id = p_id and status in ('waiting', 'offered')
  ) then
    raise exception 'That waitlist entry is not open.';
  end if;

  -- Renumber the open queue 1..n in the order it is currently displayed.
  with ordered as (
    select id, row_number() over (
             order by case when position = 0 then 1 else 0 end,
                      position,
                      created_at
           ) as rn
      from cars_waitlist
     where status in ('waiting', 'offered')
  )
  update cars_waitlist w
     set position = ordered.rn
    from ordered
   where w.id = ordered.id;

  select count(*) into v_total
    from cars_waitlist where status in ('waiting', 'offered');

  v_target := greatest(1, least(p_target, v_total));

  -- Renumber everyone else 1..n-1, leaving a gap at the target slot.
  with ordered as (
    select id, row_number() over (order by position, created_at) as rn
      from cars_waitlist
     where status in ('waiting', 'offered') and id <> p_id
  )
  update cars_waitlist w
     set position = case when ordered.rn >= v_target then ordered.rn + 1 else ordered.rn end
    from ordered
   where w.id = ordered.id;

  update cars_waitlist set position = v_target where id = p_id;
end;
$$;

revoke all on function cars_waitlist_move(uuid, int) from public;
grant execute on function cars_waitlist_move(uuid, int) to authenticated;
