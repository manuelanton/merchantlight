-- Merchantlight — the General Goods Store's own rules on top of the ported engine.
--
-- 1. Stock works like the Tavern: a sale takes exactly what was sold, nothing is refused and
--    stock may go negative (that shows the count is off). Goods are never crafted during a
--    sale. Low stock is a warning, not a stop.
-- 2. Money: profit and expenses are divided by the number of Owners and Managers. No
--    commission, no quotas. A finished week is closed once and stays fixed, so a new Manager
--    never changes old shares.

-- 1. Stock ---------------------------------------------------------------------

alter table merchant.materials drop constraint materials_stock_check;
alter table merchant.goods drop constraint goods_stock_check;

create or replace function merchant._apply_stock(
  p_kind text, p_id uuid, p_delta double precision, p_reason merchant.stock_reason,
  p_note text, p_ref_type text, p_ref_id uuid, p_reverses bigint default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_stock double precision;
  v_name  text;
  v_after double precision;
  v_id    bigint;
begin
  if p_delta is null or p_delta = 0 then return null; end if;

  if p_kind = 'material' then
    select stock, name into v_stock, v_name from merchant.materials where id = p_id for update;
  elsif p_kind = 'good' then
    select stock, name into v_stock, v_name from merchant.goods where id = p_id for update;
  else
    raise exception 'Unknown item kind %', p_kind;
  end if;
  if not found then raise exception '% % not found', p_kind, p_id; end if;

  v_after := round((v_stock + p_delta)::numeric, 6)::double precision;

  if p_kind = 'material' then
    update merchant.materials set stock = v_after where id = p_id;
  else
    update merchant.goods set stock = v_after where id = p_id;
  end if;

  insert into merchant.stock_movements (
    material_id, good_id, item_kind, item_name, delta, stock_after, reason, note,
    ref_type, ref_id, reverses_id, actor_id, actor_name)
  values (
    case when p_kind = 'material' then p_id end,
    case when p_kind = 'good' then p_id end,
    p_kind, v_name, p_delta, v_after, p_reason, p_note,
    p_ref_type, p_ref_id, p_reverses, merchant_auth.uid(), merchant._actor_name())
  returning id into v_id;
  return v_id;
end $$;

-- Crafting isn't refused either. The details still say what was short.
create or replace function merchant._execute_plan(
  p_plan jsonb, p_reason merchant.stock_reason, p_note text, p_ref_type text, p_ref_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_details jsonb := merchant._plan_details(p_plan);
  x record;
begin
  for x in select * from jsonb_to_recordset(p_plan) as r (kind text, item_id uuid, qty double precision) loop
    perform merchant._apply_stock(x.kind, x.item_id, -x.qty, p_reason, p_note, p_ref_type, p_ref_id);
  end loop;
  return v_details;
end $$;

-- A bundle is sold as its parts: its own stock never moves, the recipe's items do.
alter table merchant.goods add column is_bundle boolean not null default false;
comment on column merchant.goods.is_bundle is 'Sold as its recipe components (e.g. backpack + bedroll at one price).';
grant insert (is_bundle), update (is_bundle) on merchant.goods to merchant_app;

create or replace function merchant._sale_plan(p_sale uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'item_id', s.item_id, 'qty', s.qty)), '[]'::jsonb)
  from (
    select a.kind, a.item_id, sum(a.qty) as qty
    from (
      select 'good' as kind, l.good_id as item_id, l.quantity as qty
      from merchant.sale_lines l
      join merchant.goods g on g.id = l.good_id
      where l.sale_id = p_sale and not g.is_bundle
      union all
      select case when c.material_id is not null then 'material' else 'good' end,
             coalesce(c.material_id, c.component_good_id), c.quantity * l.quantity
      from merchant.sale_lines l
      join merchant.goods g on g.id = l.good_id
      join merchant.recipe_components c on c.good_id = g.id
      where l.sale_id = p_sale and g.is_bundle
      union all
      select 'material', l.material_id, l.quantity
      from merchant.sale_lines l
      where l.sale_id = p_sale and l.material_id is not null
    ) a
    group by a.kind, a.item_id
    having abs(sum(a.qty)) > 1e-9
  ) s
$$;

-- Previewed crafting during a sale, which no longer happens. sale_post_preview() stays.
drop function merchant.good_sale_preview(uuid, double precision);

