-- Merchantlight — what Supabase provided for the Forge, on plain Postgres (Neon).
--
-- The server opens a transaction, runs `set local role merchant_app` and sets
-- `merchant.user_id` from the verified login. RLS and grants then apply exactly
-- as they did for Supabase's `authenticated` role. The old tables in `public`
-- stay untouched; this schema lives next to them until the cutover.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'merchant_app') then
    create role merchant_app nologin;
  end if;
end $$;

-- `set local role` needs this membership (Postgres 16+ doesn't imply it for the creator).
grant merchant_app to current_user;

create schema merchant_auth;
grant usage on schema merchant_auth to merchant_app;

-- Stand-in for Supabase's auth.uid(): the profile id of the signed-in user.
create function merchant_auth.uid() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('merchant.user_id', true), '')::uuid
$$;
grant execute on function merchant_auth.uid() to merchant_app;
