-- ============================================================================
-- YGEP Car Rental -- first and last name, and how the student pays
--
-- full_name is kept and kept correct. Dozens of queries, joins and screens
-- select it, so rather than rewrite them all, it becomes a derived column: a
-- trigger rebuilds it from first_name and last_name whenever either is set.
-- ============================================================================

alter table cars_profiles add column if not exists first_name text not null default '';
alter table cars_profiles add column if not exists last_name  text not null default '';

alter table cars_profiles
  add column if not exists payment_method text not null default 'cash';

alter table cars_profiles drop constraint if exists cars_profiles_payment_method_check;
alter table cars_profiles
  add constraint cars_profiles_payment_method_check
  check (payment_method in ('zelle', 'cash'));

comment on column cars_profiles.payment_method is
  'How this student expects to pay the office. Zelle or cash.';
comment on column cars_profiles.full_name is
  'Derived from first_name and last_name by cars_profiles_sync_name(). Do not
   write it directly -- set the parts instead.';

-- Split whatever names already exist: everything before the first space is the
-- first name, the remainder is the last name, so "Levi Yitzchok Green" keeps
-- its middle name attached to the surname rather than losing it.
update cars_profiles
   set first_name = split_part(full_name, ' ', 1),
       last_name  = ltrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1))
 where first_name = ''
   and last_name  = ''
   and full_name <> '';

/**
 * Keeps full_name in step with the parts.
 *
 * Falls back to leaving full_name alone when both parts are blank, so a row
 * written by an older code path is not blanked out.
 */
create or replace function cars_profiles_sync_name()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.first_name, '') <> '' or coalesce(new.last_name, '') <> '' then
    new.full_name := btrim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  end if;
  return new;
end;
$$;

-- Named to sort after cars_profiles_guard_trg, so the guard restores any field
-- a student is not allowed to change before the name is rebuilt from it.
drop trigger if exists cars_profiles_sync_name_trg on cars_profiles;
create trigger cars_profiles_sync_name_trg
  before insert or update on cars_profiles
  for each row execute function cars_profiles_sync_name();

create index if not exists cars_profiles_last_name_idx on cars_profiles (lower(last_name));
