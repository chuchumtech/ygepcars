create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create table if not exists public._test_current_user (id uuid);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select id from public._test_current_user limit 1 $$;
