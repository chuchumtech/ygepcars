-- ============================================================================
-- YGEP Car Rental -- row level security
--
-- Rules of thumb:
--   * A student sees themselves, their own reservations, and their own money.
--   * A student sees cars and destinations, because they need them to book.
--   * A student never sees another student's name, notes or reservations.
--   * Admins see everything.
--   * Availability is exposed through a security-definer function so a student
--     can learn "that car is taken 2-6pm" without learning who took it.
-- ============================================================================

alter table cars_profiles     enable row level security;
alter table cars_vehicles     enable row level security;
alter table cars_destinations enable row level security;
alter table cars_reservations enable row level security;
alter table cars_blackouts    enable row level security;
alter table cars_payments     enable row level security;
alter table cars_settings     enable row level security;
alter table cars_activity     enable row level security;

-- --- profiles --------------------------------------------------------------

drop policy if exists cars_profiles_select_self  on cars_profiles;
create policy cars_profiles_select_self on cars_profiles
  for select to authenticated
  using (id = auth.uid() or cars_is_admin());

drop policy if exists cars_profiles_update_self  on cars_profiles;
create policy cars_profiles_update_self on cars_profiles
  for update to authenticated
  using (id = auth.uid() or cars_is_admin())
  with check (id = auth.uid() or cars_is_admin());

-- Profile rows are created server-side with the service role right after
-- sign-up, so no INSERT policy is granted to end users on purpose.

drop policy if exists cars_profiles_delete_admin on cars_profiles;
create policy cars_profiles_delete_admin on cars_profiles
  for delete to authenticated
  using (cars_is_admin());

-- --- vehicles --------------------------------------------------------------

-- Anonymous visitors can browse the fleet and check availability before they
-- register; only booking requires an account.
drop policy if exists cars_vehicles_select on cars_vehicles;
create policy cars_vehicles_select on cars_vehicles
  for select to anon, authenticated
  using (true);

drop policy if exists cars_vehicles_write_admin on cars_vehicles;
create policy cars_vehicles_write_admin on cars_vehicles
  for all to authenticated
  using (cars_is_admin())
  with check (cars_is_admin());

-- --- destinations ----------------------------------------------------------

drop policy if exists cars_destinations_select on cars_destinations;
create policy cars_destinations_select on cars_destinations
  for select to anon, authenticated
  using (true);

drop policy if exists cars_destinations_write_admin on cars_destinations;
create policy cars_destinations_write_admin on cars_destinations
  for all to authenticated
  using (cars_is_admin())
  with check (cars_is_admin());

-- --- reservations ----------------------------------------------------------

drop policy if exists cars_reservations_select on cars_reservations;
create policy cars_reservations_select on cars_reservations
  for select to authenticated
  using (user_id = auth.uid() or cars_is_admin());

drop policy if exists cars_reservations_insert on cars_reservations;
create policy cars_reservations_insert on cars_reservations
  for insert to authenticated
  with check (
    cars_is_admin()
    or (user_id = auth.uid() and cars_is_active_member())
  );

drop policy if exists cars_reservations_update on cars_reservations;
create policy cars_reservations_update on cars_reservations
  for update to authenticated
  using (user_id = auth.uid() or cars_is_admin())
  with check (user_id = auth.uid() or cars_is_admin());

drop policy if exists cars_reservations_delete_admin on cars_reservations;
create policy cars_reservations_delete_admin on cars_reservations
  for delete to authenticated
  using (cars_is_admin());

-- --- blackouts -------------------------------------------------------------

drop policy if exists cars_blackouts_select on cars_blackouts;
create policy cars_blackouts_select on cars_blackouts
  for select to authenticated
  using (true);

drop policy if exists cars_blackouts_write_admin on cars_blackouts;
create policy cars_blackouts_write_admin on cars_blackouts
  for all to authenticated
  using (cars_is_admin())
  with check (cars_is_admin());

-- --- payments --------------------------------------------------------------

drop policy if exists cars_payments_select on cars_payments;
create policy cars_payments_select on cars_payments
  for select to authenticated
  using (user_id = auth.uid() or cars_is_admin());

drop policy if exists cars_payments_write_admin on cars_payments;
create policy cars_payments_write_admin on cars_payments
  for all to authenticated
  using (cars_is_admin())
  with check (cars_is_admin());

-- --- settings --------------------------------------------------------------

drop policy if exists cars_settings_select on cars_settings;
create policy cars_settings_select on cars_settings
  for select to authenticated
  using (true);

drop policy if exists cars_settings_write_admin on cars_settings;
create policy cars_settings_write_admin on cars_settings
  for all to authenticated
  using (cars_is_admin())
  with check (cars_is_admin());

-- --- activity --------------------------------------------------------------

drop policy if exists cars_activity_select_admin on cars_activity;
create policy cars_activity_select_admin on cars_activity
  for select to authenticated
  using (cars_is_admin());

-- ============================================================================
-- Availability
--
-- Returns one row per vehicle for the requested window. A student calling this
-- learns whether a car is free, and why it is not, without being able to read
-- anyone else's reservation row.
-- ============================================================================

create or replace function cars_availability(p_start timestamptz, p_end timestamptz)
returns table (
  vehicle_id  uuid,
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
    blocked.kind is null           as is_available,
    coalesce(blocked.kind, '')     as reason
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
      select case when r.status = 'pending' then 'requested' else 'booked' end, 2
        from cars_reservations r
        where r.vehicle_id = v.id
          and r.status in ('pending', 'approved', 'completed')
          and tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
    ) k
    order by rank
    limit 1
  ) blocked on true;
$$;

revoke all on function cars_availability(timestamptz, timestamptz) from public;
grant execute on function cars_availability(timestamptz, timestamptz) to anon, authenticated;

-- ============================================================================
-- Busy windows -- lets the student-facing UI grey out taken slots on a
-- timeline without leaking who booked them.
-- ============================================================================

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
         case when r.status = 'pending' then 'requested' else 'booked' end
    from cars_reservations r
   where r.status in ('pending', 'approved', 'completed')
     and tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(p_from, p_to, '[)')
  union all
  select b.vehicle_id, b.starts_at, b.ends_at, 'maintenance'
    from cars_blackouts b
   where tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_from, p_to, '[)');
$$;

revoke all on function cars_busy_windows(timestamptz, timestamptz) from public;
grant execute on function cars_busy_windows(timestamptz, timestamptz) to anon, authenticated;

-- ============================================================================
-- Student account balance: everything owed on non-cancelled reservations,
-- minus everything recorded as paid.
-- ============================================================================

-- security_invoker keeps RLS in force through the view: a student sees only
-- their own line, an admin sees everyone's.
create or replace view cars_student_balances
  with (security_invoker = true)
  as select
    p.id                                            as user_id,
    coalesce(charges.total_cents, 0)                as charged_cents,
    coalesce(paid.total_cents, 0)                   as paid_cents,
    coalesce(charges.total_cents, 0)
      - coalesce(paid.total_cents, 0)               as balance_cents,
    coalesce(charges.reservation_count, 0)          as reservation_count
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
