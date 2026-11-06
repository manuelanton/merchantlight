-- Merchantlight — profiles come from the Discord login.
--
-- Replaces the Forge's auth.users trigger and Edge Function. The server calls this
-- after it has read the user's real guild roles, on its own connection and not as
-- merchant_app, so a signed-in user can never choose their role. A profile keeps
-- its id (and so its history) across logins; role_override is left alone. Without
-- p_login it is a role re-check by the bot, which doesn't count as a login.

create function merchant.upsert_discord_profile(
  p_discord_id   text,
  p_username     text,
  p_display_name text,
  p_avatar_url   text,
  p_role         merchant.app_role,
  p_in_guild     boolean,
  p_login        boolean default true
) returns merchant.profiles
language sql security definer set search_path = '' as $$
  insert into merchant.profiles as p
    (discord_id, username, display_name, avatar_url, discord_role, in_guild, last_login_at, last_synced_at)
  values (p_discord_id, p_username, p_display_name, p_avatar_url, p_role, p_in_guild,
          case when p_login then now() end, now())
  on conflict (discord_id) do update set
    username       = coalesce(excluded.username, p.username),
    display_name   = coalesce(excluded.display_name, p.display_name),
    avatar_url     = coalesce(excluded.avatar_url, p.avatar_url),
    discord_role   = excluded.discord_role,
    in_guild       = excluded.in_guild,
    last_login_at  = coalesce(excluded.last_login_at, p.last_login_at),
    last_synced_at = excluded.last_synced_at
  returning p.*
$$;

revoke execute on function merchant.upsert_discord_profile(text, text, text, text, merchant.app_role, boolean, boolean)
  from public, merchant_app;
