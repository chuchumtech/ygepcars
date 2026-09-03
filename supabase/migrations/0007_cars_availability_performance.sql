-- ============================================================================
-- YGEP Car Rental -- make availability cheap
--
-- The unpaid-hold rule is evaluated when availability is read rather than
-- swept by a scheduled job. That is the right call -- there is no window where
-- a car is wrongly held, nothing to fail overnight, and changing the setting
-- takes effect immediately -- but the first cut of it was slow for two reasons:
--
--   1. The rule was a per-row function that itself looked up the setting, so a
--      single availability check did one settings lookup per reservation.
--   2. The only range index was the exclusion constraint, which covers only
--      confirmed rows. Pending rows fell back to a sequential scan.
--
-- Measured on 2,600 reservations: ~2.6s cold, ~10ms warm, growing linearly.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- One source of truth for the rule, shaped so the planner can use it
--
-- Taking no arguments and being stable means Postgres evaluates this once per
-- query and treats it as a constant, instead of per row.
-- ---------------------------------------------------------------------------

create or replace function cars_unpaid_hold_cutoff()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now() - make_interval(hours => cars_setting_int('payment_hold_hours', 12));
$$;

comment on function cars_unpaid_hold_cutoff() is
  'A pending reservation requested before this moment, and still unpaid, has
   stopped holding its car. The reservation itself stays pending.';

revoke all on function cars_unpaid_hold_cutoff() from public;
grant execute on function cars_unpaid_hold_cutoff() to anon, authenticated;

-- Kept in terms of the same cutoff so the two can never disagree.
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
      or p_requested_at > cars_unpaid_hold_cutoff()
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Index the rows availability actually looks at
--
-- The exclusion constraint's index only covers confirmed rows, because that is
-- all it needs to police. This one covers every status that can block a car,
-- pending included, so the overlap test is an index lookup rather than a scan.
-- ---------------------------------------------------------------------------

create index if not exists cars_reservations_blocking_range_idx
  on cars_reservations
  using gist (vehicle_id, tstzrange(starts_at, ends_at, '[)'))
  where status in ('pending', 'hold', 'approved', 'completed');

create index if not exists cars_blackouts_range_idx
  on cars_blackouts
  using gist (vehicle_id, tstzrange(starts_at, ends_at, '[)'));

-- ---------------------------------------------------------------------------
-- Availability, with the rule inlined so it can be pushed into the index scan
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
          -- Same rule as cars_reservation_blocks_car, written out so the
          -- planner can combine it with the index above.
          and (
            r.status <> 'pending'
            or r.payment_received_at is not null
            or r.requested_at > cars_unpaid_hold_cutoff()
          )
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
     and (
       r.status <> 'pending'
       or r.payment_received_at is not null
       or r.requested_at > cars_unpaid_hold_cutoff()
     )
  union all
  select b.vehicle_id, b.starts_at, b.ends_at, 'maintenance'
    from cars_blackouts b
   where tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_from, p_to, '[)');
$$;

revoke all on function cars_availability(timestamptz, timestamptz) from public;
grant execute on function cars_availability(timestamptz, timestamptz) to anon, authenticated;
revoke all on function cars_busy_windows(timestamptz, timestamptz) from public;
grant execute on function cars_busy_windows(timestamptz, timestamptz) to anon, authenticated;
