-- ============================================================================
-- YGEP Car Rental -- somewhere to keep the car photos
--
-- The photos used to be files committed under /public, which meant changing a
-- car's picture was a code change and a deploy. They live in Supabase Storage
-- now, so the office uploads one from the portal and it is live.
--
-- The bucket is public: these are pictures of two cars on a page anybody can
-- see before signing in, and a signed URL would only add an expiry to work
-- around. There is deliberately NO insert, update or delete policy on
-- storage.objects for it -- writes go through the service-role client in
-- `uploadCarPhoto`, which sits behind `requireAdmin()`, so nobody holding an
-- anon or a student token can put anything in the bucket.
--
-- Wrapped in a guard so the migration is still runnable against the plain
-- Postgres the schema tests use, which has no storage schema.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'no storage schema (plain Postgres) -- skipping the photo bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'cars-photos',
    'cars-photos',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  )
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Reading is what a public bucket already allows through the object URL; the
  -- policy only matters for anything listing the bucket through the API.
  execute $ddl$
    drop policy if exists cars_photos_read on storage.objects
  $ddl$;
  execute $ddl$
    create policy cars_photos_read on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'cars-photos')
  $ddl$;
end $$;
