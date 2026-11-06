-- Merchantlight — paying the building rent as in the Tavern, and a switch per person for who
-- shares the profit.

-- 1. Building rent -------------------------------------------------------------

alter table merchant.settings
  add column building_rent_per_day double precision not null default 100 check (building_rent_per_day >= 0),
  add column rent_paid_until timestamptz;
grant update (building_rent_per_day, rent_paid_until) on merchant.settings to merchant_app;

-- Days are added from the later of "paid until" and now, and may reach at most 7 days ahead.
create function merchant.pay_building_rent(p_days int, p_amount double precision default null)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  s merchant.settings;
  v_base timestamptz;
  v_cap int;
  v_amount double precision;
begin
  perform merchant._require(merchant.is_manager(), 'paying the building rent');
  if p_days is null or p_days < 1 then raise exception 'Pay at least one day' using errcode = 'P0001'; end if;

  select * into s from merchant.settings where id = 1 for update;
  v_base := greatest(coalesce(s.rent_paid_until, now()), now());
  v_cap := floor(extract(epoch from (now() + interval '7 days' - v_base)) / 86400);
  if p_days > v_cap then
    raise exception 'The rent can only be prepaid 7 days ahead: %',
      case when v_cap <= 0 then 'nothing more can be paid yet' else format('at most %s more day(s) right now', v_cap) end
      using errcode = 'P0001';
  end if;

  v_amount := coalesce(p_amount, round((s.building_rent_per_day * p_days)::numeric, 2)::double precision);
  if v_amount <= 0 then raise exception 'The amount must be above zero' using errcode = 'P0001'; end if;

  update merchant.settings set rent_paid_until = v_base + make_interval(days => p_days) where id = 1
    returning rent_paid_until into v_base;
  perform merchant._book('Rent', 0, v_amount,
    format('Building rent, %s day%s', p_days, case when p_days = 1 then '' else 's' end), 'building_rent', null);
  return v_base;
end $$;

grant execute on function merchant.pay_building_rent(int, double precision) to merchant_app;

-- 2. Who shares the profit -----------------------------------------------------

-- Empty follows the role: Owners and Managers share, Employees don't. The switch overrides that.
alter table merchant.profiles add column profit_share boolean;

create function merchant.set_profit_share(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform merchant._require(merchant.is_owner(), 'changing who shares the profit');
  update merchant.profiles set profit_share = p_on where id = p_user;
  if not found then raise exception 'User not found' using errcode = 'P0001'; end if;
end $$;

grant execute on function merchant.set_profit_share(uuid, boolean) to merchant_app;

-- Who shares right now. Only people who have logged in have a profile. Closed weeks keep the
-- shares they were closed with.
create or replace function merchant._partners()
returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(p.display_name, p.username, 'Unknown')
  from merchant.profiles p
  where p.in_guild and p.role in ('owner', 'manager', 'employee')
    and coalesce(p.profit_share, p.role in ('owner', 'manager'))
  order by 2
$$;