-- 2. Money ---------------------------------------------------------------------

-- No commission: receipts pay out nothing per line, all profit stays in the treasury.
alter table merchant.settings alter column employee_profit_share set default 0;
update merchant.settings set employee_profit_share = 0, profit_split_from = '-infinity';

insert into merchant.treasury_categories (name, direction, is_system, sort_order)
values ('Partner payout', 'out', true, 35);

create table merchant.partner_weeks (
  week_start   date primary key check (extract(isodow from week_start) = 1),
  sales_profit double precision not null,
  other_income double precision not null,
  expenses     double precision not null,
  net          double precision not null,
  per_partner  double precision not null,
  closed_at    timestamptz not null default now(),
  closed_by    uuid references merchant.profiles (id) on delete set null
);

create table merchant.partner_shares (
  week_start   date not null references merchant.partner_weeks (week_start) on delete cascade,
  partner_id   uuid not null references merchant.profiles (id),
  partner_name text not null,
  amount       double precision not null,
  primary key (week_start, partner_id)
);

alter table merchant.partner_weeks  enable row level security;
alter table merchant.partner_shares enable row level security;
grant select on merchant.partner_weeks, merchant.partner_shares to merchant_app;
create policy partner_weeks_select on merchant.partner_weeks for select to merchant_app
  using ((select merchant.is_manager()));
create policy partner_shares_select on merchant.partner_shares for select to merchant_app
  using ((select merchant.is_manager()));

-- Who shares right now. Only people who have logged in have a profile.
create function merchant._partners()
returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(p.display_name, p.username, 'Unknown')
  from merchant.profiles p
  where p.role in ('owner', 'manager') and p.in_guild
  order by 2
$$;

-- One week's numbers. Purchases are not expenses: the material cost is already taken off in
-- each sale's profit, so counting them here would charge it twice. Moving gold out to a
-- partner or owner isn't a cost either.
create function merchant._partner_figures(
  p_week date,
  out sales_profit double precision, out other_income double precision,
  out expenses double precision, out net double precision
)
language sql stable security definer set search_path = '' as $$
  with s as (
    select coalesce(sum(net_total - cost_total), 0) as profit
    from merchant.sales
    where status = 'posted' and (sale_date at time zone 'UTC')::date >= p_week
      and (sale_date at time zone 'UTC')::date < p_week + 7
  ), t as (
    select coalesce(sum(money_in) filter (where category not in ('Sales income', 'Deposit')), 0) as income,
           coalesce(sum(money_out) filter (where category not in
             ('Material purchase', 'Goods purchase', 'Withdrawal', 'Partner payout')), 0) as spent
    from merchant.treasury_entries
    where (entry_date at time zone 'UTC')::date >= p_week
      and (entry_date at time zone 'UTC')::date < p_week + 7
  )
  select round(s.profit::numeric, 2)::double precision, t.income, t.spent,
         round((s.profit + t.income - t.spent)::numeric, 2)::double precision
  from s, t
$$;

-- The week as it stands: fixed once closed, a live preview until then.
create function merchant.partner_week(p_week date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  w merchant.partner_weeks;
  f record;
  v_list jsonb;
  v_n int;
begin
  perform merchant._require(merchant.is_manager(), 'the partner split');
  select * into w from merchant.partner_weeks where week_start = p_week;
  if found then
    select jsonb_agg(jsonb_build_object('id', s.partner_id, 'name', s.partner_name, 'amount', s.amount) order by s.partner_name)
      into v_list from merchant.partner_shares s where s.week_start = p_week;
    return jsonb_build_object('week_start', p_week, 'closed', true, 'sales_profit', w.sales_profit,
      'other_income', w.other_income, 'expenses', w.expenses, 'net', w.net,
      'per_partner', w.per_partner, 'partners', coalesce(v_list, '[]'::jsonb));
  end if;
  select * into f from merchant._partner_figures(p_week);
  select count(*) into v_n from merchant._partners();
  select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)) into v_list from merchant._partners() p;
  return jsonb_build_object('week_start', p_week, 'closed', false, 'sales_profit', f.sales_profit,
    'other_income', f.other_income, 'expenses', f.expenses, 'net', f.net,
    'per_partner', case when v_n > 0 then round((f.net / v_n)::numeric, 2)::double precision end,
    'partners', coalesce(v_list, '[]'::jsonb));
