-- ============================================================================
-- YGEP Car Rental -- waitlist and outbound email log
--
-- Additive, like the earlier migrations: only cars_* objects are created.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Waitlist
--
-- A student who finds their window already taken can put their name down. The
-- office sees the queue in order; students only ever see how many people are
-- waiting, never who they are.
-- ---------------------------------------------------------------------------

create table if not exists cars_waitlist (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid        not null references cars_profiles (id) on delete cascade,
  vehicle_id        uuid        references cars_vehicles (id) on delete cascade,

  starts_at         timestamptz not null,
  ends_at           timestamptz not null,

  status            text        not null default 'waiting'
                                check (status in ('waiting','offered','converted','expired','cancelled')),

  destination_id    uuid        references cars_destinations (id) on delete set null,
  destination_label text        not null default '',
  purpose           text        not null default '',
  flexible          boolean     not null default false,
  student_notes     text        not null default '',
  admin_notes       text        not null default '',

  offered_at        timestamptz,
  offered_by        uuid        references cars_profiles (id) on delete set null,
  offer_expires_at  timestamptz,
  converted_reservation_id uuid references cars_reservations (id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint cars_waitlist_time_order check (ends_at > starts_at)
);

comment on column cars_waitlist.vehicle_id is
  'NULL means the student will take whichever car frees up.';
comment on column cars_waitlist.flexible is
  'Student said nearby times would also work, so the office has room to move.';

create index if not exists cars_waitlist_window_idx on cars_waitlist (starts_at, ends_at);
create index if not exists cars_waitlist_user_idx   on cars_waitlist (user_id, created_at desc);
create index if not exists cars_waitlist_open_idx   on cars_waitlist (status, created_at)
  where status in ('waiting', 'offered');

-- One live entry per student per window per car, so a double submit or an
-- impatient refresh does not stack the queue.
create unique index if not exists cars_waitlist_no_duplicates
  on cars_waitlist (user_id, coalesce(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid), starts_at, ends_at)
  where status in ('waiting', 'offered');

drop trigger if exists cars_waitlist_touch on cars_waitlist;
create trigger cars_waitlist_touch before update on cars_waitlist
  for each row execute function cars_touch_updated_at();

-- Students may only ever add themselves, as 'waiting'.
create or replace function cars_waitlist_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not cars_is_admin() then
    new.user_id := auth.uid();
    if tg_op = 'INSERT' then
      -- OLD is not assigned on an insert, so this branch must not touch it.
      new.status      := 'waiting';
      new.admin_notes := '';
    else
      new.admin_notes := old.admin_notes;
      if new.status <> old.status and new.status <> 'cancelled' then
        raise exception 'Students may only cancel a waitlist entry.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cars_waitlist_guard_trg on cars_waitlist;
create trigger cars_waitlist_guard_trg before insert or update on cars_waitlist
  for each row execute function cars_waitlist_guard();

alter table cars_waitlist enable row level security;

drop policy if exists cars_waitlist_select on cars_waitlist;
create policy cars_waitlist_select on cars_waitlist
  for select to authenticated
  using (user_id = auth.uid() or cars_is_admin());

drop policy if exists cars_waitlist_insert on cars_waitlist;
create policy cars_waitlist_insert on cars_waitlist
  for insert to authenticated
  with check (cars_is_admin() or (user_id = auth.uid() and cars_is_active_member()));

drop policy if exists cars_waitlist_update on cars_waitlist;
create policy cars_waitlist_update on cars_waitlist
  for update to authenticated
  using (user_id = auth.uid() or cars_is_admin())
  with check (user_id = auth.uid() or cars_is_admin());

drop policy if exists cars_waitlist_delete_admin on cars_waitlist;
create policy cars_waitlist_delete_admin on cars_waitlist
  for delete to authenticated
  using (cars_is_admin());

-- How many people are waiting on a window. Security definer so a student gets
-- the number without being able to read anybody else's row.
create or replace function cars_waitlist_count(
  p_start   timestamptz,
  p_end     timestamptz,
  p_vehicle uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from cars_waitlist w
   where w.status in ('waiting', 'offered')
     and (p_vehicle is null or w.vehicle_id is null or w.vehicle_id = p_vehicle)
     and tstzrange(w.starts_at, w.ends_at, '[)') && tstzrange(p_start, p_end, '[)');
$$;

revoke all on function cars_waitlist_count(timestamptz, timestamptz, uuid) from public;
grant execute on function cars_waitlist_count(timestamptz, timestamptz, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Outbound email log
--
-- Every notification attempt is recorded, so when the office says "we never got
-- an email" there is somewhere to look.
-- ---------------------------------------------------------------------------

create table if not exists cars_email_log (
  id           uuid primary key default gen_random_uuid(),
  to_email     text        not null,
  subject      text        not null,
  kind         text        not null,
  entity_type  text        not null default '',
  entity_id    uuid,
  status       text        not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  provider_id  text        not null default '',
  error        text        not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists cars_email_log_created_idx on cars_email_log (created_at desc);

alter table cars_email_log enable row level security;

drop policy if exists cars_email_log_select_admin on cars_email_log;
create policy cars_email_log_select_admin on cars_email_log
  for select to authenticated
  using (cars_is_admin());

-- ---------------------------------------------------------------------------
-- Notification settings
-- ---------------------------------------------------------------------------

insert into cars_settings (key, value) values
  ('notify_office_emails',    '[]'::jsonb),
  ('notify_on_new_request',   'true'::jsonb),
  ('notify_on_cancellation',  'true'::jsonb),
  ('notify_on_new_account',   'true'::jsonb),
  ('notify_on_waitlist',      'true'::jsonb),
  ('waitlist_enabled',        'true'::jsonb)
on conflict (key) do nothing;
