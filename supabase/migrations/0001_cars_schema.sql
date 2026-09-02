-- ============================================================================
-- YGEP Car Rental -- schema
--
-- This migration is ADDITIVE ONLY. It is designed to run inside a Supabase
-- project that already hosts another application, so every object it creates
-- is namespaced with the `cars_` prefix and nothing outside that prefix is
-- read, altered or dropped.
--
-- Membership in the car-rental app is defined by having a row in
-- `cars_profiles`. Users of the other app that share this project's
-- auth.users table simply have no cars_profiles row and are invisible here.
-- ============================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function cars_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles -- one row per person who uses the car system
-- ---------------------------------------------------------------------------

create table if not exists cars_profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  full_name         text        not null default '',
  email             text        not null default '',
  phone             text        not null default '',
  role              text        not null default 'student'
                                check (role in ('student', 'admin')),
  status            text        not null default 'pending'
                                check (status in ('pending', 'active', 'locked')),
  license_number    text        not null default '',
  license_expires_on date,
  address           text        not null default '',
  emergency_contact text        not null default '',
  notes             text        not null default '',
  locked_reason     text        not null default '',
  approved_at       timestamptz,
  approved_by       uuid        references cars_profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists cars_profiles_role_idx   on cars_profiles (role);
create index if not exists cars_profiles_status_idx on cars_profiles (status);
create index if not exists cars_profiles_name_idx   on cars_profiles (lower(full_name));

drop trigger if exists cars_profiles_touch on cars_profiles;
create trigger cars_profiles_touch before update on cars_profiles
  for each row execute function cars_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so they can read cars_profiles under RLS)
-- ---------------------------------------------------------------------------

create or replace function cars_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cars_profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

create or replace function cars_is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cars_profiles
    where id = auth.uid()
      and status = 'active'
  );
$$;

-- A student may never promote themselves or unlock their own account.
create or replace function cars_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not cars_is_admin() then
    new.role          := old.role;
    new.status        := old.status;
    new.locked_reason := old.locked_reason;
    new.approved_at   := old.approved_at;
    new.approved_by   := old.approved_by;
    new.notes         := old.notes;
  end if;
  return new;
end;
$$;

drop trigger if exists cars_profiles_guard_trg on cars_profiles;
create trigger cars_profiles_guard_trg before update on cars_profiles
  for each row execute function cars_profiles_guard();

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------