end $$;

create function merchant.close_partner_week(p_week date) returns merchant.partner_weeks
language plpgsql security definer set search_path = '' as $$
declare
  f record;
  v_n int;
  v_each double precision;
  w merchant.partner_weeks;
begin
  perform merchant._require(merchant.is_manager(), 'closing a week');
  if extract(isodow from p_week) <> 1 then raise exception 'A week starts on a Monday' using errcode = 'P0001'; end if;
  if p_week + 7 > (now() at time zone 'UTC')::date then
    raise exception 'This week is not over yet' using errcode = 'P0001';
  end if;
  if exists (select 1 from merchant.partner_weeks where week_start = p_week) then
    raise exception 'This week is already closed' using errcode = 'P0001';
  end if;
  select count(*) into v_n from merchant._partners();
  if v_n = 0 then raise exception 'There is no Owner or Manager to share with' using errcode = 'P0001'; end if;

  select * into f from merchant._partner_figures(p_week);
  v_each := round((f.net / v_n)::numeric, 2)::double precision;
  insert into merchant.partner_weeks (week_start, sales_profit, other_income, expenses, net, per_partner, closed_by)
  values (p_week, f.sales_profit, f.other_income, f.expenses, f.net, v_each, merchant_auth.uid())
  returning * into w;
  insert into merchant.partner_shares (week_start, partner_id, partner_name, amount)
  select p_week, p.id, p.name, v_each from merchant._partners() p;
  return w;
end $$;

-- For bookings that came in late: the Owner reopens the week, then it is closed again.
create function merchant.reopen_partner_week(p_week date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform merchant._require(merchant.is_owner(), 'reopening a week');
  delete from merchant.partner_weeks where week_start = p_week;
  if not found then raise exception 'This week is not closed' using errcode = 'P0001'; end if;
end $$;

-- A negative week lowers the balance: positive = the company owes the partner.
create function merchant.partner_balances()
returns table (partner_id uuid, name text, earned double precision, paid double precision, balance double precision)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform merchant._require(merchant.is_manager(), 'the partner split');
  return query
  with e as (
    select s.partner_id as pid, max(s.partner_name) as pname, sum(s.amount) as amount
    from merchant.partner_shares s group by s.partner_id
  ), o as (
    select t.beneficiary_id as pid, sum(t.money_out) as amount
    from merchant.treasury_entries t
    where t.category = 'Partner payout' and t.beneficiary_id is not null
    group by t.beneficiary_id
  )
  select coalesce(e.pid, o.pid), coalesce(e.pname, p.display_name, p.username, 'Unknown'),
         round(coalesce(e.amount, 0)::numeric, 2)::double precision,
         round(coalesce(o.amount, 0)::numeric, 2)::double precision,
         round((coalesce(e.amount, 0) - coalesce(o.amount, 0))::numeric, 2)::double precision
  from e
  full join o on o.pid = e.pid
  left join merchant.profiles p on p.id = coalesce(e.pid, o.pid)
  order by 2;
end $$;

create function merchant.pay_partner(p_partner uuid, p_amount double precision, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  perform merchant._require(merchant.is_manager(), 'paying a partner');
  if coalesce(p_amount, 0) <= 0 then raise exception 'The amount must be above zero' using errcode = 'P0001'; end if;
  select coalesce(display_name, username, 'Unknown') into v_name from merchant.profiles where id = p_partner;
  if not found then raise exception 'Partner not found' using errcode = 'P0001'; end if;
  perform merchant._book('Partner payout', 0, p_amount,
    'Payout to ' || v_name || coalesce(' — ' || nullif(btrim(p_note), ''), ''), 'partner_payout', p_partner, p_partner);
end $$;

revoke execute on function
  merchant._partners(), merchant._partner_figures(date), merchant.partner_week(date),
  merchant.close_partner_week(date), merchant.reopen_partner_week(date),
  merchant.partner_balances(), merchant.pay_partner(uuid, double precision, text)
from public, merchant_app;
grant execute on function
  merchant.partner_week(date), merchant.close_partner_week(date), merchant.reopen_partner_week(date),
  merchant.partner_balances(), merchant.pay_partner(uuid, double precision, text)
to merchant_app;
