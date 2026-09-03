-- ============================================================================
-- YGEP Car Rental -- off Shabbosim that run into the Friday or the Sunday
--
-- An off Shabbos is informational: it tells students the yeshiva is out that
-- week. Which days that actually covers varies -- some run from Friday, some
-- through Sunday, some are the Shabbos alone -- so the office says which.
-- Still a label, still blocks nothing.
-- ============================================================================

alter table cars_off_shabbosim
  add column if not exists includes_friday boolean not null default false,
  add column if not exists includes_sunday boolean not null default false;

comment on column cars_off_shabbosim.includes_friday is
  'Whether the Friday before also counts as off, for the picker to mark.';
comment on column cars_off_shabbosim.includes_sunday is
  'Whether the Sunday after also counts as off.';
