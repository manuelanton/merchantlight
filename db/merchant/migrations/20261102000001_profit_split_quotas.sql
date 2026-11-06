-- 2026-11-02 (owner):
-- 1. New payout split for receipts created from now on: the PROFIT (sale after discount −
--    material cost) is split — employee 37.5 %, merchant 62.5 %. Example: cost 100, sold for 120 →
--    profit 20 → employee 7.5, merchant 12.5. Older receipts keep the old rule (price − cost − 10 % of
--    the price), also when they are reopened and posted again.
-- 2. Quotas: novice (Discord "Apprentice") and advanced ("Employee") employees are paid a fixed rate
--    per piece for crafting certain goods (ingots, repair kits…), with an optional weekly target.
--    Quota pay is part of the weekly payout (Friday → Thursday) next to the sales payout.

-- 1. Profit split ---------------------------------------------------------------------------
alter table merchant.settings
  add column if not exists employee_profit_share double precision not null default 0.375
    check (employee_profit_share between 0 and 1),
  add column if not exists profit_split_from timestamptz not null default now();
comment on column merchant.settings.employee_profit_share is 'Share of a receipt''s profit (sale − material cost) the employee gets; the merchant keeps the rest. Receipts created before profit_split_from use company_share (of the sale price) instead.';
grant update (employee_profit_share) on merchant.settings to merchant_app;

alter table merchant.sales add column if not exists employee_share double precision;
comment on column merchant.sales.employee_share is 'Snapshot at posting: employee share of the profit (new rule). Null = old rule (company_share of the sale price).';

-- Rule for one receipt: new split for receipts created from the switch on.
create or replace function merchant._payout_rule(p_created timestamptz, out company_share double precision, out employee_share double precision)
language sql stable set search_path = '' as $$
  select case when p_created >= st.profit_split_from then null else st.company_share end,
         case when p_created >= st.profit_split_from then st.employee_profit_share end
  from merchant.settings st where st.id = 1
$$;

create or replace function merchant._line_payout(
  p_net double precision, p_cost double precision, p_company_share double precision, p_employee_share double precision
) returns double precision
language sql immutable set search_path = '' as $$
  select case when p_employee_share is not null
              then round((greatest(p_net - coalesce(p_cost, 0), 0) * p_employee_share)::numeric, 2)::double precision
              else merchant._employee_commission(p_net, p_cost, coalesce(p_company_share, 0)) end
$$;

