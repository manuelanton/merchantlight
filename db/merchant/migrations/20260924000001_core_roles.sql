-- Merchantlight — core: roles, profiles, settings
--
-- Roles are NEVER chosen by the client. `discord_role` is written only by the
-- server at login (upsert_discord_profile) from the user's actual
-- Discord guild roles. The Owner may set a `role_override` via RPC.
-- Money / quantities are `double precision` on purpose: Postgres drivers return
-- `numeric` as strings, which breaks arithmetic in the frontend.
--
-- Everything lives in its own schema `merchant`, next to the old tables in `public`,
-- which must not be touched.

create schema merchant;
grant usage on schema merchant to merchant_app;

create type merchant.app_role as enum ('owner', 'manager', 'employee', 'supplier', 'visitor');

create table merchant.profiles (
  id             uuid primary key default gen_random_uuid(),
  discord_id     text unique,
  username       text,
  display_name   text,
  avatar_url     text,
  discord_role   merchant.app_role not null default 'visitor',
  role_override  merchant.app_role,
  role           merchant.app_role generated always as (coalesce(role_override, discord_role)) stored,
  in_guild       boolean not null default false,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz,
  last_synced_at timestamptz
);

-- Role helpers (used by RLS policies and RPCs) -------------------------------

create function merchant.my_role() returns merchant.app_role
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role from merchant.profiles p where p.id = merchant_auth.uid()), 'visitor'::merchant.app_role)
$$;

create function merchant.is_owner() returns boolean
language sql stable set search_path = '' as $$
  select merchant.my_role() = 'owner'
$$;

-- Owner + Manager: full operational rights.
create function merchant.is_manager() returns boolean
language sql stable set search_path = '' as $$
  select merchant.my_role() in ('owner', 'manager')
$$;

-- Everyone who works in the merchant.
create function merchant.is_staff() returns boolean
language sql stable set search_path = '' as $$
  select merchant.my_role() in ('owner', 'manager', 'employee')
$$;

create function merchant.can_view_materials() returns boolean
language sql stable set search_path = '' as $$
  select merchant.my_role() in ('owner', 'manager', 'employee', 'supplier')
$$;

create function merchant._require(p_ok boolean, p_what text default 'this action') returns void
language plpgsql stable set search_path = '' as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'Not allowed: your role cannot perform %', p_what using errcode = '42501';
  end if;
end $$;

create function merchant._actor_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(p.display_name, p.username, 'Unknown') from merchant.profiles p where p.id = merchant_auth.uid()
$$;

-- Owner-only role override (null clears it and falls back to the Discord role).
create function merchant.set_role_override(p_user uuid, p_role merchant.app_role)
returns merchant.profiles
language plpgsql security definer set search_path = '' as $$
declare v merchant.profiles;
begin
  perform merchant._require(merchant.is_owner(), 'user management');
  if p_user = merchant_auth.uid() then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  update merchant.profiles set role_override = p_role where id = p_user returning * into v;
  if not found then raise exception 'User not found'; end if;
  return v;
end $$;

-- Settings (single row) -------------------------------------------------------

create table merchant.settings (
  id                int primary key default 1 check (id = 1),
  safety_buffer     double precision not null default 0 check (safety_buffer >= 0),
  commission_rate   double precision not null default 0.10 check (commission_rate between 0 and 1),
  low_stock_default double precision not null default 5 check (low_stock_default >= 0),
  currency_symbol   text not null default 'g',
  updated_at        timestamptz not null default now(),
  updated_by        uuid references merchant.profiles (id) on delete set null
);
insert into merchant.settings default values;

create function merchant._touch_settings() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.id := 1;
  new.updated_at := now();
  new.updated_by := merchant_auth.uid();
  return new;
end $$;

create trigger settings_touch before update on merchant.settings
  for each row execute function merchant._touch_settings();

create function merchant._touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