create table if not exists cars_vehicles (
  id                 uuid primary key default gen_random_uuid(),
  name               text        not null,
  year               int,
  make               text        not null default '',
  model              text        not null default '',
  color              text        not null default '',
  license_plate      text        not null default '',
  seats              int,
  image_url          text        not null default '',
  hourly_rate_cents  int         not null default 1500 check (hourly_rate_cents >= 0),
  daily_cap_cents    int                              check (daily_cap_cents  >= 0),
  minimum_hours      numeric(6,2) not null default 1  check (minimum_hours    >  0),
  is_active          boolean     not null default true,
  notes              text        not null default '',
  sort_order         int         not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column cars_vehicles.daily_cap_cents is
  'Most a single 24h block can be charged. NULL means no cap -- straight hourly.';

create index if not exists cars_vehicles_active_idx on cars_vehicles (is_active, sort_order);

drop trigger if exists cars_vehicles_touch on cars_vehicles;
create trigger cars_vehicles_touch before update on cars_vehicles
  for each row execute function cars_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Destinations -- preset places with a flat estimated toll charge
-- ---------------------------------------------------------------------------

create table if not exists cars_destinations (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  toll_cents  int         not null default 0 check (toll_cents >= 0),
  description text        not null default '',
  is_active   boolean     not null default true,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cars_destinations_active_idx on cars_destinations (is_active, sort_order);

drop trigger if exists cars_destinations_touch on cars_destinations;
create trigger cars_destinations_touch before update on cars_destinations
  for each row execute function cars_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------

create sequence if not exists cars_reservation_ref_seq start 1001;

create table if not exists cars_reservations (
  id                  uuid primary key default gen_random_uuid(),
  reference           text        not null unique
                                  default ('R-' || nextval('cars_reservation_ref_seq')::text),
  user_id             uuid        not null references cars_profiles (id) on delete restrict,
  vehicle_id          uuid        not null references cars_vehicles (id) on delete restrict,

  starts_at           timestamptz not null,
  ends_at             timestamptz not null,

  status              text        not null default 'pending'
                                  check (status in ('pending','approved','declined','cancelled','completed')),

  destination_id      uuid        references cars_destinations (id) on delete set null,
  destination_label   text        not null default '',
  purpose             text        not null default '',

  -- Pricing is snapshotted at request time so later rate changes never
  -- silently rewrite what a student was quoted.
  hourly_rate_cents   int         not null default 0 check (hourly_rate_cents >= 0),
  daily_cap_cents     int                            check (daily_cap_cents   >= 0),
  billable_hours      numeric(10,2) not null default 0,
  time_charge_cents   int         not null default 0 check (time_charge_cents >= 0),
  toll_cents          int         not null default 0 check (toll_cents        >= 0),
  adjustment_cents    int         not null default 0,
  adjustment_reason   text        not null default '',
  total_cents         int         not null default 0,

  student_notes       text        not null default '',
  admin_notes         text        not null default '',
  decline_reason      text        not null default '',

  requested_at        timestamptz not null default now(),
  decided_at          timestamptz,
  decided_by          uuid        references cars_profiles (id) on delete set null,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint cars_reservations_time_order check (ends_at > starts_at)
);

create index if not exists cars_reservations_window_idx  on cars_reservations (starts_at, ends_at);
create index if not exists cars_reservations_vehicle_idx on cars_reservations (vehicle_id, starts_at);
create index if not exists cars_reservations_user_idx    on cars_reservations (user_id, starts_at desc);
create index if not exists cars_reservations_status_idx  on cars_reservations (status);

-- The database itself refuses to double-book a car. Application logic can be
-- raced; this constraint cannot.
alter table cars_reservations drop constraint if exists cars_reservations_no_overlap;
alter table cars_reservations
  add constraint cars_reservations_no_overlap
  exclude using gist (
    vehicle_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('approved', 'completed'));

drop trigger if exists cars_reservations_touch on cars_reservations;
create trigger cars_reservations_touch before update on cars_reservations
  for each row execute function cars_touch_updated_at();

-- Students may only ever file a pending request for themselves.
create or replace function cars_reservations_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not cars_is_admin() then
    new.user_id  := auth.uid();
    new.status   := 'pending';
    new.decided_at := null;
    new.decided_by := null;
    new.adjustment_cents  := 0;
    new.adjustment_reason := '';
    new.admin_notes := '';
  end if;
  return new;
end;
$$;

drop trigger if exists cars_reservations_insert_guard_trg on cars_reservations;
create trigger cars_reservations_insert_guard_trg before insert on cars_reservations
  for each row execute function cars_reservations_insert_guard();

-- A student can only ever cancel; everything else is the office's call.
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
    if new.status = 'cancelled' and old.status not in ('pending', 'approved') then
      raise exception 'Only a pending or approved reservation can be cancelled.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cars_reservations_update_guard_trg on cars_reservations;
create trigger cars_reservations_update_guard_trg before update on cars_reservations
  for each row execute function cars_reservations_update_guard();

-- ---------------------------------------------------------------------------
-- Blackouts -- car is out of service (maintenance, staff use, ...)
-- ---------------------------------------------------------------------------

create table if not exists cars_blackouts (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid        not null references cars_vehicles (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text        not null default '',
  created_by uuid        references cars_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cars_blackouts_time_order check (ends_at > starts_at)
);

create index if not exists cars_blackouts_window_idx on cars_blackouts (vehicle_id, starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- Payments -- money is not processed online, only recorded by the office
-- ---------------------------------------------------------------------------

create table if not exists cars_payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid        not null references cars_profiles (id) on delete cascade,
  reservation_id uuid        references cars_reservations (id) on delete set null,
  amount_cents   int         not null,
  method         text        not null default 'cash'
                             check (method in ('cash','check','zelle','venmo','card','credit','other')),
  reference      text        not null default '',
  note           text        not null default '',
  paid_on        date        not null default current_date,
  recorded_by    uuid        references cars_profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

comment on column cars_payments.amount_cents is
  'Positive = money received. Negative = credit or refund issued to the student.';

create index if not exists cars_payments_user_idx on cars_payments (user_id, paid_on desc);

-- ---------------------------------------------------------------------------
-- Settings -- small key/value bag the office can tune
-- ---------------------------------------------------------------------------

create table if not exists cars_settings (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists cars_settings_touch on cars_settings;
create trigger cars_settings_touch before update on cars_settings
  for each row execute function cars_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------

create table if not exists cars_activity (
  id          bigserial primary key,
  actor_id    uuid        references cars_profiles (id) on delete set null,
  actor_name  text        not null default '',
  entity_type text        not null,
  entity_id   uuid,
  action      text        not null,
  detail      jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists cars_activity_entity_idx  on cars_activity (entity_type, entity_id, created_at desc);
create index if not exists cars_activity_created_idx on cars_activity (created_at desc);
