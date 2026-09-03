-- ============================================================================
-- YGEP Car Rental -- off Shabbosim
--
-- A Shabbos the yeshiva is off. Purely a label: it is drawn on the date picker
-- and the office calendar so everyone can see it coming, and it blocks nothing.
-- Those are usually the weekends students most want a car, so the office wants
-- the requests -- just with their eyes open.
-- ============================================================================

create table if not exists cars_off_shabbosim (
  shabbos_on date primary key,
  label      text        not null default '',
  note       text        not null default '',
  created_by uuid        references cars_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table cars_off_shabbosim is
  'One row per Shabbos the yeshiva is off. The primary key is the Saturday
   itself, so marking one twice is impossible.';
comment on column cars_off_shabbosim.label is
  'What kind of off Shabbos, e.g. "Bein hazmanim" or "Yeshiva closed".';

alter table cars_off_shabbosim enable row level security;

-- Students see these on the picker, so the list is readable by anyone; only
-- the office can change it.
drop policy if exists cars_off_shabbosim_select on cars_off_shabbosim;
create policy cars_off_shabbosim_select on cars_off_shabbosim
  for select to anon, authenticated
  using (true);

drop policy if exists cars_off_shabbosim_write_admin on cars_off_shabbosim;
create policy cars_off_shabbosim_write_admin on cars_off_shabbosim
  for all to authenticated
  using (cars_is_admin())
  with check (cars_is_admin());

grant select on cars_off_shabbosim to anon, authenticated;
grant insert, update, delete on cars_off_shabbosim to authenticated;