create or replace function merchant.sale_post_preview(p_sale uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s merchant.sales;
  v_sub   double precision;
  v_net   double precision;
  v_cost  double precision;
  r       record;
  v_comm  double precision;
  v_details jsonb;
begin
  select * into s from merchant.sales where id = p_sale;
  if not found then raise exception 'Receipt not found'; end if;
  perform merchant._require(merchant._can_edit_sale(s), 'posting this receipt');

  select coalesce(sum(l.quantity * l.unit_price), 0) into v_sub from merchant.sale_lines l where l.sale_id = p_sale;
  v_net := greatest(v_sub - s.discount, 0);
  select * into r from merchant._payout_rule(s.created_at);
  -- per line, like post_sale (discount spread by value)
  select coalesce(sum(merchant._sale_line_cost(l) * l.quantity) filter (where l.good_id is not null or l.material_id is not null), 0),
         coalesce(sum(merchant._line_payout(
           case when v_sub > 0 then l.quantity * l.unit_price * v_net / v_sub else 0 end,
           l.quantity * merchant._sale_line_cost(l), r.company_share, r.employee_share)), 0)
    into v_cost, v_comm
  from merchant.sale_lines l where l.sale_id = p_sale;
  v_details := merchant._plan_details(merchant._sale_plan(p_sale));
  return jsonb_build_object(
    'subtotal', v_sub,
    'discount', s.discount,
    'net_total', v_net,
    'cost_total', v_cost,
    'profit', v_net - v_cost,
    'tip', s.tip,
    'company_share', r.company_share,
    'employee_share', r.employee_share,
    'merchant_keep', round((v_net - v_cost - v_comm)::numeric, 2)::double precision,
    'commission_amount', v_comm,
    'merchant_amount', v_net - v_cost - v_comm,
    'ok', merchant._missing_text(v_details) is null,
    'missing_text', merchant._missing_text(v_details),
    'lines', v_details);
end $$;

create or replace function merchant.post_sale(p_sale uuid)
returns merchant.sales
language plpgsql security definer set search_path = '' as $$
declare
  s        merchant.sales;
  v_sub    double precision;
  v_net    double precision;
  v_cost   double precision;
  r        record;
  v_comm   double precision;
  v_label  text;
begin
  select * into s from merchant.sales where id = p_sale for update;
  if not found then raise exception 'Receipt not found'; end if;
  perform merchant._require(merchant._can_edit_sale(s), 'posting this receipt');
  if s.status <> 'draft' then raise exception 'Receipt #% is already posted', s.receipt_no; end if;
  if not exists (select 1 from merchant.sale_lines where sale_id = p_sale) then
    raise exception 'Receipt #% has no lines', s.receipt_no using errcode = 'P0001';
  end if;
  if exists (select 1 from merchant.sale_lines where sale_id = p_sale and good_id is null and material_id is null) then
    raise exception 'Receipt #% references a deleted item', s.receipt_no using errcode = 'P0001';
  end if;

  select sum(quantity * unit_price) into v_sub from merchant.sale_lines where sale_id = p_sale;
  if s.discount > v_sub + 1e-9 then
    raise exception 'Discount (%) exceeds subtotal (%)', s.discount, v_sub using errcode = 'P0001';
  end if;
  v_net := round((v_sub - s.discount)::numeric, 2)::double precision;
  v_label := format('Receipt #%s', s.receipt_no);
  select * into r from merchant._payout_rule(s.created_at);

  update merchant.sale_lines l set unit_cost = merchant._sale_line_cost(l) where l.sale_id = p_sale;
  select coalesce(sum(quantity * unit_cost), 0) into v_cost from merchant.sale_lines where sale_id = p_sale;

  -- Payout per line (discount spread over the lines by value), credited to whoever crafted it.
  update merchant.sale_lines l
  set payout = merchant._line_payout(
                 case when v_sub > 0 then l.quantity * l.unit_price * v_net / v_sub else 0 end,
                 l.quantity * l.unit_cost, r.company_share, r.employee_share)
  where l.sale_id = p_sale;
  select coalesce(sum(payout), 0) into v_comm from merchant.sale_lines where sale_id = p_sale;

  perform merchant._execute_plan(merchant._sale_plan(p_sale), 'Sale', v_label, 'sale', p_sale);

  perform merchant._book('Sales income', v_net, 0,
    v_label || coalesce(' — ' || nullif(btrim(s.customer), ''), ''), 'sale', p_sale, null, s.sale_date);

  update merchant.sales set
    status = 'posted', subtotal = v_sub, net_total = v_net, cost_total = v_cost,
    company_share = r.company_share, employee_share = r.employee_share, commission_amount = v_comm,
    posted_at = now(), posted_by = merchant_auth.uid()
  where id = p_sale
  returning * into s;
  return s;
end $$;

create or replace function merchant.unpost_sale(p_sale uuid)
returns merchant.sales
language plpgsql security definer set search_path = '' as $$
declare s merchant.sales;
begin
  select * into s from merchant.sales where id = p_sale for update;
  if not found then raise exception 'Receipt not found'; end if;
  perform merchant._require(merchant._can_edit_sale(s), 'editing this receipt');
  if s.status <> 'posted' then raise exception 'Receipt #% is not posted', s.receipt_no; end if;

  perform merchant._reverse_ref('sale', p_sale, format('Receipt #%s reopened for editing', s.receipt_no));
  update merchant.sale_lines set unit_cost = null, payout = null where sale_id = p_sale;
  update merchant.sales set
    status = 'draft', subtotal = null, net_total = null, cost_total = null,
    company_share = null, employee_share = null, commission_amount = null, posted_at = null, posted_by = null
  where id = p_sale
  returning * into s;
  return s;
end $$;

-- 2. Ranks --------------------------------------------------------------------------------
-- Set by the Discord sync (Apprentice → novice, Employee → advanced); the Owner can set it
-- by hand until the person's next sync.
alter table merchant.profiles add column if not exists rank text check (rank in ('novice', 'advanced'));

create or replace function merchant.set_rank(p_user uuid, p_rank text)
returns merchant.profiles
language plpgsql security definer set search_path = '' as $$
declare v merchant.profiles;
begin
  perform merchant._require(merchant.is_owner(), 'changing ranks');
  if p_rank is not null and p_rank not in ('novice', 'advanced') then raise exception 'Rank must be novice or advanced'; end if;
  update merchant.profiles set rank = p_rank where id = p_user returning * into v;
  if v.id is null then raise exception 'Person not found'; end if;
  return v;
end $$;

-- 3. Quota items ----------------------------------------------------------------------------
create table if not exists merchant.quota_items (
  good_id        uuid primary key references merchant.goods (id) on delete cascade,
  rate           double precision not null default 0 check (rate >= 0),
  weekly_target  double precision check (weekly_target is null or weekly_target > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table merchant.quota_items enable row level security;
grant select on merchant.quota_items to merchant_app;
grant insert (good_id, rate, weekly_target), update (rate, weekly_target), delete on merchant.quota_items to merchant_app;
create policy quota_items_select on merchant.quota_items for select to merchant_app using (merchant.is_staff());
create policy quota_items_insert on merchant.quota_items for insert to merchant_app with check (merchant.is_manager());
create policy quota_items_update on merchant.quota_items for update to merchant_app using (merchant.is_manager()) with check (merchant.is_manager());
create policy quota_items_delete on merchant.quota_items for delete to merchant_app using (merchant.is_manager());
create or replace function merchant._touch_quota_item() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists quota_items_touch on merchant.quota_items;
create trigger quota_items_touch before update on merchant.quota_items for each row execute function merchant._touch_quota_item();

-- Quota pay per craft: crafts of quota goods by novice/advanced employees × the current rate.
create or replace function merchant._quota_credits()
returns table (pid uuid, amount double precision, craft_id uuid, crafted_at timestamptz, good_id uuid, qty double precision)
language sql stable set search_path = '' as $$
  select c.created_by, c.quantity * q.rate, c.id, c.created_at, c.good_id, c.quantity
  from merchant.crafts c
  join merchant.quota_items q on q.good_id = c.good_id
  join merchant.profiles p on p.id = c.created_by
  where p.rank is not null
$$;
revoke execute on function merchant._quota_credits() from public, merchant_app;

-- One week of quotas: every ranked employee × every quota item, crafted vs target.
create or replace function merchant.quota_week(p_week date, p_tz text default 'UTC')
returns table (person_id uuid, name text, rank text, good_id uuid, good_name text,
               rate double precision, weekly_target double precision, crafted double precision, earned double precision)
language sql stable security definer set search_path = '' as $$
  with c as (
    select q.pid, q.good_id, sum(q.qty) as crafted
    from merchant._quota_credits() q
    where q.crafted_at >= (p_week::timestamp at time zone p_tz)
      and q.crafted_at < ((p_week + 7)::timestamp at time zone p_tz)
    group by q.pid, q.good_id
  )
  select p.id, coalesce(p.display_name, p.username), p.rank, g.id, g.name,
         qi.rate, qi.weekly_target, coalesce(c.crafted, 0),
         round((coalesce(c.crafted, 0) * qi.rate)::numeric, 2)::double precision
  from merchant.profiles p
  cross join merchant.quota_items qi
  join merchant.goods g on g.id = qi.good_id
  left join c on c.pid = p.id and c.good_id = qi.good_id
  where p.rank is not null
    and (merchant.is_manager() or (merchant.is_staff() and p.id = merchant_auth.uid()))
  order by 2, 5
$$;

-- 4. Payouts include quota pay ----------------------------------------------------------------
drop function if exists merchant.payout_week(date, text);
create function merchant.payout_week(p_week date, p_tz text default 'UTC')
returns table (person_id uuid, name text, earned double precision, paid double precision,
               owed double precision, settled boolean, receipts bigint, last_paid_at timestamptz,
               sales_earned double precision, quota_earned double precision)
language sql stable security definer set search_path = '' as $$
  with s as (
    select c.pid, sum(c.amount) as amount, count(distinct c.sale_id) as receipts
    from merchant._payout_credits() c
    where c.sale_date >= (p_week::timestamp at time zone p_tz)
      and c.sale_date < ((p_week + 7)::timestamp at time zone p_tz)
    group by c.pid
  ), q as (
    select c.pid, sum(c.amount) as amount
    from merchant._quota_credits() c
    where c.crafted_at >= (p_week::timestamp at time zone p_tz)
      and c.crafted_at < ((p_week + 7)::timestamp at time zone p_tz)
    group by c.pid
    having sum(c.amount) > 0
  ), pd as (
    select beneficiary_id as pid, sum(money_out) as paid, max(entry_date) as last_paid_at
    from merchant.treasury_entries
    where ref_type = 'payout' and payout_week = p_week and beneficiary_id is not null
    group by beneficiary_id
  ), e as (
    select p.id as pid,
           round(coalesce(s.amount, 0)::numeric, 2)::double precision as sales_earned,
           round(coalesce(q.amount, 0)::numeric, 2)::double precision as quota_earned,
           coalesce(s.receipts, 0) as receipts,
           s.pid is not null or q.pid is not null as has_earned
    from merchant.profiles p left join s on s.pid = p.id left join q on q.pid = p.id
  )
  select p.id, coalesce(p.display_name, p.username),
         e.sales_earned + e.quota_earned,
         coalesce(pd.paid, 0),
         case when pd.pid is not null then 0 else e.sales_earned + e.quota_earned end,
         pd.pid is not null, e.receipts, pd.last_paid_at,
         e.sales_earned, e.quota_earned
  from merchant.profiles p
  join e on e.pid = p.id
  left join pd on pd.pid = p.id
  where (e.has_earned or pd.pid is not null)
    and (merchant.is_manager() or (merchant.is_staff() and p.id = merchant_auth.uid()))
  order by 5 desc, 3 desc, 2
$$;

create or replace function merchant.payout_weeks(p_tz text default 'UTC', p_limit int default 26)
returns table (week date, earned double precision, paid double precision, owed double precision, unpaid int)
language sql stable security definer set search_path = '' as $$
  with x as (
    select c.pid, merchant._week_start(c.sale_date, p_tz) as wk, c.amount as earned, 0::double precision as paid, 0 as n
    from merchant._payout_credits() c
    union all
    select c.pid, merchant._week_start(c.crafted_at, p_tz), c.amount, 0, 0
    from merchant._quota_credits() c
    union all
    select beneficiary_id, payout_week, 0, money_out, 1
    from merchant.treasury_entries
    where ref_type = 'payout' and payout_week is not null and beneficiary_id is not null
  ), per as (
    select pid, wk, sum(earned) as earned, sum(paid) as paid, sum(n) as n
    from x
    where merchant.is_manager() or (merchant.is_staff() and pid = merchant_auth.uid())
    group by pid, wk
  )
  select wk,
         round(sum(earned)::numeric, 2)::double precision,
         round(sum(paid)::numeric, 2)::double precision,
         round(sum(case when n > 0 then 0 else earned end)::numeric, 2)::double precision,
         (count(*) filter (where n = 0 and earned > 0))::int
  from per
  group by wk
  order by wk desc
  limit p_limit
$$;

revoke execute on function merchant._payout_rule(timestamptz), merchant._line_payout(double precision, double precision, double precision, double precision)
  from public, merchant_app;
revoke execute on function merchant.set_rank(uuid, text), merchant.quota_week(date, text), merchant.payout_week(date, text) from public;
grant execute on function merchant.set_rank(uuid, text), merchant.quota_week(date, text), merchant.payout_week(date, text) to merchant_app;
